import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";
import { hasPermission, type PermissionKey } from "@/lib/permissions";
import { SECRET_KEY } from "@/lib/secret";
import type { User, UserType } from "@prisma/client";

export const SESSION_COOKIE = "instainv_session";

// Default 2 days (down from 7) to limit the lifetime of a stolen-but-not-yet
// -revoked token. Override with SESSION_MAX_AGE.
const MAX_AGE = Number(process.env.SESSION_MAX_AGE || 60 * 60 * 24 * 2);

// OWASP-recommended bcrypt cost. Hashes made at a lower cost are transparently
// upgraded on next login (see needsRehash + the login route).
const BCRYPT_COST = 12;

// Secure cookie on everywhere except local dev, so staging / preview / tunnel
// deployments (where NODE_ENV may not be "production") can't emit the session
// cookie over plain HTTP. Force on explicitly with COOKIE_SECURE=true.
const COOKIE_SECURE =
  process.env.COOKIE_SECURE === "true" || process.env.NODE_ENV !== "development";

export type SessionUser = User & { userType: UserType };

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** True when a stored hash predates the current cost and should be re-hashed. */
export function needsRehash(hash: string): boolean {
  try {
    return bcrypt.getRounds(hash) < BCRYPT_COST;
  } catch {
    return true;
  }
}

export async function signSession(userId: string, tokenVersion: number): Promise<string> {
  return new SignJWT({ sub: userId, v: tokenVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(SECRET_KEY);
}

export interface SessionClaims {
  userId: string;
  tokenVersion: number;
}

export async function verifySessionToken(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET_KEY);
    if (typeof payload.sub !== "string") return null;
    const v = typeof payload.v === "number" ? payload.v : 0;
    return { userId: payload.sub, tokenVersion: v };
  } catch {
    return null;
  }
}

export async function createSessionCookie(userId: string, tokenVersion: number) {
  const token = await signSession(userId, tokenVersion);
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export function destroySessionCookie() {
  cookies().set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

// Cached per-request so multiple components share one DB lookup.
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const claims = await verifySessionToken(token);
  if (!claims) return null;
  const user = await prisma.user.findUnique({
    where: { id: claims.userId },
    include: { userType: true },
  });
  if (!user || !user.isActive) return null;
  // Server-side revocation: logout / password change bumps tokenVersion, which
  // instantly invalidates every JWT issued before the bump.
  if (user.tokenVersion !== claims.tokenVersion) return null;
  return user;
});

export interface RequireUserOptions {
  // SEC-2: opt out of the central mustChangePassword gate. Only the endpoints that
  // let a user ESCAPE the must-change state (the change-password / first-login
  // setup handler) may set this — otherwise a forced account could deadlock
  // itself out of the only path to clear the flag.
  allowPasswordChange?: boolean;
}

export async function requireUser(opts: RequireUserOptions = {}): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthError("UNAUTHENTICATED");
  // SEC-2: enforce the forced-password-change flag centrally at the API boundary,
  // not only in the React layout — otherwise a valid JWT can call any permitted
  // mutating endpoint directly (curl/fetch) before finishing required setup.
  if (user.mustChangePassword && !opts.allowPasswordChange) {
    throw new AuthError("PASSWORD_CHANGE_REQUIRED");
  }
  return user;
}

export async function can(key: PermissionKey): Promise<boolean> {
  const user = await getSessionUser();
  return hasPermission(user, key);
}

export async function requirePermission(key: PermissionKey): Promise<SessionUser> {
  const user = await requireUser();
  if (!hasPermission(user, key)) throw new AuthError("FORBIDDEN", key);
  return user;
}

export class AuthError extends Error {
  constructor(
    public code: "UNAUTHENTICATED" | "FORBIDDEN" | "PASSWORD_CHANGE_REQUIRED",
    public permission?: string,
  ) {
    super(code);
    this.name = "AuthError";
  }
}
