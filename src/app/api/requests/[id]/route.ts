import { route, ok, fail } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/audit";
import { refreshLocationSummaries } from "@/lib/summary";
import { buildPurchaseData } from "@/lib/purchases";
import { enqueueDecision } from "@/lib/notifications/service";
import { z } from "zod";
import { serializeRequest, requestInclude } from "@/components/orders/serialize";

type Ctx = { params: { id: string } };

// Each status transition requires a specific permission:
//   APPROVED / REJECTED -> orders.approve
//   ORDERED / RECEIVED  -> orders.markOrdered
//   REQUESTED (reopen)  -> orders.approve
const TRANSITION_PERMISSION = {
  APPROVED: "orders.approve",
  REJECTED: "orders.approve",
  REQUESTED: "orders.approve",
  ORDERED: "orders.markOrdered",
  RECEIVED: "orders.markOrdered",
} as const;

const patchSchema = z.object({
  status: z.enum(["REQUESTED", "APPROVED", "ORDERED", "RECEIVED", "REJECTED"]).optional(),
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
      case "REQUESTED":
        // Reopen: clear downstream timestamps.
        data.approvedById = null;
        data.approvedAt = null;
        data.orderedAt = null;
        data.receivedAt = null;
        break;
    }
  }

  if (body.unitCost !== undefined) data.unitCost = body.unitCost;
  if (body.quantity !== undefined) data.quantity = body.quantity;
  if (body.supplierId !== undefined) data.supplierId = body.supplierId;
  if (body.note !== undefined) data.note = body.note || null;

  // On RECEIVED of an existing item, optionally increment on-hand stock.
  const shouldApplyStock =
    body.status === "RECEIVED" &&
    body.applyToStock &&
    existing.itemId &&
    existing.status !== "RECEIVED"; // never double-apply

  // Record a purchase whenever the request first reaches RECEIVED ("bought"),
  // whether or not stock is applied and whether or not it's a linked item.
  const shouldRecordPurchase = body.status === "RECEIVED" && existing.status !== "RECEIVED";

  const updated = await prisma.$transaction(async (tx) => {
    if (shouldApplyStock && existing.itemId) {
      await tx.item.update({
        where: { id: existing.itemId },
        data: { quantity: { increment: existing.quantity } },
      });
    }
    if (shouldRecordPurchase) {
      await tx.purchase.create({
        data: buildPurchaseData(existing, user.id, Boolean(shouldApplyStock)),
      });
    }
    return tx.orderRequest.update({
      where: { id: params.id },
      data,
      include: requestInclude,
    });
  });

  // Keep drawer/box summaries in sync if stock changed.
  if (shouldApplyStock && existing.item?.drawerId) {
    await refreshLocationSummaries(existing.item.drawerId);
  }

  await logActivity({
    userId: user.id,
    action: body.status ? `order.${body.status.toLowerCase()}` : "order.update",
    entity: "OrderRequest",
    entityId: updated.id,
    meta: { status: updated.status, appliedToStock: shouldApplyStock },
  });

  // Queue a digest notification to the requester on approve/deny.
  if ((body.status === "APPROVED" || body.status === "REJECTED") && existing.requestedById) {
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
