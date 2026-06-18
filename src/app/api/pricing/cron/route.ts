import { route, ok } from "@/lib/http";
import { getPricingSettings, refreshMany } from "@/lib/pricing";
import { verifyCronSecret } from "@/lib/cron-auth";

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

  // F2: shared header-secret check (see src/lib/cron-auth.ts).
  const denied = verifyCronSecret(req, "PRICING_CRON_SECRET");
  if (denied) return denied;

  const settings = await getPricingSettings();

  // Allow overriding the stale window via query for ad-hoc runs.
  const staleOverride = Number(url.searchParams.get("staleHours"));
  const staleHours = Number.isFinite(staleOverride) && staleOverride > 0 ? staleOverride : settings.staleHours;

  const summary = await refreshMany({ staleHours, limit: 200, concurrency: 4 });
  return ok({ ...summary, staleHours });
});
