import "server-only";

// Server-only price fetcher. Wraps global fetch with a desktop User-Agent and a
// hard timeout, then hands the raw HTML to a parser strategy. It NEVER throws —
// network errors, timeouts, non-2xx responses and parse misses all come back as
// a { success:false } result so callers can persist a clean error state.

import { runParser } from "./parsers";
import { normalizeParser, type PriceFetchResult, type PriceParser } from "./types";
import { assertPublicUrl, safeFetch } from "@/lib/ssrf";

// A believable desktop browser UA. Many sites 403 obvious bots; this helps a bit
// but is not a guarantee — scraping is inherently best-effort.
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const FETCH_TIMEOUT_MS = 12_000;
const MAX_HTML_BYTES = 2_000_000; // don't parse multi-MB pages; 2MB is plenty for <head>+price

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "unknown";
  }
}

export interface FetchItemPriceArgs {
  url: string;
  parser?: PriceParser | string | null;
}

export async function fetchItemPrice({ url, parser }: FetchItemPriceArgs): Promise<PriceFetchResult> {
  const strategy = normalizeParser(typeof parser === "string" ? parser : parser ?? undefined);
  const host = hostOf(url);

  // Validate the URL up front so a bad link is a clean error, not a throw.
  let parsed: URL;
  try {
    parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("unsupported protocol");
    }
  } catch {
    return {
      price: null,
      currency: "USD",
      source: host,
      success: false,
      status: "error",
      note: "Invalid or non-HTTP product URL",
    };
  }

  // SSRF guard: refuse links that resolve to private / loopback / link-local
  // (cloud metadata) addresses before making any request.
  const ssrf = await assertPublicUrl(parsed.toString());
  if (!ssrf.ok) {
    return {
      price: null,
      currency: "USD",
      source: host,
      success: false,
      status: "error",
      note: `Blocked link: ${ssrf.reason}`,
    };
  }

  // McMaster is known-unsupported regardless of fetch outcome: prices are gated
  // behind login + rendered by JS. Be honest and short-circuit with a clear note.
  if (strategy === "mcmaster") {
    return {
      price: null,
      currency: "USD",
      source: host,
      success: false,
      status: "unsupported",
      note: "McMaster prices require an authenticated account/API; public scraping is not supported.",
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    // safeFetch re-validates every redirect hop so a 30x to an internal host
    // can't bypass the up-front SSRF check.
    const res = await safeFetch(parsed.toString(), {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!res.ok) {
      return {
        price: null,
        currency: "USD",
        source: host,
        success: false,
        status: "error",
        note: `Fetch failed: HTTP ${res.status}${res.status === 403 ? " (likely bot-blocked)" : ""}`,
      };
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (contentType && !/html|xml|text|json/i.test(contentType)) {
      return {
        price: null,
        currency: "USD",
        source: host,
        success: false,
        status: "error",
        note: `Unsupported content type: ${contentType}`,
      };
    }

    const html = (await res.text()).slice(0, MAX_HTML_BYTES);
    const outcome = runParser(strategy, html);

    if (outcome.price == null) {
      return {
        price: null,
        currency: outcome.currency,
        source: host,
        success: false,
        status: "error",
        note: outcome.note ?? "No price found in page",
      };
    }

    return {
      price: outcome.price,
      currency: outcome.currency,
      source: host,
      success: true,
      status: "ok",
      note: outcome.note,
    };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      price: null,
      currency: "USD",
      source: host,
      success: false,
      status: "error",
      note: aborted
        ? `Timed out after ${Math.round(FETCH_TIMEOUT_MS / 1000)}s`
        : `Network error: ${err instanceof Error ? err.message : "unknown"}`,
    };
  } finally {
    clearTimeout(timer);
  }
}
