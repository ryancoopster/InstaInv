import { route, ok, fail } from "@/lib/http";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/audit";
import { z } from "zod";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().trim().optional().nullable(),
  color: z.string().trim().optional().nullable(),
  icon: z.string().trim().optional().nullable(),
  parentId: z.string().trim().optional().nullable(),
});

type Params = { params: { id: string } };

export const GET = route(async (_req: Request, { params }: Params) => {
  await requirePermission("categories.view");
  const category = await prisma.category.findUnique({
    where: { id: params.id },
    include: { customFields: { orderBy: { sortOrder: "asc" } } },
  });
  return ok(category);
});

export const PATCH = route(async (req: Request, { params }: Params) => {
  const user = await requirePermission("categories.manage");
  const data = patchSchema.parse(await req.json());

  // Guard against making a category its own parent.
  if (data.parentId && data.parentId === params.id) {
    return fail("A category cannot be its own parent", 422);
  }

  const category = await prisma.category.update({
    where: { id: params.id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.description !== undefined ? { description: data.description || null } : {}),
      ...(data.color !== undefined ? { color: data.color || null } : {}),
      ...(data.icon !== undefined ? { icon: data.icon || null } : {}),
      ...(data.parentId !== undefined ? { parentId: data.parentId || null } : {}),
    },
  });

  await logActivity({ userId: user.id, action: "category.update", entity: "Category", entityId: category.id });
  return ok(category);
});

export const DELETE = route(async (_req: Request, { params }: Params) => {
  const user = await requirePermission("categories.manage");
  // CustomFieldDef rows cascade on delete; items have categoryId set null by the DB.
  await prisma.category.delete({ where: { id: params.id } });
  await logActivity({ userId: user.id, action: "category.delete", entity: "Category", entityId: params.id });
  return ok({ id: params.id });
});
