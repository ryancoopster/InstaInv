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

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  key: z.string().trim().optional(),
  type: z.enum(fieldTypes).optional(),
  options: z.array(z.string()).optional(),
  unit: z.string().trim().optional().nullable(),
  required: z.boolean().optional(),
  showOnLabel: z.boolean().optional(),
});

type Params = { params: { id: string } };

export const PATCH = route(async (req: Request, { params }: Params) => {
  const user = await requirePermission("categories.manage");
  const data = patchSchema.parse(await req.json());

  const current = await prisma.customFieldDef.findUnique({ where: { id: params.id } });
  if (!current) return fail("Field not found", 404);

  let key = current.key;
  if (data.key !== undefined && data.key.length) {
    key = fieldKey(data.key);
  }

  // If key changes, enforce uniqueness within the category.
  if (key !== current.key) {
    const clash = await prisma.customFieldDef.findUnique({
      where: { categoryId_key: { categoryId: current.categoryId, key } },
    });
    if (clash && clash.id !== current.id) {
      return fail("A field with this key already exists in this category", 422);
    }
  }

  const field = await prisma.customFieldDef.update({
    where: { id: params.id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      key,
      ...(data.type !== undefined ? { type: data.type } : {}),
      ...(data.options !== undefined ? { options: data.options } : {}),
      ...(data.unit !== undefined ? { unit: data.unit || null } : {}),
      ...(data.required !== undefined ? { required: data.required } : {}),
      ...(data.showOnLabel !== undefined ? { showOnLabel: data.showOnLabel } : {}),
    },
  });

  await logActivity({ userId: user.id, action: "customField.update", entity: "CustomFieldDef", entityId: field.id });
  return ok(field);
});

export const DELETE = route(async (_req: Request, { params }: Params) => {
  const user = await requirePermission("categories.manage");
  await prisma.customFieldDef.delete({ where: { id: params.id } });
  await logActivity({ userId: user.id, action: "customField.delete", entity: "CustomFieldDef", entityId: params.id });
  return ok({ id: params.id });
});
