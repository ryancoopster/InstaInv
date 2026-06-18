import { route, ok, fail } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { verifyPassword, createSessionCookie, needsRehash, hashPassword } from "@/lib/auth";
import { effectivePermissions } from "@/lib/permissions";
import { logActivity } from "@/lib/audit";
import { rateLimit, rateLimitReset, clientIp } from "@/lib/rate-limit";
import bcrypt from "bcryptjs";
import { z } from "zod";

const LoginSchema = z.object({
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

// Pre-computed hash so the unknown-email path spends the same time as a real
// bcrypt compare — defeats user enumeration via response-timing.
const DUMMY_HASH = bcrypt.hashSync("instainv-timing-equalizer", 12);

// Brute-force throttle: per account and (more leniently, for shared NAT) per IP.
const MAX_ATTEMPTS = 8;
const WINDOW_SEC = 15 * 60;

export const POST = route(async (req: Request) => {
  const { email, password } = LoginSchema.parse(await req.json());
  const normEmail = email.toLowerCase();
  const ip = clientIp(req);

  const ipKey = `login:ip:${ip}`;
  const acctKey = `login:acct:${normEmail}`;
  const ipLimit = rateLimit(ipKey, MAX_ATTEMPTS * 3, WINDOW_SEC);
  const acctLimit = rateLimit(acctKey, MAX_ATTEMPTS, WINDOW_SEC);
  if (!ipLimit.ok || !acctLimit.ok) {
    const retryAfterSec = Math.max(ipLimit.retryAfterSec, acctLimit.retryAfterSec);
    return fail("Too many attempts. Please try again later.", 429, { retryAfterSec });
  }

  const user = await prisma.user.findUnique({
    where: { email: normEmail },
    include: { userType: true },
  });

  // Always run a bcrypt compare (dummy when the user is unknown) so the response
  // time does not reveal whether the email exists.
  let valid = false;
  if (user) {
    valid = await verifyPassword(password, user.passwordHash);
  } else {
    await verifyPassword(password, DUMMY_HASH);
  }

  // Uniform failure for unknown email, bad password AND deactivated account — an
  // attacker can't distinguish these states.
  if (!user || !valid || !user.isActive) {
    return fail("Invalid email or password", 401);
  }

  // Success: clear this principal's throttle windows.
  rateLimitReset(ipKey);
  rateLimitReset(acctKey);

  // Transparently upgrade hashes made at an older (weaker) bcrypt cost.
  if (needsRehash(user.passwordHash)) {
    try {
      const upgraded = await hashPassword(password);
      await prisma.user.update({ where: { id: user.id }, data: { passwordHash: upgraded } });
    } catch {
      /* non-fatal: keep the existing hash */
    }
  }

  await createSessionCookie(user.id, user.tokenVersion);
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
      mustChangePassword: user.mustChangePassword,
    },
  });
});
