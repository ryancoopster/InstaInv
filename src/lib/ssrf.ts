import "server-only";

// SSRF defense for server-side fetches of user-supplied URLs (price links, etc.).
// Rejects hosts that resolve to loopback, private, link-local (incl. the cloud
// metadata endpoint 169.254.169.254), CGNAT, multicast or reserved ranges.
//
// NB: this module sits in the import graph that Next also compiles for the Edge
// runtime (via instrumentation.ts). So it must not STATICALLY import Node-only
// built-ins. We hand-roll IP detection and lazy-load `dns`/`http`/`https` with a
// webpack-ignored dynamic import — the resolving/fetching code path only ever
// executes in the Node runtime.

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

interface ResolvedAddress {
  address: string;
  family: number;
}

async function resolveAllRecords(host: string): Promise<ResolvedAddress[]> {
  const dns = await import(/* webpackIgnore: true */ "node:dns/promises");
  const records = await dns.lookup(host, { all: true });
  return records.map((r) => ({ address: r.address, family: r.family }));
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
    addrs = (await resolveAllRecords(host)).map((r) => r.address);
  } catch {
    return { ok: false, reason: "Host did not resolve" };
  }
  if (addrs.length === 0) return { ok: false, reason: "Host did not resolve" };
  for (const a of addrs) {
    if (isBlockedAddress(a)) return { ok: false, reason: "Host resolves to a private address" };
  }
  return { ok: true };
}

// SEC-1: resolve a host to a single pre-validated, publicly-routable IP that the
// connection will be PINNED to. Closes the resolve/connect TOCTOU (DNS rebinding):
// we resolve+validate once, then force the socket to that exact IP rather than
// letting the HTTP client re-resolve at connect time. Also rejects answers that
// mix public and private addresses (a rebinding tell), failing closed.
async function resolvePinnedAddress(
  host: string,
): Promise<{ address: string; family: number } | { error: string }> {
  // Literal IPs: nothing to resolve — validate the literal and pin to it.
  if (isIPv4(host)) {
    return isBlockedAddress(host)
      ? { error: "Address is not publicly routable" }
      : { address: host, family: 4 };
  }
  if (isIPv6(host)) {
    const bare = host.replace(/^\[|\]$/g, "");
    return isBlockedAddress(bare)
      ? { error: "Address is not publicly routable" }
      : { address: bare, family: 6 };
  }

  let records: ResolvedAddress[];
  try {
    records = await resolveAllRecords(host);
  } catch {
    return { error: "Host did not resolve" };
  }
  if (records.length === 0) return { error: "Host did not resolve" };
  // Validate EVERY returned address; a single private answer fails the whole set
  // (defends against public+private split answers used for rebinding).
  for (const r of records) {
    if (isBlockedAddress(r.address)) return { error: "Host resolves to a private address" };
  }
  const chosen = records[0]!;
  return { address: chosen.address, family: chosen.family };
}

// SEC-1: perform a single (non-redirect-following) request with the TCP
// connection pinned to `pinnedIp`. The original hostname is preserved for the
// Host header and TLS SNI/cert validation (Node derives both from the URL
// hostname; only the `lookup` is overridden), so we connect to the exact
// address we validated while still presenting/verifying the real host. A
// connect-time re-check on the resolved socket address aborts if it is somehow
// not the pinned, public IP (belt-and-suspenders against any re-resolution).
async function pinnedRequest(
  rawUrl: string,
  pinnedIp: string,
  family: number,
  init: RequestInit,
): Promise<Response> {
  const url = new URL(rawUrl);
  const isHttps = url.protocol === "https:";
  const mod = isHttps
    ? await import(/* webpackIgnore: true */ "node:https")
    : await import(/* webpackIgnore: true */ "node:http");

  const method = (init.method || "GET").toUpperCase();
  const headers: Record<string, string> = {};
  if (init.headers) {
    new Headers(init.headers as HeadersInit).forEach((value, key) => {
      headers[key] = value;
    });
  }

  const signal = (init as { signal?: AbortSignal }).signal;

  return await new Promise<Response>((resolve, reject) => {
    if (signal?.aborted) {
      const e = new Error("The operation was aborted");
      e.name = "AbortError";
      reject(e);
      return;
    }

    // Pin DNS: ignore the host's live records and hand the validated IP straight
    // to net.connect, so the socket cannot land on a freshly-rebound private IP.
    // net invokes this with { all: true } and then expects an array result; the
    // legacy (address, family) callback form is supported as a fallback.
    const lookup = (
      _hostname: string,
      opts: { all?: boolean } | undefined,
      cb: (
        err: Error | null,
        addressOrList: string | Array<{ address: string; family: number }>,
        family?: number,
      ) => void,
    ) => {
      if (opts && opts.all) {
        cb(null, [{ address: pinnedIp, family }]);
      } else {
        cb(null, pinnedIp, family);
      }
    };

    const req = mod.request(
      url,
      {
        method,
        headers,
        lookup: lookup as never,
        // Keep cert validation against the real hostname (default servername is
        // derived from url.hostname, NOT the pinned IP).
      },
      (res) => {
        // Connect-time re-validation: the address we actually connected to must
        // still be the pinned, publicly-routable IP. Normalize ::ffff: mapping
        // so an IPv4 pin reported in mapped form isn't a false mismatch.
        const remote = res.socket?.remoteAddress;
        if (remote) {
          const normRemote = remote.replace(/^::ffff:/i, "");
          const normPinned = pinnedIp.replace(/^::ffff:/i, "");
          if (normRemote !== normPinned || isBlockedAddress(normRemote)) {
            res.destroy();
            req.destroy();
            reject(new Error("Connection pinned to a disallowed address"));
            return;
          }
        }

        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const body = Buffer.concat(chunks);
          const resHeaders = new Headers();
          for (const [k, v] of Object.entries(res.headers)) {
            if (Array.isArray(v)) {
              for (const item of v) resHeaders.append(k, item);
            } else if (v != null) {
              resHeaders.set(k, v);
            }
          }
          const status = res.statusCode ?? 502;
          // 204/304 must not carry a body per the Response constructor.
          const hasBody = status !== 204 && status !== 304 && body.length > 0;
          resolve(
            new Response(hasBody ? new Uint8Array(body) : null, {
              status,
              statusText: res.statusMessage,
              headers: resHeaders,
            }),
          );
        });
        res.on("error", reject);
      },
    );

    const onAbort = () => {
      const e = new Error("The operation was aborted");
      e.name = "AbortError";
      req.destroy(e);
      reject(e);
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    req.on("error", reject);
    req.end();
  });
}

// fetch() that validates the target AND every redirect hop against the SSRF
// policy (a 30x to an internal host can't sneak past), and PINS each connection
// to the exact pre-validated IP so DNS rebinding between validate and connect is
// defeated (SEC-1). Keeps manual redirect handling and caps redirect hops.
export async function safeFetch(rawUrl: string, init: RequestInit = {}, maxHops = 4): Promise<Response> {
  let url = rawUrl;
  for (let hop = 0; hop <= maxHops; hop++) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error("Blocked URL: Invalid URL");
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Blocked URL: Only http(s) URLs are allowed");
    }

    // Resolve + validate + pin for THIS hop (never hand a bare hostname to the
    // HTTP client to re-resolve).
    const pin = await resolvePinnedAddress(parsed.hostname);
    if ("error" in pin) throw new Error(`Blocked URL: ${pin.error}`);

    const res = await pinnedRequest(url, pin.address, pin.family, init);
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
