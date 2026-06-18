import { route, ok, fail } from "@/lib/http";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { refreshLocationSummaries } from "@/lib/summary";
import { logActivity } from "@/lib/audit";
import { z } from "zod";

type Ctx = { params: { id: string } };

const schema = z.discriminatedUnion("mode", [
  // Delete the drawer; items stay in the box but become drawer-unassigned.
  z.object({ mode: z.literal("leave-in-box") }),
  // Delete the drawer; items leave the box entirely.
  z.object({ mode: z.literal("unassign-from-box") }),
  // Delete the drawer; reassign its items to another box (+ optional drawer),
  // optionally migrating this drawer's bins into the chosen target drawer.
  z.object({
    mode: z.literal("reassign"),
    targetBoxId: z.string().min(1),
    targetDrawerId: z.string().min(1).nullable().optional(),
    migrateBins: z.boolean().optional(),
  }),
]);

// POST /api/drawers/[id]/delete — disposition-aware drawer deletion.
export const POST = route(async (req: Request, ctx: Ctx) => {
  const user = await requirePermission("boxes.manage");
  const body = schema.parse(await req.json());

  const drawer = await prisma.drawer.findUnique({
    where: { id: ctx.params.id },
    select: { id: true, boxId: true },
  });
  if (!drawer) return fail("Drawer not found", 404);

  const affected = new Set<string>();

  await prisma.$transaction(async (tx) => {
    if (body.mode === "leave-in-box") {
      await tx.item.updateMany({
        where: { drawerId: drawer.id },
        data: { drawerId: null, binId: null },
      });
      await tx.drawer.delete({ where: { id: drawer.id } }); // cascades its bins
    } else if (body.mode === "unassign-from-box") {
      await tx.item.updateMany({
        where: { drawerId: drawer.id },
        data: { boxId: null, drawerId: null, binId: null },
      });
      await tx.drawer.delete({ where: { id: drawer.id } });
    } else {
      const target = await tx.drawer.findUnique({
        where: { id: body.targetDrawerId ?? "__none__" },
        select: { id: true, boxId: true },
      });
      // Validate target drawer belongs to target box when provided.
      if (body.targetDrawerId) {
        if (!target || target.boxId !== body.targetBoxId) {
          throw new Error("Target drawer does not belong to the chosen box");
        }
      }
      const targetBox = await tx.box.findUnique({ where: { id: body.targetBoxId }, select: { id: true } });
      if (!targetBox) throw new Error("Target box not found");

      if (body.migrateBins && body.targetDrawerId) {
        // Move bins (with their items) into the target drawer, then move the
        // remaining (binless) items, then delete the now-empty source drawer.
        // DM-8: re-pack migrated bins below the target drawer's existing bins so
        // their source grid coordinates can't collide with (overlap) bins
        // already in the target. We append each migrated bin in its own row,
        // preserving its rowSpan/colSpan, and grow the target's grid to fit.
        const targetBins = await tx.bin.findMany({
          where: { drawerId: body.targetDrawerId },
          select: { gridRow: true, rowSpan: true },
        });
        const sourceBins = await tx.bin.findMany({
          where: { drawerId: drawer.id },
          select: { id: true, gridCol: true, rowSpan: true, colSpan: true },
          orderBy: [{ gridRow: "asc" }, { gridCol: "asc" }],
        });
        let nextRow = targetBins.reduce((max, b) => Math.max(max, b.gridRow + b.rowSpan), 0);
        let maxCol = 0;
        for (const b of sourceBins) {
          await tx.bin.update({
            where: { id: b.id },
            data: { drawerId: body.targetDrawerId, gridRow: nextRow, gridCol: 0 },
          });
          maxCol = Math.max(maxCol, b.colSpan);
          nextRow += b.rowSpan;
        }
        // Bump the target drawer's grid so the re-packed bins are visible.
        if (sourceBins.length > 0) {
          const targetDrawer = await tx.drawer.findUnique({
            where: { id: body.targetDrawerId },
            select: { binRows: true, binCols: true },
          });
          if (targetDrawer) {
            await tx.drawer.update({
              where: { id: body.targetDrawerId },
              data: {
                binRows: Math.max(targetDrawer.binRows, nextRow),
                binCols: Math.max(targetDrawer.binCols, maxCol),
              },
            });
          }
        }
        await tx.item.updateMany({
          where: { drawerId: drawer.id },
          data: { boxId: body.targetBoxId, drawerId: body.targetDrawerId },
        });
        if (target) affected.add(target.id);
        await tx.drawer.delete({ where: { id: drawer.id } });
      } else {
        await tx.item.updateMany({
          where: { drawerId: drawer.id },
          data: { boxId: body.targetBoxId, drawerId: body.targetDrawerId ?? null, binId: null },
        });
        if (body.targetDrawerId && target) affected.add(target.id);
        await tx.drawer.delete({ where: { id: drawer.id } });
      }
    }
  });

  for (const d of affected) await refreshLocationSummaries(d);
  await logActivity({
    userId: user.id,
    action: "drawer.delete",
    entity: "Drawer",
    entityId: ctx.params.id,
    meta: body,
  });

  return ok({ id: ctx.params.id });
});
