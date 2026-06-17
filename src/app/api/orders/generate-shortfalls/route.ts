import { route, ok } from "@/lib/http";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { reorderQty } from "@/lib/utils";
import { logActivity } from "@/lib/audit";

// POST /api/orders/generate-shortfalls
//   Materialize current stock shortfalls into OrderRequest rows
//   (source STOCK_SHORTFALL, status REQUESTED) for items that are below their
//   desired level AND don't already have an open request. Idempotent: running
//   it twice won't create duplicates because items with an open request are
//   skipped.
export const POST = route(async () => {
  const user = await requirePermission("orders.setDesired");

  // Items with a desired target above zero.
  const items = await prisma.item.findMany({
    where: { desiredQuantity: { gt: 0 } },
    select: {
      id: true,
      quantity: true,
      desiredQuantity: true,
      purchaseCost: true,
      supplierId: true,
    },
  });

  // Item ids that already have an open request (don't duplicate).
  const openRows = await prisma.orderRequest.findMany({
    where: {
      itemId: { not: null },
      status: { in: ["REQUESTED", "APPROVED", "ORDERED"] },
    },
    select: { itemId: true },
  });
  const openItemIds = new Set(openRows.map((r) => r.itemId).filter(Boolean) as string[]);

  // Build the rows to create.
  const toCreate = items
    .map((it) => ({ it, needed: reorderQty(it.quantity, it.desiredQuantity) }))
    .filter(({ it, needed }) => needed > 0 && !openItemIds.has(it.id));

  if (toCreate.length === 0) {
    return ok({ created: 0 });
  }

  // New rows go to the top of the manual order.
  const min = await prisma.orderRequest.aggregate({ _min: { sortOrder: true } });
  let nextSort = (min._min.sortOrder ?? 0) - 1;

  await prisma.$transaction(
    toCreate.map(({ it, needed }) =>
      prisma.orderRequest.create({
        data: {
          itemId: it.id,
          supplierId: it.supplierId ?? null,
          quantity: needed,
          unitCost: it.purchaseCost,
          status: "REQUESTED",
          source: "STOCK_SHORTFALL",
          requestedById: user.id,
          sortOrder: nextSort--,
        },
      }),
    ),
  );

  await logActivity({
    userId: user.id,
    action: "order.generateShortfalls",
    entity: "OrderRequest",
    meta: { created: toCreate.length },
  });

  return ok({ created: toCreate.length });
});
