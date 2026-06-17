import { route, ok, fail } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { verifyPassword, createSessionCookie } from "@/lib/auth";
import { effectivePermissions } from "@/lib/permissions";
import { logActivity } from "@/lib/audit";
import { z } from "zod";

const LoginSchema = z.object({
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

export const POST = route(async (req: Request) => {
  const { email, password } = LoginSchema.parse(await req.json());

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: { userType: true },
  });

  // Constant-ish failure for both "no user" and "bad password" to avoid leaking which.
  if (!user) {
    return fail("Invalid email or password", 401);
  }
  if (!user.isActive) {
    return fail("This account is deactivated. Contact an administrator.", 403);
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return fail("Invalid email or password", 401);
  }

  await createSessionCookie(user.id);
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });
  await logActivity({ userId: user.id, action: "auth.login", entity: "User", entityId: user.id });

  const { passwordHash: _omit, ...safe } = user;
  return ok({
    user: {
      ...safe,
      userType: user.userType,
      permissions: effectivePermissions(user),
    },
  });
});
