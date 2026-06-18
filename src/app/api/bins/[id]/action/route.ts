import { route, ok, fail } from "@/lib/http";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { refreshLocationSummaries } from "@/lib/summary";
import { logActivity } from "@/lib/audit";
import { z } from "zod";

type Ctx = { params: { id: string } };

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("delete"),
    mode: z.enum(["leave-in-drawer", "unassign-from-drawer", "unassign-from-box"]),
  }),
  z.object({ action: z.literal("move"), drawerId: z.string().min(1) }),
  z.object({ action: z.literal("clear") }),
]);

// POST /api/bins/[id]/action — disposition-aware bin operations.
export const POST = route(async (req: Request, ctx: Ctx) => {
  const body = schema.parse(await req.json());
  // clear is an item-reorg op; delete/move are structural.
  const user = await requirePermission(body.action === "clear" ? "boxes.reorganize" : "boxes.manage");

  const bin = await prisma.bin.findUnique({
    where: { id: ctx.params.id },
    include: { drawer: { select: { id: true, boxId: true } } },
  });
  if (!bin) return fail("Bin not found", 404);

  const affectedDrawers = new Set<string>([bin.drawerId]);

  if (body.action === "clear") {
    await prisma.item.updateMany({ where: { binId: bin.id }, data: { binId: null } });
  } else if (body.action === "delete") {
    await prisma.$transaction(async (tx) => {
      const data =
        body.mode === "leave-in-drawer"
          ? { binId: null }
          : body.mode === "unassign-from-drawer"
            ? { binId: null, drawerId: null }
            : { binId: null, drawerId: null, boxId: null };
      await tx.item.updateMany({ where: { binId: bin.id }, data });
      await tx.bin.delete({ where: { id: bin.id } });
    });
  } else {
    // move bin (and its items) to another drawer
    const target = await prisma.drawer.findUnique({
      where: { id: body.drawerId },
      select: { id: true, boxId: true },
    });
    if (!target) return fail("Target drawer not found", 404);
    affectedDrawers.add(target.id);
    await prisma.$transaction(async (tx) => {
      await tx.bin.update({ where: { id: bin.id }, data: { drawerId: target.id } });
      await tx.item.updateMany({
        where: { binId: bin.id },
        data: { drawerId: target.id, boxId: target.boxId },
      });
    });
  }

  for (const d of affectedDrawers) await refreshLocationSummaries(d);
  await logActivity({
    userId: user.id,
    action: `bin.${body.action}`,
    entity: "Bin",
    entityId: bin.id,
    meta: body,
  });

  return ok({ id: bin.id });
});
