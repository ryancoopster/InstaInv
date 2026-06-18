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

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
}

export function rateLimit(key: string, limit: number, windowSec: number): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
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

/** Best-effort client IP from common proxy headers, for keying limits. */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}
