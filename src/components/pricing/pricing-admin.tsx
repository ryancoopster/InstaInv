"use client";

import * as React from "react";
import { RefreshCw, Save, Info } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { PriceStatusBadge, relativeTime } from "./price-status";
import type {
  PricingSettings,
  PriceFetchStatus,
  ApplyFetchResult,
  RefreshSummary,
} from "@/lib/pricing/types";

export interface PricingItemRow {
  id: string;
  name: string;
  partNumber: string | null;
  supplier: { name: string } | null;
  supplierLink: string | null;
  purchaseCost: string;
  lastFetchedPrice: string | null;
  priceUpdatedAt: string | null;
  priceFetchStatus: PriceFetchStatus | null;
}

export interface PricingSupplierRow {
  id: string;
  name: string;
  priceFetchEnabled: boolean;
  priceParser: string | null;
  website: string | null;
}

interface PricingAdminProps {
  settings: PricingSettings;
  items: PricingItemRow[];
  suppliers: PricingSupplierRow[];
}

export function PricingAdmin({ settings, items, suppliers }: PricingAdminProps) {
  const [rows, setRows] = React.useState<PricingItemRow[]>(items);
  React.useEffect(() => setRows(items), [items]);

  // ---- Settings card state ----
  const [autoEnabled, setAutoEnabled] = React.useState(settings.autoEnabled);
  const [intervalHours, setIntervalHours] = React.useState(String(settings.intervalHours));
  const [staleHours, setStaleHours] = React.useState(String(settings.staleHours));
  const [savingSettings, setSavingSettings] = React.useState(false);

  async function saveSettings() {
    setSavingSettings(true);
    try {
      const saved = await api.patch<PricingSettings>("/api/pricing/settings", {
        autoEnabled,
        intervalHours: Number(intervalHours),
        staleHours: Number(staleHours),
      });
      setAutoEnabled(saved.autoEnabled);
      setIntervalHours(String(saved.intervalHours));
      setStaleHours(String(saved.staleHours));
      toast.success("Pricing settings saved");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSavingSettings(false);
    }
  }

  // ---- Refresh all ----
  const [refreshingAll, setRefreshingAll] = React.useState(false);
  const [summary, setSummary] = React.useState<RefreshSummary | null>(null);

  async function refreshAll() {
    setRefreshingAll(true);
    try {
      const result = await api.post<RefreshSummary>("/api/pricing/refresh-all", {});
      setSummary(result);
      toast.success(
        `Refreshed ${result.attempted} item${result.attempted === 1 ? "" : "s"}: ${result.ok} ok, ${result.failed} failed`,
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Refresh failed");
    } finally {
      setRefreshingAll(false);
    }
  }

  // ---- Per-row actions ----
  const [busyId, setBusyId] = React.useState<string | null>(null);

  async function refreshRow(id: string) {
    setBusyId(id);
    try {
      const result = await api.post<ApplyFetchResult>(`/api/pricing/items/${id}/refresh`, {});
      setRows((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                lastFetchedPrice: result.lastFetchedPrice,
                priceUpdatedAt: result.priceUpdatedAt,
                priceFetchStatus: result.priceFetchStatus,
              }
            : r,
        ),
      );
      if (result.success) toast.success(`Updated price for "${rowName(id)}"`);
      else toast.warning(result.note ?? "No price found");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Refresh failed");
    } finally {
      setBusyId(null);
    }
  }

  async function applyRow(id: string) {
    setBusyId(id);
    try {
      const result = await api.post<{ purchaseCost: string }>(`/api/pricing/items/${id}/apply`, {});
      setRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, purchaseCost: result.purchaseCost } : r)),
      );
      toast.success("Applied fetched price to cost");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Apply failed");
    } finally {
      setBusyId(null);
    }
  }

  function rowName(id: string) {
    return rows.find((r) => r.id === id)?.name ?? "item";
  }

  const enabledSuppliers = suppliers.filter((s) => s.priceFetchEnabled).length;

  return (
    <div className="space-y-6">
      {/* Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Auto price fetching</CardTitle>
          <CardDescription>
            Configure the background scheduler that refreshes prices from supplier links.
            {" "}
            {enabledSuppliers} of {suppliers.length} supplier{suppliers.length === 1 ? "" : "s"}{" "}
            have price fetching enabled.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <Label htmlFor="auto-enabled">Enable automatic refresh</Label>
              <p className="text-xs text-muted-foreground">
                When on, prices refresh on the interval below.
              </p>
            </div>
            <Switch
              id="auto-enabled"
              checked={autoEnabled}
              onCheckedChange={setAutoEnabled}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="interval-hours">Refresh interval (hours)</Label>
              <Input
                id="interval-hours"
                type="number"
                min={1}
                max={168}
                value={intervalHours}
                onChange={(e) => setIntervalHours(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">How often the scheduler wakes up (1–168).</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="stale-hours">Stale after (hours)</Label>
              <Input
                id="stale-hours"
                type="number"
                min={1}
                max={720}
                value={staleHours}
                onChange={(e) => setStaleHours(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Only items older than this are auto-refreshed.
              </p>
            </div>
          </div>
        </CardContent>
        <CardFooter className="justify-end">
          <Button onClick={saveSettings} disabled={savingSettings}>
            <Save className="h-4 w-4" />
            {savingSettings ? "Saving…" : "Save settings"}
          </Button>
        </CardFooter>
      </Card>

      {/* Refresh all */}
      <Card>
        <CardHeader>
          <CardTitle>Refresh now</CardTitle>
          <CardDescription>
            Fetch current prices for all items that have a fetchable supplier link.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={refreshAll} disabled={refreshingAll}>
            <RefreshCw className={refreshingAll ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            {refreshingAll ? "Refreshing…" : "Refresh all now"}
          </Button>
          {summary && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="secondary">Attempted {summary.attempted}</Badge>
              <Badge variant="success">OK {summary.ok}</Badge>
              <Badge variant="destructive">Failed {summary.failed}</Badge>
              <Badge variant="warning">Unsupported {summary.unsupported}</Badge>
              {summary.skipped > 0 && <Badge variant="outline">Skipped {summary.skipped}</Badge>}
            </div>
          )}
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Live scraping is best-effort. Many sites block or vary their markup, so a fetch may
            return no price. McMaster-Carr requires a login, so those items come back as
            “unsupported”.
          </p>
        </CardContent>
      </Card>

      {/* Items table */}
      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
          <CardDescription>
            Refresh a single item or apply its fetched price to the recorded cost.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <div className="border-t border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Part #</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Fetched price</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const busy = busyId === row.id;
                  const hasFetched = row.lastFetchedPrice != null;
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.partNumber || "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.supplier?.name || "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(row.purchaseCost)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {hasFetched ? (
                          formatCurrency(row.lastFetchedPrice)
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {relativeTime(row.priceUpdatedAt)}
                      </TableCell>
                      <TableCell>
                        <PriceStatusBadge status={row.priceFetchStatus} />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={() => refreshRow(row.id)}
                          >
                            <RefreshCw className={busy ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
                            Refresh
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy || !hasFetched}
                            onClick={() => applyRow(row.id)}
                          >
                            Apply to cost
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
