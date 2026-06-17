import { route, ok } from "@/lib/http";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/audit";
import { z } from "zod";

// PATCH /api/orders/bulk-desired
//   Bulk-update Item.desiredQuantity across many items at once (the "Set stock
//   levels" editor). Permission: orders.setDesired.
const schema = z.object({
  updates: z
    .array(
      z.object({
        itemId: z.string().min(1),
        desiredQuantity: z.coerce.number().int().min(0),
      }),
    )
    .min(1),
});

export const PATCH = route(async (req: Request) => {
  const user = await requirePermission("orders.setDesired");
  const { updates } = schema.parse(await req.json());

  // De-dupe by itemId (last write wins) to keep the transaction tidy.
  const byId = new Map<string, number>();
  for (const u of updates) byId.set(u.itemId, u.desiredQuantity);

  const ops = [...byId.entries()].map(([itemId, desiredQuantity]) =>
    prisma.item.update({
      where: { id: itemId },
      data: { desiredQuantity },
    }),
  );

  await prisma.$transaction(ops);

  await logActivity({
    userId: user.id,
    action: "order.bulkDesired",
    entity: "Item",
    meta: { count: byId.size },
  });

  return ok({ updated: byId.size });
});
