import { route, ok, fail } from "@/lib/http";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/audit";
import { z } from "zod";

type Ctx = { params: { id: string } };

function serializeItem(it: {
  id: string;
  name: string;
  quantity: number;
  unit: string | null;
  imageUrl: string | null;
  binId: string | null;
  sortOrder: number;
  category: { name: string; color: string | null } | null;
}) {
  return {
    id: it.id,
    name: it.name,
    quantity: it.quantity,
    unit: it.unit,
    imageUrl: it.imageUrl,
    binId: it.binId,
    sortOrder: it.sortOrder,
    category: it.category ? { name: it.category.name, color: it.category.color } : null,
  };
}

// GET /api/drawers/[id] — full drawer with bins and items.
export const GET = route(async (_req: Request, ctx: Ctx) => {
  await requirePermission("boxes.view");

  const drawer = await prisma.drawer.findUnique({
    where: { id: ctx.params.id },
    include: {
      box: { select: { id: true, name: true, gridRows: true, gridCols: true } },
      bins: { orderBy: { sortOrder: "asc" } },
      items: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          name: true,
          quantity: true,
          unit: true,
          imageUrl: true,
          binId: true,
          sortOrder: true,
          category: { select: { name: true, color: true } },
        },
      },
    },
  });

  if (!drawer) return fail("Drawer not found", 404);

  return ok({
    id: drawer.id,
    boxId: drawer.boxId,
    box: drawer.box,
    name: drawer.name,
    label: drawer.label,
    gridRow: drawer.gridRow,
    gridCol: drawer.gridCol,
    rowSpan: drawer.rowSpan,
    colSpan: drawer.colSpan,
    binRows: drawer.binRows,
    binCols: drawer.binCols,
    color: drawer.color,
    summary: drawer.summary,
    sortOrder: drawer.sortOrder,
    bins: drawer.bins.map((b) => ({
      id: b.id,
      drawerId: b.drawerId,
      name: b.name,
      gridRow: b.gridRow,
      gridCol: b.gridCol,
      rowSpan: b.rowSpan,
      colSpan: b.colSpan,
      color: b.color,
      sortOrder: b.sortOrder,
    })),
    items: drawer.items.map(serializeItem),
  });
});

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  label: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  // Front-view grid placement.
  gridRow: z.coerce.number().int().min(0).optional(),
  gridCol: z.coerce.number().int().min(0).optional(),
  rowSpan: z.coerce.number().int().min(1).optional(),
  colSpan: z.coerce.number().int().min(1).optional(),
  // Internal bin grid size.
  binRows: z.coerce.number().int().min(1).max(12).optional(),
  binCols: z.coerce.number().int().min(1).max(12).optional(),
});

// PATCH /api/drawers/[id] — edit drawer incl. grid layout fields.
export const PATCH = route(async (req: Request, ctx: Ctx) => {
  const user = await requirePermission("boxes.manage");
  const body = patchSchema.parse(await req.json());

  const drawer = await prisma.drawer.update({
    where: { id: ctx.params.id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.label !== undefined ? { label: body.label || null } : {}),
      ...(body.color !== undefined ? { color: body.color || null } : {}),
      ...(body.gridRow !== undefined ? { gridRow: body.gridRow } : {}),
      ...(body.gridCol !== undefined ? { gridCol: body.gridCol } : {}),
      ...(body.rowSpan !== undefined ? { rowSpan: body.rowSpan } : {}),
      ...(body.colSpan !== undefined ? { colSpan: body.colSpan } : {}),
      ...(body.binRows !== undefined ? { binRows: body.binRows } : {}),
      ...(body.binCols !== undefined ? { binCols: body.binCols } : {}),
    },
  });

  await logActivity({ userId: user.id, action: "drawer.update", entity: "Drawer", entityId: drawer.id });
  return ok(drawer);
});

// DELETE /api/drawers/[id] — remove a drawer (cascades to bins; items detach via SetNull).
export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  const user = await requirePermission("boxes.manage");
  await prisma.drawer.delete({ where: { id: ctx.params.id } });
  await logActivity({ userId: user.id, action: "drawer.delete", entity: "Drawer", entityId: ctx.params.id });
  return ok({ id: ctx.params.id });
});
