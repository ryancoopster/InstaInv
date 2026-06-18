import { route, ok, fail } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/audit";
import { refreshLocationSummaries } from "@/lib/summary";
import { buildPurchaseData } from "@/lib/purchases";
import { isAllowedTransition } from "@/lib/orders/transitions";
import { enqueueDecision } from "@/lib/notifications/service";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { serializeRequest, requestInclude } from "@/components/orders/serialize";

type Ctx = { params: { id: string } };

// Each status transition requires a specific permission:
//   APPROVED / REJECTED -> orders.approve
//   ORDERED / RECEIVED  -> orders.markOrdered
// F5: REQUESTED (reopen) is intentionally not a valid PATCH target — there is no
// reverse-stock / Purchase-void semantics and no UI emits it, so allowing it only
// risked double-applying stock on a re-receive.
const TRANSITION_PERMISSION = {
  APPROVED: "orders.approve",
  REJECTED: "orders.approve",
  ORDERED: "orders.markOrdered",
  RECEIVED: "orders.markOrdered",
} as const;

const patchSchema = z.object({
  status: z.enum(["APPROVED", "ORDERED", "RECEIVED", "REJECTED"]).optional(),
  // When marking an existing item RECEIVED, optionally add the qty to stock.
  applyToStock: z.boolean().optional(),
  // Allow approvers to set/adjust the unit cost while reviewing.
  unitCost: z.coerce.number().min(0).optional(),
  quantity: z.coerce.number().int().min(1).optional(),
  supplierId: z.string().min(1).nullable().optional(),
  note: z.string().trim().optional(),
});

// PATCH /api/requests/[id] — status transitions + light field edits.
export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const body = patchSchema.parse(await req.json());

  const existing = await prisma.orderRequest.findUnique({
    where: { id: params.id },
    include: {
      item: { select: { id: true, name: true, partNumber: true, purchaseCost: true, drawerId: true } },
      supplier: { select: { name: true } },
    },
  });
  if (!existing) return fail("Request not found", 404);

  // Guard the status transition by its required permission.
  if (body.status) {
    const needed = TRANSITION_PERMISSION[body.status];
    if (!hasPermission(user, needed)) {
      return fail("You do not have permission", 403);
    }
    // F2: enforce the state machine — permission-by-target alone would let e.g. a
    // REJECTED row jump straight to RECEIVED, fabricating stock and a Purchase.
    if (body.status !== existing.status && !isAllowedTransition(existing.status, body.status)) {
      return fail(`Cannot transition from ${existing.status} to ${body.status}`, 409);
    }
  }

  // Field edits (cost/qty/supplier/note) require approve rights, except the owner
  // may edit their own still-pending request.
  const editsFields =
    body.unitCost !== undefined ||
    body.quantity !== undefined ||
    body.supplierId !== undefined ||
    body.note !== undefined;
  if (editsFields) {
    const isOwnerPending =
      existing.requestedById === user.id && existing.status === "REQUESTED";
    if (!isOwnerPending && !hasPermission(user, "orders.approve")) {
      return fail("You do not have permission", 403);
    }
  }

  const data: Record<string, unknown> = {};
  const now = new Date();

  if (body.status) {
    data.status = body.status;
    switch (body.status) {
      case "APPROVED":
        data.approvedById = user.id;
        data.approvedAt = now;
        break;
      case "REJECTED":
        data.approvedById = user.id;
        data.approvedAt = now;
        break;
      case "ORDERED":
        data.orderedAt = now;
        break;
      case "RECEIVED":
        data.receivedAt = now;
        if (!existing.orderedAt) data.orderedAt = now;
        break;
    }
  }

  if (body.unitCost !== undefined) data.unitCost = body.unitCost;
  if (body.quantity !== undefined) data.quantity = body.quantity;
  if (body.supplierId !== undefined) data.supplierId = body.supplierId;
  if (body.note !== undefined) data.note = body.note || null;

  // PURCH-3: the stock increment and the Purchase row must reflect the values this
  // PATCH ends up with, not the pre-edit row — a combined {status:RECEIVED, quantity,
  // unitCost} would otherwise snapshot stale numbers into the ledger.
  const effectiveQuantity = body.quantity ?? existing.quantity;
  const effectiveUnitCost =
    body.unitCost !== undefined ? new Prisma.Decimal(body.unitCost) : existing.unitCost;

  // On RECEIVED of an existing item, optionally increment on-hand stock.
  const shouldApplyStock =
    body.status === "RECEIVED" &&
    body.applyToStock &&
    existing.itemId &&
    existing.status !== "RECEIVED"; // never double-apply

  // Record a purchase whenever the request first reaches RECEIVED ("bought"),
  // whether or not stock is applied and whether or not it's a linked item.
  const isFirstReceive = body.status === "RECEIVED" && existing.status !== "RECEIVED";

  let appliedStock = false;
  const updated = await prisma.$transaction(async (tx) => {
    // F1 / PURCH-1: make the receive atomic. Gate the RECEIVED transition on the
    // current status via a conditional updateMany so two concurrent receives (a
    // double-click, or this route racing the bulk /orders/mark) can't both pass a
    // stale guard and double-apply stock + insert a duplicate Purchase. Only the
    // request that actually flips the row (count === 1) runs the side effects.
    if (isFirstReceive) {
      const res = await tx.orderRequest.updateMany({
        where: { id: params.id, status: { not: "RECEIVED" } },
        data,
      });
      if (res.count === 1) {
        appliedStock = Boolean(shouldApplyStock);
        if (shouldApplyStock && existing.itemId) {
          await tx.item.update({
            where: { id: existing.itemId },
            data: { quantity: { increment: effectiveQuantity } },
          });
        }
        await tx.purchase.create({
          data: buildPurchaseData(
            { ...existing, quantity: effectiveQuantity, unitCost: effectiveUnitCost },
            user.id,
            appliedStock,
          ),
        });
      }
      // updateMany returns no row — re-fetch for the response (also reflects the
      // winning concurrent write if this request lost the race).
      const row = await tx.orderRequest.findUnique({
        where: { id: params.id },
        include: requestInclude,
      });
      if (!row) throw new Error("Request vanished mid-transaction");
      return row;
    }

    return tx.orderRequest.update({
      where: { id: params.id },
      data,
      include: requestInclude,
    });
  });

  // Keep drawer/box summaries in sync if stock changed.
  // PURCH-2: a refresh failure must not 500 an already-committed receive.
  if (appliedStock && existing.item?.drawerId) {
    try {
      await refreshLocationSummaries(existing.item.drawerId);
    } catch (e) {
      console.error("[requests] summary refresh failed", e);
    }
  }

  await logActivity({
    userId: user.id,
    action: body.status ? `order.${body.status.toLowerCase()}` : "order.update",
    entity: "OrderRequest",
    entityId: updated.id,
    meta: { status: updated.status, appliedToStock: appliedStock },
  });

  // Queue a digest notification to the requester on approve/deny.
  // NOTIF-4: only enqueue when the status actually transitions INTO the decision
  // state (not on an idempotent re-PATCH / double-click), mirroring the prior-state
  // guards used for stock/purchase.
  // NOTIF-5: don't notify the requester about their own approve/deny action.
  if (
    (body.status === "APPROVED" || body.status === "REJECTED") &&
    existing.status !== body.status &&
    existing.requestedById &&
    existing.requestedById !== user.id
  ) {
    void enqueueDecision(existing.requestedById, params.id, body.status);
  }

  return ok(serializeRequest(updated));
});

// DELETE /api/requests/[id] — owner of a pending request, or an approver, may delete.
export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const existing = await prisma.orderRequest.findUnique({
    where: { id: params.id },
    select: { id: true, requestedById: true, status: true },
  });
  if (!existing) return fail("Request not found", 404);

  const isOwnerPending =
    existing.requestedById === user.id && existing.status === "REQUESTED";
  if (!isOwnerPending && !hasPermission(user, "orders.approve")) {
    return fail("You do not have permission", 403);
  }

  await prisma.orderRequest.delete({ where: { id: params.id } });
  await logActivity({
    userId: user.id,
    action: "order.delete",
    entity: "OrderRequest",
    entityId: params.id,
  });
  return ok({ id: params.id });
});
