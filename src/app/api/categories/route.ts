import { route, ok } from "@/lib/http";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/audit";
import { z } from "zod";

export const dynamic = "force-dynamic";

const upsertSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().trim().optional().nullable(),
  color: z.string().trim().optional().nullable(),
  icon: z.string().trim().optional().nullable(),
  parentId: z.string().trim().optional().nullable(),
});

export const GET = route(async () => {
  await requirePermission("categories.view");
  const categories = await prisma.category.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      parent: { select: { id: true, name: true } },
      _count: { select: { items: true, customFields: true } },
    },
  });
  return ok(categories);
});

export const POST = route(async (req: Request) => {
  const user = await requirePermission("categories.manage");
  const data = upsertSchema.parse(await req.json());

  const max = await prisma.category.aggregate({ _max: { sortOrder: true } });
  const category = await prisma.category.create({
    data: {
      name: data.name,
      description: data.description || null,
      color: data.color || null,
      icon: data.icon || null,
      parentId: data.parentId || null,
      sortOrder: (max._max.sortOrder ?? 0) + 1,
    },
  });

  await logActivity({ userId: user.id, action: "category.create", entity: "Category", entityId: category.id });
  return ok(category);
});
