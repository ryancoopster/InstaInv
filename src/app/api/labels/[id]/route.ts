import { route, ok, fail } from "@/lib/http";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/audit";
import { z } from "zod";

interface Ctx {
  params: { id: string };
}

// GET /api/labels/:id — single template.
export const GET = route(async (_req: Request, ctx: Ctx) => {
  await requirePermission("labels.view");
  const tpl = await prisma.labelTemplate.findUnique({ where: { id: ctx.params.id } });
  if (!tpl) return fail("Template not found", 404);
  return ok(tpl);
});

const elementSchema = z
  .object({
    id: z.string(),
    type: z.enum(["text", "qrcode", "barcode", "image", "rect", "line"]),
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number(),
    rotation: z.number().optional(),
    hidden: z.boolean().optional(),
    text: z.string().optional(),
    fontSize: z.number().optional(),
    fontFamily: z.string().optional(),
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    align: z.enum(["left", "center", "right"]).optional(),
    color: z.string().optional(),
    binding: z.string().optional(),
    symbology: z.string().optional(),
    src: z.string().optional(),
    stroke: z.string().optional(),
    fill: z.string().optional(),
    strokeWidth: z.number().optional(),
  })
  .passthrough();

const contentSchema = z.object({
  dpi: z.number().positive(),
  background: z.string(),
  elements: z.array(elementSchema),
});

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  target: z.enum(["ITEM", "BIN", "DRAWER", "BOX", "GENERIC"]).optional(),
  widthMm: z.number().positive().max(2000).optional(),
  heightMm: z.number().positive().max(2000).optional(),
  tapeName: z.string().max(120).nullable().optional(),
  orientation: z.enum(["landscape", "portrait"]).optional(),
  content: contentSchema.optional(),
  isDefault: z.boolean().optional(),
});

// PATCH /api/labels/:id — save content / metadata / default flag.
export const PATCH = route(async (req: Request, ctx: Ctx) => {
  const user = await requirePermission("labels.design");
  const body = patchSchema.parse(await req.json());

  const existing = await prisma.labelTemplate.findUnique({ where: { id: ctx.params.id } });
  if (!existing) return fail("Template not found", 404);

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.target !== undefined) data.target = body.target;
  if (body.widthMm !== undefined) data.widthMm = body.widthMm;
  if (body.heightMm !== undefined) data.heightMm = body.heightMm;
  if (body.tapeName !== undefined) data.tapeName = body.tapeName;
  if (body.orientation !== undefined) data.orientation = body.orientation;
  if (body.content !== undefined) data.content = body.content as any;
  if (body.isDefault !== undefined) data.isDefault = body.isDefault;

  // Setting default: clear the flag on siblings of the same target.
  if (body.isDefault === true) {
    const target = body.target ?? existing.target;
    await prisma.labelTemplate.updateMany({
      where: { target, id: { not: existing.id } },
      data: { isDefault: false },
    });
  }

  const updated = await prisma.labelTemplate.update({ where: { id: existing.id }, data });
  await logActivity({ userId: user.id, action: "label.update", entity: "LabelTemplate", entityId: updated.id, meta: { name: updated.name } });
  return ok(updated);
});

// DELETE /api/labels/:id
export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  const user = await requirePermission("labels.design");
  const existing = await prisma.labelTemplate.findUnique({ where: { id: ctx.params.id } });
  if (!existing) return fail("Template not found", 404);

  await prisma.labelTemplate.delete({ where: { id: existing.id } });

  // If we removed the default, promote the next sibling so a default remains.
  if (existing.isDefault) {
    const next = await prisma.labelTemplate.findFirst({
      where: { target: existing.target },
      orderBy: { sortOrder: "asc" },
    });
    if (next) await prisma.labelTemplate.update({ where: { id: next.id }, data: { isDefault: true } });
  }

  await logActivity({ userId: user.id, action: "label.delete", entity: "LabelTemplate", entityId: existing.id, meta: { name: existing.name } });
  return ok({ id: existing.id });
});
