import { route, ok } from "@/lib/http";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/audit";
import { refreshBoxSummary } from "@/lib/summary";
import { z } from "zod";

// GET /api/drawers?boxId=... — list a box's drawers with bin/item counts.
export const GET = route(async (req: Request) => {
  await requirePermission("boxes.view");
  const { searchParams } = new URL(req.url);
  const boxId = searchParams.get("boxId");

  const drawers = await prisma.drawer.findMany({
    where: boxId ? { boxId } : undefined,
    orderBy: { sortOrder: "asc" },
    include: {
      bins: { select: { id: true } },
      items: { select: { id: true, quantity: true } },
    },
  });

  const data = drawers.map((d) => ({
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

  return ok(data);
});

const createSchema = z.object({
  boxId: z.string().min(1),
  name: z.string().min(1, "Name is required"),
  label: z.string().optional().nullable(),
  color: z.string().optional().nullable(),
  gridRow: z.coerce.number().int().min(0).default(0),
  gridCol: z.coerce.number().int().min(0).default(0),
  rowSpan: z.coerce.number().int().min(1).default(1),
  colSpan: z.coerce.number().int().min(1).default(1),
  binRows: z.coerce.number().int().min(1).max(12).default(2),
  binCols: z.coerce.number().int().min(1).max(12).default(4),
});

// POST /api/drawers — create a drawer inside a box.
export const POST = route(async (req: Request) => {
  const user = await requirePermission("boxes.manage");
  const body = createSchema.parse(await req.json());

  const max = await prisma.drawer.aggregate({
    where: { boxId: body.boxId },
    _max: { sortOrder: true },
  });

  const drawer = await prisma.drawer.create({
    data: {
      boxId: body.boxId,
      name: body.name,
      label: body.label || null,
      color: body.color || null,
      gridRow: body.gridRow,
      gridCol: body.gridCol,
      rowSpan: body.rowSpan,
      colSpan: body.colSpan,
      binRows: body.binRows,
      binCols: body.binCols,
      sortOrder: (max._max.sortOrder ?? -1) + 1,
    },
  });

  await refreshBoxSummary(body.boxId);
  await logActivity({ userId: user.id, action: "drawer.create", entity: "Drawer", entityId: drawer.id, meta: { name: drawer.name } });
  return ok(drawer);
});
