import "server-only";
import { timingSafeEqual } from "crypto";
import { fail } from "@/lib/http";

// F2: single source for the header-secret cron auth shared by the pricing and
// notifications cron routes. Auth model: requires the secret in `envVar` via the
// `Authorization: Bearer <secret>` or `x-cron-secret` header ONLY (never a query
// param — those leak via logs/referrer). Returns a Response to send back when the
// request is unauthorized, or null when it is authorized.
export function verifyCronSecret(req: Request, envVar: string): Response | null {
  const secret = process.env[envVar]?.trim();
  if (!secret) {
    return fail(`Cron is not configured. Set ${envVar} to enable it.`, 503);
  }
  const provided = bearer(req.headers.get("authorization")) || req.headers.get("x-cron-secret");
  if (!provided || !safeEqual(provided, secret)) {
    return fail("Invalid cron secret", 401);
  }
  return null;
}

function bearer(header: string | null): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m ? m[1] : null;
}

// Constant-time comparison (length-guarded so timingSafeEqual never throws).
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
