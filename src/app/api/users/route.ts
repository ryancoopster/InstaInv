import { route, ok, fail } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requirePermission, hashPassword } from "@/lib/auth";
import { passwordSchema } from "@/lib/password";
import { logActivity } from "@/lib/audit";
import { z } from "zod";
import { serializeUser } from "./_serialize";

const userInclude = { userType: true } as const;

export const GET = route(async () => {
  await requirePermission("users.view");
  const users = await prisma.user.findMany({
    include: userInclude,
    orderBy: { sortOrder: "asc" },
  });
  return ok(users.map(serializeUser));
});

const CreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: passwordSchema,
  userTypeId: z.string().min(1, "A role is required"),
  isActive: z.boolean().optional(),
});

export const POST = route(async (req: Request) => {
  const actor = await requirePermission("users.manage");
  const body = CreateSchema.parse(await req.json());

  const existing = await prisma.user.findUnique({ where: { email: body.email } });
  if (existing) return fail("A user with that email already exists", 409);

  const role = await prisma.userType.findUnique({ where: { id: body.userTypeId } });
  if (!role) return fail("The selected role does not exist", 422);

  const last = await prisma.user.findFirst({ orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  const passwordHash = await hashPassword(body.password);

  const user = await prisma.user.create({
    data: {
      name: body.name,
      email: body.email,
      passwordHash,
      userTypeId: body.userTypeId,
      isActive: body.isActive ?? true,
      // The admin sets an initial password; force the user to choose their own.
      mustChangePassword: true,
      sortOrder: (last?.sortOrder ?? 0) + 1,
    },
    include: userInclude,
  });

  await logActivity({
    userId: actor.id,
    action: "user.create",
    entity: "User",
    entityId: user.id,
    meta: { email: user.email, role: role.name },
  });

  return ok(serializeUser(user), { status: 201 });
});
