"use client";

import * as React from "react";
import { RefreshCw, ArrowDownToLine, History, Info, ExternalLink } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { PriceStatusBadge, relativeTime } from "./price-status";
import type { PriceFetchStatus, ApplyFetchResult } from "@/lib/pricing/types";
import type { SerializedPriceHistory } from "@/lib/pricing";

export interface ItemPricePanelProps {
  itemId: string;
  purchaseCost: string;
  lastFetchedPrice: string | null;
  priceUpdatedAt: string | null;
  priceFetchStatus: PriceFetchStatus | null;
  priceFetchError: string | null;
  supplierLink: string | null;
}

export function ItemPricePanel({
  itemId,
  purchaseCost,
  lastFetchedPrice,
  priceUpdatedAt,
  priceFetchStatus,
  priceFetchError,
  supplierLink,
}: ItemPricePanelProps) {
  const [cost, setCost] = React.useState(purchaseCost);
  const [fetched, setFetched] = React.useState(lastFetchedPrice);
  const [updatedAt, setUpdatedAt] = React.useState(priceUpdatedAt);
  const [status, setStatus] = React.useState<PriceFetchStatus | null>(priceFetchStatus);
  const [error, setError] = React.useState(priceFetchError);

  const [refreshing, setRefreshing] = React.useState(false);
  const [applying, setApplying] = React.useState(false);

  // Lazy-loaded history.
  const [history, setHistory] = React.useState<SerializedPriceHistory[] | null>(null);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [historyLoading, setHistoryLoading] = React.useState(false);

  const hasFetched = fetched != null;

  async function refresh() {
    setRefreshing(true);
    try {
      const result = await api.post<ApplyFetchResult>(`/api/pricing/items/${itemId}/refresh`, {});
      setFetched(result.lastFetchedPrice);
      setUpdatedAt(result.priceUpdatedAt);
      setStatus(result.priceFetchStatus);
      setError(result.priceFetchError);
      // If history is open, refresh it so the new attempt shows up.
      if (historyOpen) loadHistory(true);
      if (result.success) toast.success("Price refreshed");
      else toast.warning(result.note ?? "No price found");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  }

  async function applyToCost() {
    setApplying(true);
    try {
      const result = await api.post<{ purchaseCost: string }>(`/api/pricing/items/${itemId}/apply`, {});
      setCost(result.purchaseCost);
      toast.success("Applied fetched price to cost");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Apply failed");
    } finally {
      setApplying(false);
    }
  }

  async function loadHistory(force = false) {
    if (history && !force) return;
    setHistoryLoading(true);
    try {
      const rows = await api.get<SerializedPriceHistory[]>(
        `/api/pricing/items/${itemId}/history`,
      );
      setHistory(rows);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not load history");
    } finally {
      setHistoryLoading(false);
    }
  }

  function toggleHistory() {
    const next = !historyOpen;
    setHistoryOpen(next);
    if (next) loadHistory();
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-0.5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Recorded cost</p>
          <p className="text-lg font-semibold tabular-nums">{formatCurrency(cost)}</p>
        </div>
        <div className="space-y-0.5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Last fetched price</p>
          <div className="flex items-center gap-2">
            <p className="text-lg font-semibold tabular-nums">
              {hasFetched ? formatCurrency(fetched) : "—"}
            </p>
            <PriceStatusBadge status={status} />
          </div>
          <p className="text-xs text-muted-foreground">Updated {relativeTime(updatedAt)}</p>
        </div>
      </div>

      {error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
          <RefreshCw className={refreshing ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
          {refreshing ? "Refreshing…" : "Refresh price"}
        </Button>
        <Button variant="outline" size="sm" onClick={applyToCost} disabled={applying || !hasFetched}>
          <ArrowDownToLine className="h-3.5 w-3.5" />
          {applying ? "Applying…" : "Apply fetched price to cost"}
        </Button>
        <Button variant="ghost" size="sm" onClick={toggleHistory}>
          <History className="h-3.5 w-3.5" />
          {historyOpen ? "Hide history" : "Price history"}
        </Button>
        {supplierLink && (
          <Button variant="ghost" size="sm" asChild>
            <a href={supplierLink} target="_blank" rel="noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
              Supplier link
            </a>
          </Button>
        )}
      </div>

      {historyOpen && (
        <div className="rounded-md border border-border">
          {historyLoading ? (
            <div className="p-3">
              <Spinner size={16} label="Loading history…" />
            </div>
          ) : history && history.length > 0 ? (
            <ul className="divide-y divide-border text-sm">
              {history.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="tabular-nums">
                    {h.price != null ? formatCurrency(h.price, h.currency) : "—"}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                    {h.note || h.source || ""}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {relativeTime(h.fetchedAt)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-3 text-sm text-muted-foreground">No fetch attempts yet.</p>
          )}
        </div>
      )}

      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Price fetching is best-effort: it scrapes the supplier page and may not find a price. Sites
        that require a login (such as McMaster-Carr) come back as “unsupported”.
      </p>
    </div>
  );
}
