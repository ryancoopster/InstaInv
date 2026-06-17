// Shared types for the pricing subsystem (src/lib/pricing/*).
// These are plain-data shapes so they can be imported by both server code and,
// where useful, client components (the actual fetching is server-only).

// Which scraping strategy to apply against a product page.
export type PriceParser = "generic" | "mouser" | "mcmaster";

// Status persisted on Item.priceFetchStatus.
export type PriceFetchStatus = "ok" | "error" | "pending" | "unsupported";

// Result of a single fetch attempt. NEVER throws out of the fetcher — failures
// come back as { success:false, price:null, note }.
export interface PriceFetchResult {
  price: number | null;
  currency: string;
  source: string | null; // host/parser that produced (or attempted) the price
  success: boolean;
  status: PriceFetchStatus;
  note: string | null;
}

// Result of applyFetch(): the fetch result plus the resulting persisted item fields
// (Decimal serialized to string for the API envelope).
export interface ApplyFetchResult extends PriceFetchResult {
  itemId: string;
  lastFetchedPrice: string | null;
  priceUpdatedAt: string | null;
  priceSource: string | null;
  priceFetchStatus: PriceFetchStatus;
  priceFetchError: string | null;
}

// Summary returned by refreshMany().
export interface RefreshSummary {
  attempted: number;
  ok: number;
  failed: number;
  unsupported: number;
  skipped: number;
}

// Persisted Setting("pricing") shape.
export interface PricingSettings {
  autoEnabled: boolean;
  intervalHours: number; // how often the in-process scheduler wakes up
  staleHours: number; // an item is "stale" when its price is older than this
}

export const DEFAULT_PRICING_SETTINGS: PricingSettings = {
  autoEnabled: false,
  intervalHours: 12,
  staleHours: 24,
};

export const PRICE_PARSERS: PriceParser[] = ["generic", "mouser", "mcmaster"];

export function normalizeParser(value: string | null | undefined): PriceParser {
  if (value === "mouser" || value === "mcmaster") return value;
  return "generic";
}
