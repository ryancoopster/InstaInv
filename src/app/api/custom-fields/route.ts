import { route, ok, fail } from "@/lib/http";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/audit";
import { fieldKey } from "@/lib/utils";
import { z } from "zod";

export const dynamic = "force-dynamic";

const fieldTypes = [
  "TEXT",
  "TEXTAREA",
  "NUMBER",
  "BOOLEAN",
  "SELECT",
  "MULTISELECT",
  "DATE",
  "URL",
] as const;

const createSchema = z.object({
  categoryId: z.string().min(1),
  name: z.string().min(1, "Name is required"),
  key: z.string().trim().optional(),
  type: z.enum(fieldTypes).default("TEXT"),
  options: z.array(z.string()).default([]),
  unit: z.string().trim().optional().nullable(),
  required: z.boolean().default(false),
  showOnLabel: z.boolean().default(false),
});

export const GET = route(async (req: Request) => {
  await requirePermission("categories.view");
  const url = new URL(req.url);
  const categoryId = url.searchParams.get("categoryId");
  const fields = await prisma.customFieldDef.findMany({
    where: categoryId ? { categoryId } : undefined,
    orderBy: { sortOrder: "asc" },
  });
  return ok(fields);
});

export const POST = route(async (req: Request) => {
  const user = await requirePermission("categories.manage");
  const data = createSchema.parse(await req.json());

  const key = (data.key && data.key.length ? fieldKey(data.key) : fieldKey(data.name)) || "field";

  // Enforce per-category unique key.
  const existing = await prisma.customFieldDef.findUnique({
    where: { categoryId_key: { categoryId: data.categoryId, key } },
  });
  if (existing) {
    return fail("A field with this key already exists in this category", 422);
  }

  const max = await prisma.customFieldDef.aggregate({
    where: { categoryId: data.categoryId },
    _max: { sortOrder: true },
  });

  const field = await prisma.customFieldDef.create({
    data: {
      categoryId: data.categoryId,
      name: data.name,
      key,
      type: data.type,
      options: data.options,
      unit: data.unit || null,
      required: data.required,
      showOnLabel: data.showOnLabel,
      sortOrder: (max._max.sortOrder ?? 0) + 1,
    },
  });

  await logActivity({ userId: user.id, action: "customField.create", entity: "CustomFieldDef", entityId: field.id });
  return ok(field);
});
