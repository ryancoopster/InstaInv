import { route, ok } from "@/lib/http";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/audit";
import { z } from "zod";

type Ctx = { params: { id: string } };

const patchSchema = z.object({
  name: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  gridRow: z.coerce.number().int().min(0).optional(),
  gridCol: z.coerce.number().int().min(0).optional(),
  rowSpan: z.coerce.number().int().min(1).optional(),
  colSpan: z.coerce.number().int().min(1).optional(),
});

// PATCH /api/bins/[id] — edit bin incl. grid layout fields.
export const PATCH = route(async (req: Request, ctx: Ctx) => {
  const user = await requirePermission("boxes.manage");
  const body = patchSchema.parse(await req.json());

  const bin = await prisma.bin.update({
    where: { id: ctx.params.id },
    data: {
      ...(body.name !== undefined ? { name: body.name || null } : {}),
      ...(body.color !== undefined ? { color: body.color || null } : {}),
      ...(body.gridRow !== undefined ? { gridRow: body.gridRow } : {}),
      ...(body.gridCol !== undefined ? { gridCol: body.gridCol } : {}),
      ...(body.rowSpan !== undefined ? { rowSpan: body.rowSpan } : {}),
      ...(body.colSpan !== undefined ? { colSpan: body.colSpan } : {}),
    },
  });

  await logActivity({ userId: user.id, action: "bin.update", entity: "Bin", entityId: bin.id });
  return ok(bin);
});

// DELETE /api/bins/[id] — remove a bin (items detach via SetNull).
export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  const user = await requirePermission("boxes.manage");
  await prisma.bin.delete({ where: { id: ctx.params.id } });
  await logActivity({ userId: user.id, action: "bin.delete", entity: "Bin", entityId: ctx.params.id });
  return ok({ id: ctx.params.id });
});
