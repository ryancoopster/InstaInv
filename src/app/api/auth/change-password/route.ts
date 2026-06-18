import { route, ok, fail } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireUser, verifyPassword, hashPassword, createSessionCookie } from "@/lib/auth";
import { passwordSchema } from "@/lib/password";
import { logActivity } from "@/lib/audit";
import { z } from "zod";

const Schema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: passwordSchema,
});

// POST /api/auth/change-password — self-service password change. Clears the
// must-change flag, revokes other sessions (tokenVersion bump) and re-issues this
// session's cookie so the caller stays signed in.
export const POST = route(async (req: Request) => {
  const user = await requireUser();

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message || "Invalid input", 422);
  }
  const { currentPassword, newPassword } = parsed.data;

  const fresh = await prisma.user.findUnique({ where: { id: user.id } });
  if (!fresh) return fail("User not found", 404);

  const valid = await verifyPassword(currentPassword, fresh.passwordHash);
  if (!valid) return fail("Your current password is incorrect", 400);

  const newHash = await hashPassword(newPassword);
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: newHash, mustChangePassword: false, tokenVersion: { increment: 1 } },
  });

  // tokenVersion was bumped, invalidating every prior JWT (incl. the current
  // cookie). Re-issue a fresh cookie so this session continues while all other
  // devices are signed out.
  await createSessionCookie(updated.id, updated.tokenVersion);
  await logActivity({ userId: user.id, action: "auth.changePassword", entity: "User", entityId: user.id });

  return ok({ success: true });
});
