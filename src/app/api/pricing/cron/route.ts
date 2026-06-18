import { route, ok, fail } from "@/lib/http";
import { getPricingSettings, refreshMany } from "@/lib/pricing";
import { timingSafeEqual } from "crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/pricing/cron — entry point for an EXTERNAL scheduler (Vercel Cron,
// GitHub Actions, a host crontab, etc.) to trigger a stale-item refresh.
//
// Auth model: requires PRICING_CRON_SECRET via the `Authorization: Bearer
// <secret>` or `x-cron-secret` header ONLY (never a query param — those leak via
// logs/referrer). There is NO authenticated-session fallback: a side-effecting
// GET must not be triggerable cross-site by a logged-in user's browser. Use the
// permission-gated POST /api/pricing/refresh-all from the UI instead.
export const GET = route(async (req: Request) => {
  const url = new URL(req.url);
  const secret = process.env.PRICING_CRON_SECRET?.trim();

  if (!secret) {
    return fail("Cron is not configured. Set PRICING_CRON_SECRET to enable it.", 503);
  }
  const provided = bearer(req.headers.get("authorization")) || req.headers.get("x-cron-secret");
  if (!provided || !safeEqual(provided, secret)) {
    return fail("Invalid cron secret", 401);
  }

  const settings = await getPricingSettings();

  // Allow overriding the stale window via query for ad-hoc runs.
  const staleOverride = Number(url.searchParams.get("staleHours"));
  const staleHours = Number.isFinite(staleOverride) && staleOverride > 0 ? staleOverride : settings.staleHours;

  const summary = await refreshMany({ staleHours, limit: 200, concurrency: 4 });
  return ok({ ...summary, staleHours });
});

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
