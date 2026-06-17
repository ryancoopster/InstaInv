import { route, ok, fail } from "@/lib/http";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { refreshLocationSummaries } from "@/lib/summary";
import { logActivity } from "@/lib/audit";
import { z } from "zod";
import { itemInclude, serializeItem } from "../_serialize";

export const dynamic = "force-dynamic";

const schema = z.object({
  itemId: z.string().min(1),
  drawerId: z.string().nullable().optional(),
  binId: z.string().nullable().optional(),
});

// Relocate an item to a different drawer/bin. Used by the boxes graphical view
// and the mobile app. Refreshes summaries for both the old and new drawer.
export const POST = route(async (req: Request) => {
  const user = await requirePermission("boxes.reorganize");
  const data = schema.parse(await req.json());

  const before = await prisma.item.findUnique({
    where: { id: data.itemId },
    select: { drawerId: true },
  });
  if (!before) return fail("Item not found", 404);

  const item = await prisma.item.update({
    where: { id: data.itemId },
    data: {
      ...(data.drawerId !== undefined ? { drawerId: data.drawerId } : {}),
      ...(data.binId !== undefined ? { binId: data.binId } : {}),
    },
    include: itemInclude,
  });

  const affected = new Set<string>();
  if (before.drawerId) affected.add(before.drawerId);
  if (item.drawerId) affected.add(item.drawerId);
  for (const drawerId of affected) await refreshLocationSummaries(drawerId);

  await logActivity({
    userId: user.id,
    action: "item.move",
    entity: "Item",
    entityId: item.id,
    meta: { from: before.drawerId, to: item.drawerId, binId: item.binId },
  });

  return ok(serializeItem(item));
});
