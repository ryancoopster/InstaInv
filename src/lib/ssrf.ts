import "server-only";

// SSRF defense for server-side fetches of user-supplied URLs (price links, etc.).
// Rejects hosts that resolve to loopback, private, link-local (incl. the cloud
// metadata endpoint 169.254.169.254), CGNAT, multicast or reserved ranges.
//
// NB: this module sits in the import graph that Next also compiles for the Edge
// runtime (via instrumentation.ts). So it must not STATICALLY import Node-only
// built-ins. We hand-roll IP detection and lazy-load `dns` with a webpack-ignored
// dynamic import — the resolving code path only ever executes in the Node runtime.

function isIPv4(s: string): boolean {
  const m = s.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  return m.slice(1, 5).every((o) => Number(o) <= 255);
}

function isIPv6(s: string): boolean {
  const v = s.replace(/^\[|\]$/g, "");
  return v.includes(":") && /^[0-9a-f:.]+$/i.test(v);
}

function isPrivateV4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true; // fail closed
  const [a, b] = p;
  if (a === 0 || a === 127) return true; // unspecified / loopback
  if (a === 10) return true;
  if (a === 169 && b === 254) return true; // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast / reserved
  return false;
}

function isPrivateV6(ip: string): boolean {
  const v = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (v === "::1" || v === "::") return true; // loopback / unspecified
  if (v.startsWith("fe80")) return true; // link-local
  if (v.startsWith("fc") || v.startsWith("fd")) return true; // unique-local
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateV4(mapped[1]);
  return false;
}

function isBlockedAddress(ip: string): boolean {
  if (isIPv4(ip)) return isPrivateV4(ip);
  if (isIPv6(ip)) return isPrivateV6(ip);
  return true; // unknown form → block
}

async function resolveAll(host: string): Promise<string[]> {
  const dns = await import(/* webpackIgnore: true */ "node:dns/promises");
  const records = await dns.lookup(host, { all: true });
  return records.map((r) => r.address);
}

export interface SsrfCheck {
  ok: boolean;
  reason?: string;
}

// Validate a URL is http(s) and resolves only to publicly-routable addresses.
export async function assertPublicUrl(rawUrl: string): Promise<SsrfCheck> {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "Invalid URL" };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { ok: false, reason: "Only http(s) URLs are allowed" };
  }

  const host = u.hostname;
  if (isIPv4(host) || isIPv6(host)) {
    return isBlockedAddress(host)
      ? { ok: false, reason: "Address is not publicly routable" }
      : { ok: true };
  }

  let addrs: string[];
  try {
    addrs = await resolveAll(host);
  } catch {
    return { ok: false, reason: "Host did not resolve" };
  }
  if (addrs.length === 0) return { ok: false, reason: "Host did not resolve" };
  for (const a of addrs) {
    if (isBlockedAddress(a)) return { ok: false, reason: "Host resolves to a private address" };
  }
  return { ok: true };
}

// fetch() that validates the target AND every redirect hop against the SSRF
// policy (a 30x to an internal host can't sneak past). Caps redirect hops.
export async function safeFetch(rawUrl: string, init: RequestInit = {}, maxHops = 4): Promise<Response> {
  let url = rawUrl;
  for (let hop = 0; hop <= maxHops; hop++) {
    const check = await assertPublicUrl(url);
    if (!check.ok) throw new Error(`Blocked URL: ${check.reason}`);
    const res = await fetch(url, { ...init, redirect: "manual" });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return res;
      url = new URL(loc, url).toString();
      continue;
    }
    return res;
  }
  throw new Error("Too many redirects");
}
