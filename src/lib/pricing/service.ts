import "server-only";

// Pricing service: orchestrates fetch -> persist for one item (applyFetch) or a
// bounded batch (refreshMany), and reads/writes the Setting("pricing") row.
//
// All DB writes go through Prisma. Decimal columns are serialized to string for
// the API envelope (CONTRACT.md: Decimal -> string -> Number() in the UI).

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { fetchItemPrice } from "./fetcher";
import {
  DEFAULT_PRICING_SETTINGS,
  normalizeParser,
  type ApplyFetchResult,
  type PriceFetchStatus,
  type PricingSettings,
  type RefreshSummary,
} from "./types";

const PRICING_SETTING_KEY = "pricing";

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function getPricingSettings(): Promise<PricingSettings> {
  try {
    const row = await prisma.setting.findUnique({ where: { key: PRICING_SETTING_KEY } });
    const value = (row?.value ?? {}) as Partial<PricingSettings>;
    return {
      autoEnabled:
        typeof value.autoEnabled === "boolean"
          ? value.autoEnabled
          : DEFAULT_PRICING_SETTINGS.autoEnabled,
      intervalHours: clampNumber(value.intervalHours, DEFAULT_PRICING_SETTINGS.intervalHours, 1, 168),
      staleHours: clampNumber(value.staleHours, DEFAULT_PRICING_SETTINGS.staleHours, 1, 24 * 30),
    };
  } catch {
    return { ...DEFAULT_PRICING_SETTINGS };
  }
}

export async function savePricingSettings(patch: Partial<PricingSettings>): Promise<PricingSettings> {
  const current = await getPricingSettings();
  const next: PricingSettings = {
    autoEnabled: typeof patch.autoEnabled === "boolean" ? patch.autoEnabled : current.autoEnabled,
    intervalHours: clampNumber(patch.intervalHours, current.intervalHours, 1, 168),
    staleHours: clampNumber(patch.staleHours, current.staleHours, 1, 24 * 30),
  };
  await prisma.setting.upsert({
    where: { key: PRICING_SETTING_KEY },
    create: { key: PRICING_SETTING_KEY, value: next as unknown as Prisma.InputJsonValue },
    update: { value: next as unknown as Prisma.InputJsonValue },
  });
  return next;
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

// ---------------------------------------------------------------------------
// Single-item fetch + persist
// ---------------------------------------------------------------------------

const itemPricingSelect = {
  id: true,
  lastFetchedPrice: true,
  priceUpdatedAt: true,
  priceSource: true,
  priceFetchStatus: true,
  priceFetchError: true,
  purchaseCost: true,
} satisfies Prisma.ItemSelect;

// Run a fetch for a single item: resolve item+supplier, pick the parser, fetch,
// write a PriceHistory row, and update the Item's price fields. Returns the
// serialized result. Respects supplier.priceFetchEnabled and supplierLink.
export async function applyFetch(itemId: string): Promise<ApplyFetchResult> {
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      supplierLink: true,
      supplier: { select: { website: true, priceFetchEnabled: true, priceParser: true } },
    },
  });

  if (!item) {
    return staticResult(itemId, {
      status: "error",
      note: "Item not found",
    });
  }

  // The product URL: explicit supplierLink wins, else fall back to supplier website.
  const url = item.supplierLink?.trim() || item.supplier?.website?.trim() || "";
  if (!url) {
    return persistResult(itemId, {
      price: null,
      currency: "USD",
      source: null,
      success: false,
      status: "unsupported",
      note: "No supplier link to fetch from",
    });
  }

  // If a supplier is attached it must have price fetching enabled.
  if (item.supplier && !item.supplier.priceFetchEnabled) {
    return persistResult(itemId, {
      price: null,
      currency: "USD",
      source: null,
      success: false,
      status: "unsupported",
      note: "Price fetching is disabled for this supplier",
    });
  }

  const parser = normalizeParser(item.supplier?.priceParser);
  const result = await fetchItemPrice({ url, parser });

  return persistResult(itemId, result);
}

// Persist a fetch result onto the Item + a PriceHistory row, then return the
// serialized, API-safe shape.
async function persistResult(
  itemId: string,
  result: {
    price: number | null;
    currency: string;
    source: string | null;
    success: boolean;
    status: PriceFetchStatus;
    note: string | null;
  },
): Promise<ApplyFetchResult> {
  const now = new Date();
  const priceDecimal =
    result.price != null ? new Prisma.Decimal(result.price.toFixed(4)) : undefined;

  // Write history + item update. On success we store the fetched price; on
  // failure we keep any previous lastFetchedPrice but update status/error/time.
  const [, updated] = await prisma.$transaction([
    prisma.priceHistory.create({
      data: {
        itemId,
        price: priceDecimal ?? null,
        currency: result.currency,
        source: result.source,
        success: result.success,
        note: result.note,
        fetchedAt: now,
      },
    }),
    prisma.item.update({
      where: { id: itemId },
      data: {
        ...(result.success && priceDecimal ? { lastFetchedPrice: priceDecimal } : {}),
        priceUpdatedAt: now,
        priceSource: result.source,
        priceFetchStatus: result.status,
        priceFetchError: result.success ? null : result.note,
      },
      select: itemPricingSelect,
    }),
  ]);

  return {
    itemId,
    price: result.price,
    currency: result.currency,
    source: result.source,
    success: result.success,
    status: result.status,
    note: result.note,
    lastFetchedPrice: updated.lastFetchedPrice ? updated.lastFetchedPrice.toString() : null,
    priceUpdatedAt: updated.priceUpdatedAt ? updated.priceUpdatedAt.toISOString() : null,
    priceSource: updated.priceSource ?? null,
    priceFetchStatus: (updated.priceFetchStatus as PriceFetchStatus) ?? result.status,
    priceFetchError: updated.priceFetchError ?? null,
  };
}

// A result for cases where no item exists to persist against.
function staticResult(
  itemId: string,
  partial: { status: PriceFetchStatus; note: string },
): ApplyFetchResult {
  return {
    itemId,
    price: null,
    currency: "USD",
    source: null,
    success: false,
    status: partial.status,
    note: partial.note,
    lastFetchedPrice: null,
    priceUpdatedAt: null,
    priceSource: null,
    priceFetchStatus: partial.status,
    priceFetchError: partial.note,
  };
}

// ---------------------------------------------------------------------------
// Apply fetched price to purchaseCost
// ---------------------------------------------------------------------------

export async function applyPriceToCost(itemId: string): Promise<{ purchaseCost: string } | null> {
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    select: { lastFetchedPrice: true },
  });
  if (!item || item.lastFetchedPrice == null) return null;
  const updated = await prisma.item.update({
    where: { id: itemId },
    data: { purchaseCost: item.lastFetchedPrice },
    select: { purchaseCost: true },
  });
  return { purchaseCost: updated.purchaseCost.toString() };
}

// ---------------------------------------------------------------------------
// Batch refresh
// ---------------------------------------------------------------------------

export interface RefreshManyOptions {
  // Only refresh items whose price is older than this many hours (or never fetched).
  staleHours?: number;
  // Hard cap on how many items to process in one run.
  limit?: number;
  // Concurrency for in-flight fetches.
  concurrency?: number;
}

const DEFAULT_CONCURRENCY = 4;
const DEFAULT_LIMIT = 100;

// Refresh a bounded batch of items that have a fetchable link and an enabled
// supplier. With `staleHours`, only items older than the threshold are picked.
export async function refreshMany(opts: RefreshManyOptions = {}): Promise<RefreshSummary> {
  const concurrency = Math.min(Math.max(opts.concurrency ?? DEFAULT_CONCURRENCY, 1), 8);
  const limit = Math.min(Math.max(opts.limit ?? DEFAULT_LIMIT, 1), 500);

  const ids = await selectRefreshableItemIds({ staleHours: opts.staleHours, limit });

  const summary: RefreshSummary = {
    attempted: 0,
    ok: 0,
    failed: 0,
    unsupported: 0,
    skipped: 0,
  };

  // Simple worker-pool: `concurrency` workers pull from a shared cursor.
  let cursor = 0;
  async function worker() {
    while (cursor < ids.length) {
      const index = cursor++;
      const id = ids[index];
      summary.attempted++;
      try {
        const result = await applyFetch(id);
        if (result.success) summary.ok++;
        else if (result.status === "unsupported") summary.unsupported++;
        else summary.failed++;
      } catch {
        // applyFetch shouldn't throw, but guard the pool anyway.
        summary.failed++;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, worker));
  return summary;
}

// Resolve the set of item ids eligible for a refresh: must have a supplierLink,
// belong to a supplier with priceFetchEnabled (when a supplier is attached the
// supplier gates it; items with a link but no supplier are still allowed), and
// — when staleHours is set — be older than the threshold.
async function selectRefreshableItemIds(opts: {
  staleHours?: number;
  limit: number;
}): Promise<string[]> {
  const staleBefore =
    opts.staleHours != null
      ? new Date(Date.now() - opts.staleHours * 60 * 60 * 1000)
      : null;

  const where: Prisma.ItemWhereInput = {
    supplierLink: { not: null },
    AND: [
      { NOT: { supplierLink: "" } },
      // Either no supplier, or a supplier that has fetching enabled.
      {
        OR: [{ supplierId: null }, { supplier: { is: { priceFetchEnabled: true } } }],
      },
    ],
  };

  if (staleBefore) {
    (where.AND as Prisma.ItemWhereInput[]).push({
      OR: [{ priceUpdatedAt: null }, { priceUpdatedAt: { lt: staleBefore } }],
    });
  }

  const rows = await prisma.item.findMany({
    where,
    orderBy: [{ priceUpdatedAt: { sort: "asc", nulls: "first" } }, { sortOrder: "asc" }],
    take: opts.limit,
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

// ---------------------------------------------------------------------------
// History (read)
// ---------------------------------------------------------------------------

export interface SerializedPriceHistory {
  id: string;
  price: string | null;
  currency: string;
  source: string | null;
  success: boolean;
  note: string | null;
  fetchedAt: string;
}

export async function getPriceHistory(itemId: string, take = 20): Promise<SerializedPriceHistory[]> {
  const rows = await prisma.priceHistory.findMany({
    where: { itemId },
    orderBy: { fetchedAt: "desc" },
    take: Math.min(Math.max(take, 1), 100),
  });
  return rows.map((r) => ({
    id: r.id,
    price: r.price ? r.price.toString() : null,
    currency: r.currency,
    source: r.source,
    success: r.success,
    note: r.note,
    fetchedAt: r.fetchedAt.toISOString(),
  }));
}
