import { route, ok, fail } from "@/lib/http";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/audit";

interface Ctx {
  params: { id: string };
}

// POST /api/labels/:id/duplicate — clone a template (never duplicates default).
export const POST = route(async (_req: Request, ctx: Ctx) => {
  const user = await requirePermission("labels.design");
  const src = await prisma.labelTemplate.findUnique({ where: { id: ctx.params.id } });
  if (!src) return fail("Template not found", 404);

  const last = await prisma.labelTemplate.findFirst({
    where: { target: src.target },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  const copy = await prisma.labelTemplate.create({
    data: {
      name: `${src.name} (copy)`,
      target: src.target,
      widthMm: src.widthMm,
      heightMm: src.heightMm,
      tapeName: src.tapeName,
      orientation: src.orientation,
      content: src.content as any,
      isDefault: false,
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
  });

  await logActivity({ userId: user.id, action: "label.duplicate", entity: "LabelTemplate", entityId: copy.id, meta: { from: src.id } });
  return ok(copy);
});
