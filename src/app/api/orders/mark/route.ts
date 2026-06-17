import { route, ok, fail } from "@/lib/http";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/audit";
import { refreshLocationSummaries } from "@/lib/summary";
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
    include: { item: { select: { id: true, drawerId: true } } },
  });
  if (requests.length === 0) return fail("No matching requests", 404);

  const now = new Date();
  const drawerIds = new Set<string>();

  await prisma.$transaction(async (tx) => {
    for (const r of requests) {
      const data: Record<string, unknown> = { status };
      if (status === "ORDERED") {
        data.orderedAt = now;
      } else {
        data.receivedAt = now;
        if (!r.orderedAt) data.orderedAt = now;
        // Apply stock once, only for existing items not already received.
        if (applyToStock && r.itemId && r.status !== "RECEIVED") {
          await tx.item.update({
            where: { id: r.itemId },
            data: { quantity: { increment: r.quantity } },
          });
          if (r.item?.drawerId) drawerIds.add(r.item.drawerId);
        }
      }
      await tx.orderRequest.update({ where: { id: r.id }, data });
    }
  });

  // Refresh affected drawer/box summaries after stock changes.
  for (const drawerId of drawerIds) {
    await refreshLocationSummaries(drawerId);
  }

  await logActivity({
    userId: user.id,
    action: `order.mark.${status.toLowerCase()}`,
    entity: "OrderRequest",
    meta: { count: requests.length, applyToStock: Boolean(applyToStock) },
  });

  return ok({ updated: requests.length });
});
