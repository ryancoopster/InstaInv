// Next.js instrumentation hook (enabled via experimental.instrumentationHook in
// next.config.mjs). `register()` runs once when the server process starts.
//
// We use it to start a conservative in-process scheduler that periodically
// refreshes STALE item prices when Setting("pricing").autoEnabled is true.
//
// IMPORTANT for production: an in-process setInterval only works for a single
// long-lived Node server. On serverless or multi-instance deploys it will either
// not run or run N times in parallel. For those, DISABLE auto-fetch here and
// instead point an EXTERNAL cron at GET /api/pricing/cron (protected by
// PRICING_CRON_SECRET). This scheduler is the convenient default for a single
// self-hosted instance.

export async function register() {
  // Only run in the Node.js server runtime (not edge, not the browser).
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Guard against double-registration across hot reloads / multiple imports.
  const g = globalThis as unknown as { __instaInvPricingScheduler?: boolean };
  if (g.__instaInvPricingScheduler) return;
  g.__instaInvPricingScheduler = true;

  // Allow opting out entirely via env (recommended for serverless/multi-instance).
  if (process.env.PRICING_SCHEDULER_DISABLED === "1") {
    console.info("[pricing] in-process scheduler disabled via PRICING_SCHEDULER_DISABLED");
    return;
  }

  try {
    // Lazy import so the heavy server-only modules aren't pulled into other runtimes.
    const { getPricingSettings, refreshMany } = await import("@/lib/pricing");

    // How often we WAKE UP to check. The actual refresh cadence is governed by
    // settings.intervalHours: we only act when enough time has elapsed since the
    // last run. A short tick keeps the effective interval responsive to settings
    // changes without polling the DB constantly.
    const TICK_MS = 5 * 60 * 1000; // 5 minutes
    let lastRunAt = 0;
    let running = false;

    const tick = async () => {
      if (running) return; // never overlap runs
      running = true;
      try {
        const settings = await getPricingSettings();
        if (!settings.autoEnabled) return;

        const intervalMs = Math.max(1, settings.intervalHours) * 60 * 60 * 1000;
        if (Date.now() - lastRunAt < intervalMs) return;

        lastRunAt = Date.now();
        const summary = await refreshMany({
          staleHours: settings.staleHours,
          limit: 100,
          concurrency: 2, // keep it gentle in the background
        });
        console.info("[pricing] scheduled refresh", summary);
      } catch (err) {
        // Never let the scheduler crash the server.
        console.error("[pricing] scheduled refresh failed", err);
      } finally {
        running = false;
      }
    };

    const timer = setInterval(() => {
      void tick();
    }, TICK_MS);
    // Don't keep the event loop alive solely for this timer.
    if (typeof timer.unref === "function") timer.unref();

    console.info("[pricing] in-process scheduler started (tick every 5m; honors Setting('pricing'))");
  } catch (err) {
    console.error("[pricing] failed to start scheduler", err);
  }

  // --- Approve/deny digest email scheduler -------------------------------

  // SCHED-2: opt-out env mirroring PRICING_SCHEDULER_DISABLED. On serverless /
  // multi-instance, set this and rely on the external GET /api/notifications/cron
  // endpoint instead (avoids redundant per-instance polling/contention).
  if (process.env.NOTIFICATIONS_SCHEDULER_DISABLED === "1") {
    console.info(
      "[notifications] in-process scheduler disabled via NOTIFICATIONS_SCHEDULER_DISABLED",
    );
    return;
  }

  try {
    const { compileAndSendDue } = await import("@/lib/notifications/service");
    // SCHED-1: tick at the debounce granularity rather than every 60s — a 1-minute
    // tick against a default 5-minute debounce buys no responsiveness and wakes 5x
    // per window. 2 minutes keeps latency well under the window while ~halving the
    // idle polling.
    const NOTIF_TICK_MS = 2 * 60 * 1000;
    let notifRunning = false;
    const notifTimer = setInterval(() => {
      void (async () => {
        if (notifRunning) return;
        notifRunning = true;
        try {
          const res = await compileAndSendDue();
          if (res.sent > 0) console.info("[notifications] sent digests", res);
        } catch (e) {
          console.error("[notifications] tick failed", e);
        } finally {
          notifRunning = false;
        }
      })();
    }, NOTIF_TICK_MS);
    if (typeof notifTimer.unref === "function") notifTimer.unref();
    console.info("[notifications] digest scheduler started (tick every 2m; debounce honors Setting('notifications'))");
  } catch (err) {
    console.error("[notifications] failed to start scheduler", err);
  }
}
