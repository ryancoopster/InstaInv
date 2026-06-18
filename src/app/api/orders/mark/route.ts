import { route, ok, fail } from "@/lib/http";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/audit";
import { refreshLocationSummaries } from "@/lib/summary";
import { buildPurchaseData } from "@/lib/purchases";
import { isAllowedTransition } from "@/lib/orders/transitions";
import { z } from "zod";

// PATCH /api/orders/mark
//   Bulk status transition for a set of OrderRequest ids — used by the buy
//   list's "Mark supplier group ordered / received" buttons.
//   Permission: orders.markOrdered.
const schema = z.object({
  ids: z.array(z.string().min(1)).min(1),
  status: z.enum(["ORDERED", "RECEIVED"]),
  // When marking RECEIVED, also add each existing item's qty to on-hand stock.
  applyToStock: z.boolean().optional(),
});

export const PATCH = route(async (req: Request) => {
  const user = await requirePermission("orders.markOrdered");
  const { ids, status, applyToStock } = schema.parse(await req.json());

  const requests = await prisma.orderRequest.findMany({
    where: { id: { in: ids } },
    include: {
      item: { select: { id: true, name: true, partNumber: true, purchaseCost: true, drawerId: true } },
      supplier: { select: { name: true } },
    },
  });
  if (requests.length === 0) return fail("No matching requests", 404);

  const now = new Date();
  const drawerIds = new Set<string>();
  let changed = 0;

  await prisma.$transaction(async (tx) => {
    for (const r of requests) {
      // F6: skip rows already in the target status so timestamps aren't re-stamped
      // and the reported count reflects rows that actually transitioned.
      if (r.status === status) continue;
      // F2: enforce the state machine — only legal predecessors may be marked,
      // so e.g. a REJECTED row can't be marked RECEIVED and fabricate stock.
      if (!isAllowedTransition(r.status, status)) continue;

      const data: Record<string, unknown> = { status };
      if (status === "ORDERED") {
        data.orderedAt = now;
        await tx.orderRequest.update({ where: { id: r.id }, data });
        changed++;
      } else {
        data.receivedAt = now;
        if (!r.orderedAt) data.orderedAt = now;
        // F1 / PURCH-1: atomic guarded transition. Only the call that actually
        // flips ORDERED/APPROVED -> RECEIVED (count === 1) applies stock and writes
        // a Purchase, so this path can't double-apply when racing requests/[id] or
        // a concurrent bulk mark on the same id.
        const res = await tx.orderRequest.updateMany({
          where: { id: r.id, status: { not: "RECEIVED" } },
          data,
        });
        if (res.count !== 1) continue;
        changed++;
        const appliedStock = Boolean(applyToStock && r.itemId);
        // Apply stock once, only for existing items.
        if (appliedStock && r.itemId) {
          await tx.item.update({
            where: { id: r.itemId },
            data: { quantity: { increment: r.quantity } },
          });
          if (r.item?.drawerId) drawerIds.add(r.item.drawerId);
        }
        // Record a purchase on first receipt (linked or free-text).
        await tx.purchase.create({ data: buildPurchaseData(r, user.id, appliedStock) });
      }
    }
  });

  // Refresh affected drawer/box summaries after stock changes.
  // PURCH-2: a refresh failure must not 500 an already-committed receive.
  try {
    for (const drawerId of drawerIds) {
      await refreshLocationSummaries(drawerId);
    }
  } catch (e) {
    console.error("[mark] summary refresh failed", e);
  }

  await logActivity({
    userId: user.id,
    action: `order.mark.${status.toLowerCase()}`,
    entity: "OrderRequest",
    // F6: report rows actually transitioned, not just matched ids.
    meta: { count: changed, matched: requests.length, applyToStock: Boolean(applyToStock) },
  });

  // F6: surface both the real change count and the matched/skipped breakdown so the
  // client can distinguish a no-op from a real update and detect bogus ids.
  return ok({ updated: changed, matched: requests.length, skipped: ids.length - changed });
});
