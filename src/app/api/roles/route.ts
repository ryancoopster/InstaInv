import { route, ok, fail } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import { ALL_PERMISSION_KEYS } from "@/lib/permissions";
import { z } from "zod";
import { serializeRole } from "../users/_serialize";

// Keep only known permission keys; coerce to booleans.
const permissionsSchema = z
  .record(z.string(), z.boolean())
  .transform((map) => {
    const out: Record<string, boolean> = {};
    for (const key of ALL_PERMISSION_KEYS) {
      if (map[key]) out[key] = true;
    }
    return out;
  });

export const GET = route(async () => {
  await requirePermission("users.view");
  const roles = await prisma.userType.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { users: true } } },
  });
  return ok(roles.map(serializeRole));
});

const CreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  description: z.string().trim().max(500).optional().nullable(),
  isAdmin: z.boolean().optional(),
  permissions: permissionsSchema.optional(),
});

export const POST = route(async (req: Request) => {
  const actor = await requirePermission("users.manage");
  const body = CreateSchema.parse(await req.json());

  const existing = await prisma.userType.findUnique({ where: { name: body.name } });
  if (existing) return fail("A role with that name already exists", 409);

  const last = await prisma.userType.findFirst({
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  const role = await prisma.userType.create({
    data: {
      name: body.name,
      description: body.description ?? null,
      isAdmin: body.isAdmin ?? false,
      permissions: body.permissions ?? {},
      isSystem: false,
      sortOrder: (last?.sortOrder ?? 0) + 1,
    },
    include: { _count: { select: { users: true } } },
  });

  await logActivity({
    userId: actor.id,
    action: "role.create",
    entity: "UserType",
    entityId: role.id,
    meta: { name: role.name },
  });

  return ok(serializeRole(role), { status: 201 });
});
