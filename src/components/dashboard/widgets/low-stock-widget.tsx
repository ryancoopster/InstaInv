"use client";

import * as React from "react";
import { AlertTriangle, PackageCheck } from "lucide-react";
import { formatNumber } from "@/lib/utils";
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
import type { LowStockRow } from "@/components/dashboard/data";

export function LowStockWidget({
  rows,
  canViewReports,
}: {
  rows: LowStockRow[];
  canViewReports: boolean;
}) {
  return (
    <div className="flex h-full flex-col">
      <WidgetHeader
        icon={AlertTriangle}
        iconClassName="text-warning"
        title="Low stock"
        description="Items at or below their desired / minimum levels."
        link={canViewReports ? { href: "/reports", label: "Full report" } : undefined}
      />
      <div className="p-5 pt-3">
        {rows.length === 0 ? (
          <EmptyState
            icon={PackageCheck}
            title="Everything's well stocked"
            description="No items are below their desired or minimum quantity."
            className="border-0 bg-transparent py-8"
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="hidden sm:table-cell">Location</TableHead>
                  <TableHead className="text-right">Current</TableHead>
                  <TableHead className="text-right">Desired</TableHead>
                  <TableHead className="text-right">Reorder</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((it) => (
                  <TableRow key={it.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{it.name}</span>
                        {it.critical && <Badge variant="destructive">Critical</Badge>}
                      </div>
                      {it.category && (
                        <span className="text-xs text-muted-foreground">{it.category}</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">
                      {it.location || <span className="italic">Unassigned</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(it.quantity)}
                      {it.unit ? ` ${it.unit}` : ""}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatNumber(it.target)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant={it.critical ? "destructive" : "warning"}>
                        +{formatNumber(it.reorder)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
