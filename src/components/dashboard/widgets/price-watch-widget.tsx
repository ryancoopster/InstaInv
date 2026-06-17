"use client";

import * as React from "react";
import { formatDistanceToNow } from "date-fns";
import { DollarSign, CircleSlash, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { WidgetHeader } from "@/components/dashboard/widgets/widget-header";
import type { PriceWatchRow } from "@/components/dashboard/data";

function statusBadge(status: string | null) {
  switch (status) {
    case "ok":
      return { variant: "success" as const, icon: CheckCircle2, label: "OK" };
    case "error":
      return { variant: "destructive" as const, icon: AlertCircle, label: "Error" };
    case "pending":
      return { variant: "warning" as const, icon: Clock, label: "Pending" };
    case "unsupported":
      return { variant: "outline" as const, icon: CircleSlash, label: "Unsupported" };
    default:
      return { variant: "outline" as const, icon: CircleSlash, label: "—" };
  }
}

export function PriceWatchWidget({
  rows,
  errorCount,
  canManageItems,
}: {
  rows: PriceWatchRow[];
  errorCount: number;
  canManageItems: boolean;
}) {
  return (
    <div className="flex h-full flex-col">
      <WidgetHeader
        icon={DollarSign}
        title="Price watch"
        description="Recently price-checked items and fetch errors."
        link={canManageItems ? { href: "/items", label: "Manage" } : undefined}
      />
      <div className="p-5 pt-3">
        {errorCount > 0 && (
          <div className="mb-3 flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>
              {errorCount} item{errorCount === 1 ? "" : "s"} failed to fetch a price.
            </span>
          </div>
        )}
        {rows.length === 0 ? (
          <EmptyState
            icon={DollarSign}
            title="No price checks yet"
            description="Items with supplier links will show their latest fetched prices here."
            className="border-0 bg-transparent py-8"
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="hidden md:table-cell">Supplier</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Checked</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const meta = statusBadge(r.priceFetchStatus);
                  const StatusIcon = meta.icon;
                  return (
                    <TableRow key={r.id} className={cn(r.priceFetchStatus === "error" && "bg-destructive/5")}>
                      <TableCell>
                        <div className="font-medium">{r.name}</div>
                        {r.priceFetchStatus === "error" && r.priceFetchError && (
                          <div className="truncate text-xs text-destructive" title={r.priceFetchError}>
                            {r.priceFetchError}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">
                        {r.supplier ?? <span className="italic">—</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.lastFetchedPrice != null ? (
                          formatCurrency(r.lastFetchedPrice)
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={meta.variant} className="gap-1">
                          <StatusIcon className="h-3 w-3" />
                          {meta.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap text-xs text-muted-foreground">
                        {r.priceUpdatedAt
                          ? formatDistanceToNow(new Date(r.priceUpdatedAt), { addSuffix: true })
                          : "never"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
