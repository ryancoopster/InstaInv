import { route, ok, fail } from "@/lib/http";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/audit";
import { z } from "zod";
import { defaultContentFor } from "@/lib/labels/defaults";

const TARGETS = ["ITEM", "BIN", "DRAWER", "BOX", "GENERIC"] as const;

// GET /api/labels — list all templates (ordered by sortOrder).
export const GET = route(async () => {
  await requirePermission("labels.view");
  const templates = await prisma.labelTemplate.findMany({
    orderBy: [{ target: "asc" }, { sortOrder: "asc" }],
  });
  return ok(templates);
});

const createSchema = z.object({
  name: z.string().min(1).max(120),
  target: z.enum(TARGETS),
  widthMm: z.number().positive().max(2000),
  heightMm: z.number().positive().max(2000),
  tapeName: z.string().max(120).optional().nullable(),
  orientation: z.enum(["landscape", "portrait"]).optional(),
});

// POST /api/labels — create a new template with starter content.
export const POST = route(async (req: Request) => {
  const user = await requirePermission("labels.design");
  const body = createSchema.parse(await req.json());

  const last = await prisma.labelTemplate.findFirst({
    where: { target: body.target },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  const existingCount = await prisma.labelTemplate.count({ where: { target: body.target } });

  const created = await prisma.labelTemplate.create({
    data: {
      name: body.name,
      target: body.target,
      widthMm: body.widthMm,
      heightMm: body.heightMm,
      tapeName: body.tapeName ?? null,
      orientation: body.orientation ?? "landscape",
      content: defaultContentFor(body.target, body.widthMm, body.heightMm) as any,
      // First template for a target becomes its default automatically.
      isDefault: existingCount === 0,
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
  });

  await logActivity({ userId: user.id, action: "label.create", entity: "LabelTemplate", entityId: created.id, meta: { name: created.name, target: created.target } });
  return ok(created);
});
