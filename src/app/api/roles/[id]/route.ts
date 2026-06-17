import { route, ok, fail } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import { ALL_PERMISSION_KEYS } from "@/lib/permissions";
import { z } from "zod";
import { serializeRole } from "../../users/_serialize";

type Ctx = { params: { id: string } };

const permissionsSchema = z
  .record(z.string(), z.boolean())
  .transform((map) => {
    const out: Record<string, boolean> = {};
    for (const key of ALL_PERMISSION_KEYS) {
      if (map[key]) out[key] = true;
    }
    return out;
  });

export const GET = route(async (_req: Request, { params }: Ctx) => {
  await requirePermission("users.view");
  const role = await prisma.userType.findUnique({
    where: { id: params.id },
    include: { _count: { select: { users: true } } },
  });
  if (!role) return fail("Role not found", 404);
  return ok(serializeRole(role));
});

const PatchSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    isAdmin: z.boolean().optional(),
    permissions: permissionsSchema.optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: "No changes supplied" });

export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const actor = await requirePermission("users.manage");
  const body = PatchSchema.parse(await req.json());

  const role = await prisma.userType.findUnique({ where: { id: params.id } });
  if (!role) return fail("Role not found", 404);

  if (body.name && body.name !== role.name) {
    const clash = await prisma.userType.findUnique({ where: { name: body.name } });
    if (clash) return fail("A role with that name already exists", 409);
  }

  const updated = await prisma.userType.update({
    where: { id: params.id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.isAdmin !== undefined ? { isAdmin: body.isAdmin } : {}),
      ...(body.permissions !== undefined ? { permissions: body.permissions } : {}),
    },
    include: { _count: { select: { users: true } } },
  });

  await logActivity({
    userId: actor.id,
    action: "role.update",
    entity: "UserType",
    entityId: updated.id,
    meta: { fields: Object.keys(body) },
  });

  return ok(serializeRole(updated));
});

export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const actor = await requirePermission("users.manage");

  const role = await prisma.userType.findUnique({
    where: { id: params.id },
    include: { _count: { select: { users: true } } },
  });
  if (!role) return fail("Role not found", 404);
  if (role.isSystem) return fail("System roles cannot be deleted", 400);
  if (role._count.users > 0) {
    return fail(
      `This role is assigned to ${role._count.users} user(s). Reassign them before deleting.`,
      400,
    );
  }

  await prisma.userType.delete({ where: { id: params.id } });

  await logActivity({
    userId: actor.id,
    action: "role.delete",
    entity: "UserType",
    entityId: params.id,
    meta: { name: role.name },
  });

  return ok({ success: true });
});
