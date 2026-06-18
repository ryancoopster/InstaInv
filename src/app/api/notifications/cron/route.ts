import { route, ok, fail } from "@/lib/http";
import { compileAndSendDue } from "@/lib/notifications/service";
import { timingSafeEqual } from "crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/notifications/cron — external scheduler entry point to flush due
// approve/deny digests (for serverless/multi-instance where the in-process tick
// is unreliable). Header-secret only (NOTIFICATIONS_CRON_SECRET).
export const GET = route(async (req: Request) => {
  const secret = process.env.NOTIFICATIONS_CRON_SECRET?.trim();
  if (!secret) {
    return fail("Notifications cron is not configured (set NOTIFICATIONS_CRON_SECRET).", 503);
  }
  const provided = bearer(req.headers.get("authorization")) || req.headers.get("x-cron-secret");
  if (!provided || !safeEqual(provided, secret)) {
    return fail("Invalid cron secret", 401);
  }
  const res = await compileAndSendDue();
  return ok(res);
});

function bearer(header: string | null): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m ? m[1] : null;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
