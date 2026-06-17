import { route, ok } from "@/lib/http";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/audit";
import { z } from "zod";

// GET /api/boxes — list boxes with drawer counts + item counts.
export const GET = route(async () => {
  const user = await requirePermission("boxes.view");
  void user;

  const boxes = await prisma.box.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      drawers: {
        select: {
          id: true,
          items: { select: { id: true, quantity: true } },
        },
      },
    },
  });

  const data = boxes.map((b) => {
    let itemCount = 0;
    let pieceCount = 0;
    for (const d of b.drawers) {
      itemCount += d.items.length;
      for (const it of d.items) pieceCount += it.quantity;
    }
    return {
      id: b.id,
      name: b.name,
      description: b.description,
      location: b.location,
      imageUrl: b.imageUrl,
      gridRows: b.gridRows,
      gridCols: b.gridCols,
      summary: b.summary,
      sortOrder: b.sortOrder,
      drawerCount: b.drawers.length,
      itemCount,
      pieceCount,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
    };
  });

  return ok(data);
});

const createSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  gridRows: z.coerce.number().int().min(1).max(20).default(4),
  gridCols: z.coerce.number().int().min(1).max(20).default(1),
});

// POST /api/boxes — create a box.
export const POST = route(async (req: Request) => {
  const user = await requirePermission("boxes.manage");
  const body = createSchema.parse(await req.json());

  const max = await prisma.box.aggregate({ _max: { sortOrder: true } });
  const box = await prisma.box.create({
    data: {
      name: body.name,
      description: body.description || null,
      location: body.location || null,
      imageUrl: body.imageUrl || null,
      gridRows: body.gridRows,
      gridCols: body.gridCols,
      sortOrder: (max._max.sortOrder ?? -1) + 1,
    },
  });

  await logActivity({ userId: user.id, action: "box.create", entity: "Box", entityId: box.id, meta: { name: box.name } });
  return ok(box);
});
