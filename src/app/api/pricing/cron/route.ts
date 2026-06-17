import { route, ok, fail } from "@/lib/http";
import { can } from "@/lib/auth";
import { getPricingSettings, refreshMany } from "@/lib/pricing";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/pricing/cron — entry point for an EXTERNAL scheduler (Vercel Cron,
// GitHub Actions, a host crontab, etc.) to trigger a stale-item refresh.
//
// Auth model:
//  - If PRICING_CRON_SECRET is set, require it via the `Authorization: Bearer
//    <secret>`, `x-cron-secret` header, or `?secret=` query param. This lets a
//    headless scheduler call it without a session cookie.
//  - If no secret is configured, fall back to requiring an authenticated user
//    with pricing.manage (so the endpoint is never wide open).
export const GET = route(async (req: Request) => {
  const url = new URL(req.url);
  const secret = process.env.PRICING_CRON_SECRET?.trim();

  if (secret) {
    const provided =
      bearer(req.headers.get("authorization")) ||
      req.headers.get("x-cron-secret") ||
      url.searchParams.get("secret");
    if (provided !== secret) return fail("Invalid cron secret", 401);
  } else {
    // No secret configured — only allow an authenticated manager to trigger it.
    if (!(await can("pricing.manage"))) {
      return fail("Cron secret not configured; sign in with pricing.manage to trigger.", 401);
    }
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
