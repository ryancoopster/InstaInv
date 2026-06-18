"use client";

import * as React from "react";
import { api, ApiError } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { relativeTime } from "@/components/pricing/price-status";
import type { PurchaseDTO } from "@/lib/purchases";

// Per-item purchase log shown on the item edit page. Lazy-loads on mount.
export function PurchaseHistoryPanel({ itemId }: { itemId: string }) {
  const [rows, setRows] = React.useState<PurchaseDTO[] | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await api.get<PurchaseDTO[]>(`/api/purchases?itemId=${encodeURIComponent(itemId)}`);
        if (active) setRows(data);
      } catch (err) {
        if (active) toast.error(err instanceof ApiError ? err.message : "Could not load purchases");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [itemId]);

  const total = (rows ?? []).reduce((n, p) => n + Number(p.totalCost), 0);

  return (
    <div className="rounded-lg border border-border bg-card">
      {loading ? (
        <div className="p-4">
          <Spinner size={16} label="Loading purchases…" />
        </div>
      ) : !rows || rows.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">
          No purchases recorded yet. An item appears here once it&apos;s marked received from the buy list.
        </p>
      ) : (
        <>
          <ul className="divide-y divide-border text-sm">
            {rows.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2">
                <span className="tabular-nums">
                  {p.quantity} × {formatCurrency(p.unitCost)}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  {[p.supplierName, p.purchasedByName].filter(Boolean).join(" · ")}
                  {p.appliedToStock ? "" : " · (stock not applied)"}
                </span>
                <span className="shrink-0 tabular-nums font-medium">{formatCurrency(p.totalCost)}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{relativeTime(p.purchasedAt)}</span>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between border-t border-border px-4 py-2 text-sm">
            <span className="text-muted-foreground">{rows.length} purchase{rows.length === 1 ? "" : "s"}</span>
            <span className="font-semibold tabular-nums">{formatCurrency(total)} total</span>
          </div>
        </>
      )}
    </div>
  );
}
