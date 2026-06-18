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
  boxId: z.string().nullable().optional(),
  drawerId: z.string().nullable().optional(),
  binId: z.string().nullable().optional(),
});

// Relocate an item across box / drawer / bin, keeping the three consistent:
//   - a bin implies its drawer + box
//   - a drawer implies its box
//   - clearing the box clears the drawer + bin
// Each field is only touched if present in the body (null = clear). Used by the
// boxes graphical view, drawer views and mobile app.
export const POST = route(async (req: Request) => {
  const user = await requirePermission("boxes.reorganize");
  const data = schema.parse(await req.json());

  const before = await prisma.item.findUnique({
    where: { id: data.itemId },
    select: { boxId: true, drawerId: true, binId: true },
  });
  if (!before) return fail("Item not found", 404);

  let boxId = before.boxId;
  let drawerId = before.drawerId;
  let binId = before.binId;

  if (data.binId) {
    const bin = await prisma.bin.findUnique({
      where: { id: data.binId },
      include: { drawer: { select: { id: true, boxId: true } } },
    });
    if (!bin) return fail("Bin not found", 404);
    binId = bin.id;
    drawerId = bin.drawer.id;
    boxId = bin.drawer.boxId;
  } else if (data.drawerId) {
    const drawer = await prisma.drawer.findUnique({
      where: { id: data.drawerId },
      select: { id: true, boxId: true },
    });
    if (!drawer) return fail("Drawer not found", 404);
    drawerId = drawer.id;
    boxId = drawer.boxId;
    binId = data.binId === undefined ? null : data.binId; // changing drawer drops the bin
  } else {
    // F4: an explicit non-null boxId must reference a real box; otherwise the
    // update raises an opaque FK error (500). Mirror the bin/drawer 404 path.
    // (data.boxId === null is the explicit-clear case and is allowed through.)
    if (data.boxId) {
      const box = await prisma.box.findUnique({ where: { id: data.boxId }, select: { id: true } });
      if (!box) return fail("Box not found", 404);
    }
    if (data.boxId !== undefined) boxId = data.boxId;
    if (data.drawerId !== undefined) drawerId = data.drawerId;
    if (data.binId !== undefined) binId = data.binId;
    // Consistency: no drawer => no bin; no box => no drawer/bin.
    if (!drawerId) binId = null;
    if (!boxId) {
      drawerId = null;
      binId = null;
    }
  }

  const item = await prisma.item.update({
    where: { id: data.itemId },
    data: { boxId, drawerId, binId },
    include: itemInclude,
  });

  const affected = new Set<string>();
  if (before.drawerId) affected.add(before.drawerId);
  if (item.drawerId) affected.add(item.drawerId);
  for (const dId of affected) await refreshLocationSummaries(dId);

  await logActivity({
    userId: user.id,
    action: "item.move",
    entity: "Item",
    entityId: item.id,
    meta: { from: before.drawerId, to: item.drawerId, binId: item.binId },
  });

  return ok(serializeItem(item));
});
