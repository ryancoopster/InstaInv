import { route, ok, fail } from "@/lib/http";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/audit";
import { z } from "zod";

type Ctx = { params: { id: string } };

// GET /api/boxes/[id] — full box with drawers (incl. bins + item counts).
export const GET = route(async (_req: Request, ctx: Ctx) => {
  await requirePermission("boxes.view");

  const box = await prisma.box.findUnique({
    where: { id: ctx.params.id },
    include: {
      drawers: {
        orderBy: { sortOrder: "asc" },
        include: {
          bins: { select: { id: true } },
          items: { select: { id: true, quantity: true } },
        },
      },
    },
  });

  if (!box) return fail("Box not found", 404);

  const drawers = box.drawers.map((d) => ({
    id: d.id,
    boxId: d.boxId,
    name: d.name,
    label: d.label,
    gridRow: d.gridRow,
    gridCol: d.gridCol,
    rowSpan: d.rowSpan,
    colSpan: d.colSpan,
    binRows: d.binRows,
    binCols: d.binCols,
    color: d.color,
    summary: d.summary,
    sortOrder: d.sortOrder,
    binCount: d.bins.length,
    itemCount: d.items.length,
    pieceCount: d.items.reduce((s, it) => s + it.quantity, 0),
  }));

  return ok({
    id: box.id,
    name: box.name,
    description: box.description,
    location: box.location,
    imageUrl: box.imageUrl,
    gridRows: box.gridRows,
    gridCols: box.gridCols,
    summary: box.summary,
    sortOrder: box.sortOrder,
    createdAt: box.createdAt,
    updatedAt: box.updatedAt,
    drawers,
  });
});

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  gridRows: z.coerce.number().int().min(1).max(20).optional(),
  gridCols: z.coerce.number().int().min(1).max(20).optional(),
});

// PATCH /api/boxes/[id] — edit box fields incl. front-view grid size.
export const PATCH = route(async (req: Request, ctx: Ctx) => {
  const user = await requirePermission("boxes.manage");
  const body = patchSchema.parse(await req.json());

  const box = await prisma.box.update({
    where: { id: ctx.params.id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.description !== undefined ? { description: body.description || null } : {}),
      ...(body.location !== undefined ? { location: body.location || null } : {}),
      ...(body.imageUrl !== undefined ? { imageUrl: body.imageUrl || null } : {}),
      ...(body.gridRows !== undefined ? { gridRows: body.gridRows } : {}),
      ...(body.gridCols !== undefined ? { gridCols: body.gridCols } : {}),
    },
  });

  await logActivity({ userId: user.id, action: "box.update", entity: "Box", entityId: box.id });
  return ok(box);
});

// DELETE /api/boxes/[id] — remove a box (cascades to drawers/bins).
export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  const user = await requirePermission("boxes.manage");
  await prisma.box.delete({ where: { id: ctx.params.id } });
  await logActivity({ userId: user.id, action: "box.delete", entity: "Box", entityId: ctx.params.id });
  return ok({ id: ctx.params.id });
});
