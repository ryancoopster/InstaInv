// Price extraction strategies.
//
// IMPORTANT REALITY CHECK: arbitrary e-commerce scraping is best-effort. Many
// retailers render prices with client-side JS, gate them behind login, or block
// non-browser User-Agents outright. None of these parsers can run JavaScript —
// they only see the raw HTML the server returns. So treat every "success" as a
// best guess and every "failure" as expected, not exceptional. This module is a
// pluggable framework: add a new strategy by writing a function with the same
// signature and wiring it into `pickParser` below. No external deps (no cheerio):
// we use regex/string scanning, which is fragile but dependency-free.

import type { PriceParser } from "./types";

export interface ParseOutcome {
  price: number | null;
  currency: string;
  note: string | null;
}

// ---------------------------------------------------------------------------
// Low-level helpers
// ---------------------------------------------------------------------------

// Parse a human/price string ("$1,234.56", "1.234,56", "USD 12.00") into a number.
// Returns null when nothing plausible is found.
function toNumber(raw: string | null | undefined): number | null {
  if (!raw) return null;
  let s = String(raw).trim();
  // Strip currency words/symbols and spaces, keep digits, separators and sign.
  s = s.replace(/[^0-9.,-]/g, "");
  if (!s) return null;

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  if (hasComma && hasDot) {
    // Whichever separator comes last is the decimal separator.
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      // European style "1.234,56"
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      // US style "1,234.56"
      s = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    // Ambiguous: "1,50" (decimal) vs "1,500" (thousands). If exactly two digits
    // follow the last comma treat it as a decimal separator, else thousands.
    const after = s.length - s.lastIndexOf(",") - 1;
    s = after === 2 ? s.replace(",", ".") : s.replace(/,/g, "");
  }

  const n = Number.parseFloat(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  // Sanity cap — reject absurd values that usually mean we grabbed the wrong number.
  if (n > 10_000_000) return null;
  return n;
}

function guessCurrency(html: string, near?: string): string {
  const haystack = (near ?? "") + " " + html.slice(0, 4000);
  if (/€|\bEUR\b/.test(haystack)) return "EUR";
  if (/£|\bGBP\b/.test(haystack)) return "GBP";
  if (/\bCAD\b/.test(haystack)) return "CAD";
  if (/\bJPY\b|¥/.test(haystack)) return "JPY";
  return "USD";
}

// ---------------------------------------------------------------------------
// Confident structured-data extractors (tried first by every parser)
// ---------------------------------------------------------------------------

// JSON-LD blocks: <script type="application/ld+json">{ ... "offers": { "price": 12.3 } }</script>
function fromJsonLd(html: string): ParseOutcome | null {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const block = match[1]?.trim();
    if (!block) continue;
    let data: unknown;
    try {
      data = JSON.parse(block);
    } catch {
      continue; // malformed / contains template tokens — skip
    }
    const found = findPriceInJson(data);
    if (found && found.price != null) return found;
  }
  return null;
}

// Recursively scan parsed JSON-LD for a price + currency, favouring "offers".
function findPriceInJson(node: unknown, depth = 0): ParseOutcome | null {
  if (node == null || depth > 6) return null;

  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findPriceInJson(child, depth + 1);
      if (found) return found;
    }
    return null;
  }

  if (typeof node === "object") {
    const obj = node as Record<string, unknown>;

    // Prefer an explicit offers object/array.
    if ("offers" in obj) {
      const found = findPriceInJson(obj.offers, depth + 1);
      if (found) return found;
    }

    const priceRaw =
      obj.price ?? obj.lowPrice ?? obj.highPrice ?? obj.priceAmount ?? undefined;
    if (priceRaw !== undefined) {
      const price = toNumber(typeof priceRaw === "number" ? String(priceRaw) : (priceRaw as string));
      if (price != null) {
        const currency =
          typeof obj.priceCurrency === "string" ? obj.priceCurrency.toUpperCase() : "USD";
        return { price, currency, note: "JSON-LD offers.price" };
      }
    }

    // Recurse into remaining object values.
    for (const key of Object.keys(obj)) {
      if (key === "offers" || key === "price") continue;
      const found = findPriceInJson(obj[key], depth + 1);
      if (found) return found;
    }
  }
  return null;
}

// <meta itemprop="price" content="12.34"> / property="product:price:amount" / og:price:amount
function fromMetaTags(html: string): ParseOutcome | null {
  const patterns: { re: RegExp; note: string }[] = [
    {
      re: /<meta[^>]+itemprop=["']price["'][^>]+content=["']([^"']+)["']/i,
      note: 'meta itemprop="price"',
    },
    {
      re: /<meta[^>]+content=["']([^"']+)["'][^>]+itemprop=["']price["']/i,
      note: 'meta itemprop="price"',
    },
    {
      re: /<meta[^>]+property=["']product:price:amount["'][^>]+content=["']([^"']+)["']/i,
      note: "meta product:price:amount",
    },
    {
      re: /<meta[^>]+property=["']og:price:amount["'][^>]+content=["']([^"']+)["']/i,
      note: "meta og:price:amount",
    },
    {
      re: /<meta[^>]+name=["']twitter:data1["'][^>]+content=["']([^"']*\$[^"']+)["']/i,
      note: "meta twitter:data1",
    },
  ];
  for (const { re, note } of patterns) {
    const m = re.exec(html);
    const price = toNumber(m?.[1]);
    if (price != null) {
      const currencyMatch =
        /<meta[^>]+property=["'](?:product|og):price:currency["'][^>]+content=["']([A-Z]{3})["']/i.exec(
          html,
        );
      return {
        price,
        currency: currencyMatch?.[1]?.toUpperCase() ?? guessCurrency(html, m?.[0]),
        note,
      };
    }
  }
  return null;
}

// Loose fallback: a $-pattern sitting near the word "price". Lowest confidence.
function fromDollarNearPrice(html: string): ParseOutcome | null {
  // Strip tags so "price</span><span>$1.23" still reads as adjacent text.
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  // A window of ~40 chars after the word "price" containing a $ amount.
  const re = /price[^$]{0,40}\$\s?([0-9][0-9.,]*)/i;
  const m = re.exec(text);
  let price = toNumber(m?.[1]);
  if (price != null) {
    return { price, currency: guessCurrency(html, m?.[0]), note: '$ amount near "price"' };
  }
  // Last resort: the first standalone $-amount on the page.
  const any = /\$\s?([0-9]{1,3}(?:[0-9,]*)(?:\.[0-9]{2})?)/.exec(text);
  price = toNumber(any?.[1]);
  if (price != null) {
    return { price, currency: guessCurrency(html, any?.[0]), note: "first $ amount on page" };
  }
  return null;
}

// Run the confident structured extractors in priority order.
function genericExtract(html: string): ParseOutcome | null {
  return fromJsonLd(html) ?? fromMetaTags(html) ?? fromDollarNearPrice(html);
}

// ---------------------------------------------------------------------------
// Parser strategies
// ---------------------------------------------------------------------------

// "generic" / default: structured data first, then meta, then $-near-"price".
export function parseGeneric(html: string): ParseOutcome {
  const found = genericExtract(html);
  if (found) return found;
  return { price: null, currency: guessCurrency(html), note: "No price found in page HTML" };
}

// "mouser": Mouser exposes JSON-LD/meta on many pages; try those first, then a
// couple of Mouser-specific patterns (the price is often in a unit-price cell).
export function parseMouser(html: string): ParseOutcome {
  const structured = fromJsonLd(html) ?? fromMetaTags(html);
  if (structured) return structured;

  // Mouser unit-price markup, e.g. data-testid="unit-price">$1.23
  const patterns = [
    /unit[- ]?price["'>\s:]{0,12}\$?\s?([0-9][0-9.,]*)/i,
    /"unitPrice"\s*:\s*"?\$?([0-9][0-9.,]*)"?/i,
    /class=["'][^"']*price[^"']*["'][^>]*>\s*\$?\s?([0-9][0-9.,]*)/i,
  ];
  for (const re of patterns) {
    const price = toNumber(re.exec(html)?.[1]);
    if (price != null) return { price, currency: guessCurrency(html), note: "Mouser price pattern" };
  }

  const loose = fromDollarNearPrice(html);
  if (loose) return loose;
  return {
    price: null,
    currency: "USD",
    note: "No Mouser price found (pages may require a region/JS to render pricing)",
  };
}

// "mcmaster": McMaster-Carr requires an authenticated account and renders prices
// via JavaScript, so public HTML scraping never contains a price. We attempt a
// generic extraction for completeness but the caller marks this "unsupported".
export function parseMcmaster(html: string): ParseOutcome {
  const found = genericExtract(html);
  if (found) return found; // extremely unlikely, but honour it if it ever happens
  return {
    price: null,
    currency: "USD",
    note: "McMaster prices require an authenticated account/API; public scraping returns no price.",
  };
}

export function runParser(parser: PriceParser, html: string): ParseOutcome {
  switch (parser) {
    case "mouser":
      return parseMouser(html);
    case "mcmaster":
      return parseMcmaster(html);
    case "generic":
    default:
      return parseGeneric(html);
  }
}

// Exposed for unit-level reasoning/tests.
export const __internal = { toNumber, genericExtract, fromJsonLd, fromMetaTags };
