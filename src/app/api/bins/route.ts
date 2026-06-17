import { route, ok } from "@/lib/http";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/audit";
import { z } from "zod";

// GET /api/bins?drawerId=... — list a drawer's bins with item counts.
export const GET = route(async (req: Request) => {
  await requirePermission("boxes.view");
  const { searchParams } = new URL(req.url);
  const drawerId = searchParams.get("drawerId");

  const bins = await prisma.bin.findMany({
    where: drawerId ? { drawerId } : undefined,
    orderBy: { sortOrder: "asc" },
    include: { items: { select: { id: true, quantity: true } } },
  });

  const data = bins.map((b) => ({
    id: b.id,
    drawerId: b.drawerId,
    name: b.name,
    gridRow: b.gridRow,
    gridCol: b.gridCol,
    rowSpan: b.rowSpan,
    colSpan: b.colSpan,
    color: b.color,
    sortOrder: b.sortOrder,
    itemCount: b.items.length,
    pieceCount: b.items.reduce((s, it) => s + it.quantity, 0),
  }));

  return ok(data);
});

const createSchema = z.object({
  drawerId: z.string().min(1),
  name: z.string().optional().nullable(),
  color: z.string().optional().nullable(),
  gridRow: z.coerce.number().int().min(0).default(0),
  gridCol: z.coerce.number().int().min(0).default(0),
  rowSpan: z.coerce.number().int().min(1).default(1),
  colSpan: z.coerce.number().int().min(1).default(1),
});

// POST /api/bins — create a bin in a drawer.
export const POST = route(async (req: Request) => {
  const user = await requirePermission("boxes.manage");
  const body = createSchema.parse(await req.json());

  const max = await prisma.bin.aggregate({
    where: { drawerId: body.drawerId },
    _max: { sortOrder: true },
  });

  const bin = await prisma.bin.create({
    data: {
      drawerId: body.drawerId,
      name: body.name || null,
      color: body.color || null,
      gridRow: body.gridRow,
      gridCol: body.gridCol,
      rowSpan: body.rowSpan,
      colSpan: body.colSpan,
      sortOrder: (max._max.sortOrder ?? -1) + 1,
    },
  });

  await logActivity({ userId: user.id, action: "bin.create", entity: "Bin", entityId: bin.id });
  return ok(bin);
});
