import "server-only";

// Lightweight in-memory fixed-window rate limiter for a SINGLE-INSTANCE
// deployment (this app runs as one long-lived Node server). For a multi-instance
// or serverless deploy, replace the Map with a shared store (e.g. Redis /
// @upstash/ratelimit) keyed the same way.

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// SEC-4: bound the Map so a spray across many distinct keys (emails/IPs) can't
// grow it without limit. Once we exceed this size we sweep expired entries
// opportunistically on write before inserting a new key.
const MAX_BUCKETS = 10_000;

function sweepExpired(now: number): void {
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
}

export function rateLimit(key: string, limit: number, windowSec: number): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    // SEC-4: prune dead buckets before adding a brand-new key, so the Map's
    // footprint tracks active windows rather than every key ever seen.
    if (!bucket && buckets.size >= MAX_BUCKETS) sweepExpired(now);
    buckets.set(key, { count: 1, resetAt: now + windowSec * 1000 });
    return { ok: true, remaining: limit - 1, retryAfterSec: 0 };
  }

  if (bucket.count >= limit) {
    return { ok: false, remaining: 0, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  bucket.count += 1;
  return { ok: true, remaining: limit - bucket.count, retryAfterSec: 0 };
}

/** Clear a key's window (e.g. after a successful login). */
export function rateLimitReset(key: string): void {
  buckets.delete(key);
}

// SEC-3: number of trusted reverse-proxy hops in front of the app (e.g. an ALB).
// X-Forwarded-For is APPENDED by each proxy, so the real client IP is the entry
// `TRUSTED_PROXY_COUNT` positions from the RIGHT — everything to its left is
// attacker-controllable and must NOT be trusted. Default 0 (no trusted proxy):
// XFF is then ignored entirely and we fall through to the shared bucket so a
// forged header can't mint unlimited per-IP buckets.
const TRUSTED_PROXY_COUNT = Math.max(0, Number(process.env.TRUSTED_PROXY_COUNT) || 0);

/**
 * Client IP for keying rate limits, derived from a TRUSTED source only.
 *
 * SEC-3: raw left-most X-Forwarded-For is spoofable client input. When the app
 * sits behind a known number of proxies (TRUSTED_PROXY_COUNT), we read XFF
 * right-to-left and skip exactly that many trusted hops to reach the genuine
 * client entry. If no trusted IP can be derived we fail CLOSED to a single
 * shared bucket ("untrusted") rather than honoring arbitrary header input, so a
 * missing/forged header cannot create a fresh per-IP bucket per request.
 */
export function clientIp(req: Request): string {
  if (TRUSTED_PROXY_COUNT > 0) {
    const xff = req.headers.get("x-forwarded-for");
    if (xff) {
      const hops = xff
        .split(",")
        .map((h) => h.trim())
        .filter(Boolean);
      // The client entry is TRUSTED_PROXY_COUNT positions from the right.
      const idx = hops.length - 1 - TRUSTED_PROXY_COUNT;
      const ip = idx >= 0 ? hops[idx] : undefined;
      if (ip) return ip;
    }
    // x-real-ip is only meaningful when an edge we control sets it.
    const real = req.headers.get("x-real-ip")?.trim();
    if (real) return real;
  }
  // No trusted proxy configured, or no trustworthy IP available: fail closed to a
  // single shared bucket instead of trusting spoofable headers.
  return "untrusted";
}
