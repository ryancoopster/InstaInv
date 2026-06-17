import { route, ok, fail } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import { ALL_PERMISSION_KEYS } from "@/lib/permissions";
import { z } from "zod";
import { serializeUser } from "../_serialize";

const userInclude = { userType: true } as const;

type Ctx = { params: { id: string } };

export const GET = route(async (_req: Request, { params }: Ctx) => {
  await requirePermission("users.view");
  const user = await prisma.user.findUnique({ where: { id: params.id }, include: userInclude });
  if (!user) return fail("User not found", 404);
  return ok(serializeUser(user));
});

// A permission overrides map: each key may be true (allow), false (deny) or
// omitted (inherit). We validate against the registry and drop unknown keys.
const overridesSchema = z
  .record(z.string(), z.boolean())
  .transform((map) => {
    const out: Record<string, boolean> = {};
    for (const key of ALL_PERMISSION_KEYS) {
      if (key in map) out[key] = Boolean(map[key]);
    }
    return out;
  });

const PatchSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    email: z.string().trim().toLowerCase().email().optional(),
    userTypeId: z.string().min(1).optional(),
    isActive: z.boolean().optional(),
    image: z.string().url().nullable().optional(),
    permissionOverrides: overridesSchema.optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: "No changes supplied" });

export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const actor = await requirePermission("users.manage");
  const body = PatchSchema.parse(await req.json());

  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target) return fail("User not found", 404);

  // Guard: don't let an admin lock themselves out by self-deactivating or
  // demoting away their own management rights through these fields.
  if (target.id === actor.id) {
    if (body.isActive === false) {
      return fail("You cannot deactivate your own account", 400);
    }
  }

  if (body.email && body.email !== target.email) {
    const clash = await prisma.user.findUnique({ where: { email: body.email } });
    if (clash) return fail("A user with that email already exists", 409);
  }

  if (body.userTypeId && body.userTypeId !== target.userTypeId) {
    const role = await prisma.userType.findUnique({ where: { id: body.userTypeId } });
    if (!role) return fail("The selected role does not exist", 422);
  }

  const user = await prisma.user.update({
    where: { id: params.id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.email !== undefined ? { email: body.email } : {}),
      ...(body.userTypeId !== undefined ? { userTypeId: body.userTypeId } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      ...(body.image !== undefined ? { image: body.image } : {}),
      ...(body.permissionOverrides !== undefined
        ? { permissionOverrides: body.permissionOverrides }
        : {}),
    },
    include: userInclude,
  });

  await logActivity({
    userId: actor.id,
    action: "user.update",
    entity: "User",
    entityId: user.id,
    meta: { fields: Object.keys(body) },
  });

  return ok(serializeUser(user));
});

export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const actor = await requirePermission("users.manage");

  if (params.id === actor.id) {
    return fail("You cannot delete your own account", 400);
  }

  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target) return fail("User not found", 404);

  await prisma.user.delete({ where: { id: params.id } });

  await logActivity({
    userId: actor.id,
    action: "user.delete",
    entity: "User",
    entityId: params.id,
    meta: { email: target.email },
  });

  return ok({ success: true });
});
