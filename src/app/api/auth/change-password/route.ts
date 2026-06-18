import { route, ok, fail } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireUser, verifyPassword, hashPassword, createSessionCookie } from "@/lib/auth";
import { passwordSchema } from "@/lib/password";
import { logActivity } from "@/lib/audit";
import { z } from "zod";

const Schema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: passwordSchema,
  // First-login account setup (required when mustChangePassword is true).
  name: z.string().trim().min(1).optional(),
  email: z.string().trim().toLowerCase().email("Enter a valid email").optional(),
});

// POST /api/auth/change-password — self-service password change AND first-login
// account setup. On a forced (must-change) first login it also requires the user
// to set their real name + email. Clears the must-change flag, revokes other
// sessions (tokenVersion bump) and re-issues this session's cookie.
export const POST = route(async (req: Request) => {
  // SEC-2: this is the endpoint that CLEARS mustChangePassword, so it must opt out
  // of the central forced-password-change gate — otherwise a must-change account
  // would be locked out of the only path to escape that state.
  const user = await requireUser({ allowPasswordChange: true });

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message || "Invalid input", 422);
  }
  const { currentPassword, newPassword } = parsed.data;

  const fresh = await prisma.user.findUnique({ where: { id: user.id } });
  if (!fresh) return fail("User not found", 404);

  const valid = await verifyPassword(currentPassword, fresh.passwordHash);
  if (!valid) return fail("Your current password is incorrect", 400);

  const name = parsed.data.name?.trim();
  const email = parsed.data.email?.trim().toLowerCase();

  // First login: name + email are required to finish account setup.
  if (fresh.mustChangePassword && (!name || !email)) {
    return fail("Please enter your name and email to finish setting up your account", 422);
  }
  // Guard email uniqueness if it's changing.
  if (email && email !== fresh.email) {
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists && exists.id !== user.id) return fail("That email is already in use", 409);
  }

  const newHash = await hashPassword(newPassword);
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: newHash,
      mustChangePassword: false,
      tokenVersion: { increment: 1 },
      ...(name ? { name } : {}),
      ...(email ? { email } : {}),
    },
  });

  // tokenVersion was bumped, invalidating every prior JWT (incl. the current
  // cookie). Re-issue a fresh cookie so this session continues while all other
  // devices are signed out.
  await createSessionCookie(updated.id, updated.tokenVersion);
  await logActivity({ userId: user.id, action: "auth.changePassword", entity: "User", entityId: user.id });

  return ok({ success: true });
});
