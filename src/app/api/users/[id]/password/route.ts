import { route, ok, fail } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requirePermission, hashPassword } from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import { z } from "zod";

type Ctx = { params: { id: string } };

const PasswordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const actor = await requirePermission("users.manage");
  const { password } = PasswordSchema.parse(await req.json());

  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target) return fail("User not found", 404);

  const passwordHash = await hashPassword(password);
  await prisma.user.update({ where: { id: params.id }, data: { passwordHash } });

  await logActivity({
    userId: actor.id,
    action: "user.resetPassword",
    entity: "User",
    entityId: params.id,
  });

  return ok({ success: true });
});
