import { route, ok } from "@/lib/http";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { reorderQty } from "@/lib/utils";
import { logActivity } from "@/lib/audit";
import { Prisma } from "@prisma/client";

// POST /api/orders/generate-shortfalls
//   Materialize current stock shortfalls into OrderRequest rows
//   (source STOCK_SHORTFALL, status REQUESTED) for items that are below their
//   desired level AND don't already have an open request. Idempotent: the
//   open-request pre-check is best-effort, so the partial unique index
//   OrderRequest_open_item_unique is the real backstop — a concurrent generate /
//   manual add that already opened a request makes our insert fail with P2002,
//   which we skip per-item (DM-7).
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

  // DM-7: insert per-item and swallow P2002 (the OrderRequest_open_item_unique
  // partial index firing) so a row that another request opened concurrently is
  // skipped gracefully instead of 500-ing the whole batch.
  let created = 0;
  for (const { it, needed } of toCreate) {
    try {
      await prisma.orderRequest.create({
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
      });
      created++;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        continue; // an open request for this item already exists — skip it.
      }
      throw err;
    }
  }

  await logActivity({
    userId: user.id,
    action: "order.generateShortfalls",
    entity: "OrderRequest",
    meta: { created },
  });

  return ok({ created });
});
