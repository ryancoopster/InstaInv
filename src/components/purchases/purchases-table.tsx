"use client";

import * as React from "react";
import Link from "next/link";
import { Search, ShoppingCart } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency } from "@/lib/utils";
import { relativeTime } from "@/components/pricing/price-status";
import type { PurchaseDTO } from "@/lib/purchases";

export function PurchasesTable({ purchases }: { purchases: PurchaseDTO[] }) {
  const [q, setQ] = React.useState("");

  const filtered = React.useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return purchases;
    return purchases.filter((p) =>
      [p.itemName, p.partNumber, p.supplierName, p.purchasedByName].some((v) =>
        v?.toLowerCase().includes(s),
      ),
    );
  }, [q, purchases]);

  const total = filtered.reduce((n, p) => n + Number(p.totalCost), 0);

  if (purchases.length === 0) {
    return (
      <EmptyState
        icon={ShoppingCart}
        title="No purchases yet"
        description="Items appear here once they're marked received from the buy list."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search item, part #, supplier…" className="pl-8" />
      </div>
      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Item</TableHead>
              <TableHead>Part #</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Unit</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>By</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="whitespace-nowrap text-muted-foreground">{relativeTime(p.purchasedAt)}</TableCell>
                <TableCell className="font-medium">
                  {p.itemId ? (
                    <Link href={`/items/${p.itemId}`} className="hover:underline">
                      {p.itemName || "(item)"}
                    </Link>
                  ) : (
                    p.itemName || "(free-text)"
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">{p.partNumber || "—"}</TableCell>
                <TableCell className="text-muted-foreground">{p.supplierName || "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{p.quantity}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(p.unitCost)}</TableCell>
                <TableCell className="text-right tabular-nums font-medium">{formatCurrency(p.totalCost)}</TableCell>
                <TableCell className="text-muted-foreground">{p.purchasedByName || "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between px-1 text-sm">
        <span className="text-muted-foreground">
          {filtered.length} purchase{filtered.length === 1 ? "" : "s"}
          {q ? ` (filtered from ${purchases.length})` : ""}
        </span>
        <span className="font-semibold tabular-nums">{formatCurrency(total)} total</span>
      </div>
    </div>
  );
}
