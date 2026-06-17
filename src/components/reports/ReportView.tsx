"use client";

import * as React from "react";
import {
  DollarSign,
  Truck,
  ListOrdered,
  PackageCheck,
  RefreshCw,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ShoppingCart,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { applySort, formatCurrency, formatNumber } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { SelectField } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { ExportButtons } from "./ExportButtons";
import type {
  ReorderReport,
  ReportLine,
  SupplierOption,
} from "./lib/types";

export interface ReportViewProps {
  initialReport: ReorderReport;
  supplierOptions: SupplierOption[];
  canExport: boolean;
}

type SortKey = "name" | "partNumber" | "current" | "desired" | "needed" | "unitCost" | "lineTotal";

// Lines carry Decimal-as-string for money, but applySort needs sortable numbers
// for the cost columns. Project to a sortable row before sorting.
interface SortableLine extends ReportLine {
  unitCostNum: number;
  lineTotalNum: number;
}

function toSortable(line: ReportLine): SortableLine {
  return {
    ...line,
    unitCostNum: Number(line.unitCost),
    lineTotalNum: Number(line.lineTotal),
  };
}

const SORT_FIELD: Record<SortKey, keyof SortableLine> = {
  name: "name",
  partNumber: "partNumber",
  current: "current",
  desired: "desired",
  needed: "needed",
  unitCost: "unitCostNum",
  lineTotal: "lineTotalNum",
};

export function ReportView({ initialReport, supplierOptions, canExport }: ReportViewProps) {
  const [report, setReport] = React.useState<ReorderReport>(initialReport);
  const [supplierId, setSupplierId] = React.useState<string>("all");
  const [onlyBelowMin, setOnlyBelowMin] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  // Definable column sort that overrides the report's natural (name) order at
  // view time. null => keep the server order.
  const [sortKey, setSortKey] = React.useState<SortKey | null>(null);
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("asc");

  const currency = report.currency;

  const refresh = React.useCallback(
    async (next: { supplierId: string; onlyBelowMin: boolean }) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (next.supplierId && next.supplierId !== "all") params.set("supplierId", next.supplierId);
        if (next.onlyBelowMin) params.set("onlyBelowMin", "1");
        const qs = params.toString();
        const data = await api.get<ReorderReport>(`/api/reports/reorder${qs ? `?${qs}` : ""}`);
        setReport(data);
      } catch (err) {
        toast.error({
          title: "Could not refresh report",
          description: err instanceof ApiError ? err.message : "Unexpected error.",
        });
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  function onSupplierChange(value: string) {
    setSupplierId(value);
    void refresh({ supplierId: value, onlyBelowMin });
  }

  function onToggleBelowMin(value: boolean) {
    setOnlyBelowMin(value);
    void refresh({ supplierId, onlyBelowMin: value });
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      if (sortDir === "asc") {
        setSortDir("desc");
      } else {
        // third click clears the override -> back to server order
        setSortKey(null);
        setSortDir("asc");
      }
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function sortLines(lines: ReportLine[]): ReportLine[] {
    if (!sortKey) return lines;
    const sortable = lines.map(toSortable);
    return applySort(sortable, SORT_FIELD[sortKey] as string, sortDir);
  }

  const stats = [
    {
      label: "Total to spend",
      value: formatCurrency(report.grandTotal, currency),
      icon: DollarSign,
      accent: "text-success bg-success/10",
    },
    {
      label: "Suppliers",
      value: formatNumber(report.totals.supplierCount),
      icon: Truck,
      accent: "text-primary bg-primary/10",
    },
    {
      label: "Line items",
      value: formatNumber(report.totals.lineCount),
      icon: ListOrdered,
      accent: "text-foreground bg-muted",
    },
  ];

  const empty = report.suppliers.length === 0;

  return (
    <div className="space-y-6">
      {/* Filters + export */}
      <Card>
        <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <SelectField
              label="Supplier"
              value={supplierId}
              onChange={(e) => onSupplierChange(e.target.value)}
              containerClassName="min-w-[200px]"
            >
              <option value="all">All suppliers</option>
              {supplierOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </SelectField>

            <div className="flex items-center gap-2 pb-1.5">
              <Switch
                id="onlyBelowMin"
                checked={onlyBelowMin}
                onCheckedChange={onToggleBelowMin}
                aria-label="Only items below minimum"
              />
              <Label htmlFor="onlyBelowMin" className="cursor-pointer text-sm">
                Only below minimum
              </Label>
            </div>

            <div className="flex items-center gap-2 pb-1.5 text-sm text-muted-foreground">
              {loading ? (
                <Spinner size={14} label="Updating…" />
              ) : (
                <button
                  type="button"
                  onClick={() => refresh({ supplierId, onlyBelowMin })}
                  className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-accent hover:text-accent-foreground"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Refresh
                </button>
              )}
            </div>
          </div>

          <ExportButtons
            canExport={canExport}
            filters={{ supplierId, onlyBelowMin }}
          />
        </CardContent>
      </Card>

      {/* Summary stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label}>
              <CardContent className="flex items-start justify-between gap-3 p-5">
                <div className="min-w-0 space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {s.label}
                  </p>
                  <p className="truncate text-2xl font-semibold tracking-tight">{s.value}</p>
                </div>
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${s.accent}`}>
                  <Icon className="h-5 w-5" />
                </span>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Per-supplier sections */}
      {empty ? (
        <EmptyState
          icon={PackageCheck}
          title="Nothing to reorder"
          description="Every item is at or above its desired quantity. Adjust the filters or set desired levels to see reorder suggestions here."
        />
      ) : (
        <div className="space-y-6">
          {report.suppliers.map((group) => {
            const lines = sortLines(group.lines);
            return (
              <Card key={group.supplierId} className="overflow-hidden">
                <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/40 px-5 py-3">
                  <div className="flex items-center gap-2">
                    <Truck className="h-4 w-4 text-muted-foreground" />
                    <h2 className="text-base font-semibold">{group.supplier}</h2>
                    <Badge variant="outline">
                      {group.lines.length} line{group.lines.length === 1 ? "" : "s"}
                    </Badge>
                  </div>
                  <div className="text-right">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">
                      Subtotal
                    </span>
                    <p className="text-base font-semibold tabular-nums">
                      {formatCurrency(group.subtotal, currency)}
                    </p>
                  </div>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableHead label="Item" col="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                      <SortableHead label="Part #" col="partNumber" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                      <SortableHead label="Current" col="current" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                      <SortableHead label="Desired" col="desired" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                      <SortableHead label="Reorder" col="needed" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                      <SortableHead label="Unit cost" col="unitCost" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                      <SortableHead label="Line total" col="lineTotal" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{line.name}</span>
                            {line.origin === "request" && (
                              <Badge variant="secondary" className="gap-1">
                                <ShoppingCart className="h-3 w-3" />
                                Buy list
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {line.partNumber || <span className="italic">—</span>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(line.current)}
                          {line.unit ? ` ${line.unit}` : ""}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {formatNumber(line.desired)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="warning">+{formatNumber(line.needed)}</Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(line.unitCost, currency)}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatCurrency(line.lineTotal, currency)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            );
          })}

          {/* Grand total */}
          <Card>
            <CardContent className="flex items-center justify-between gap-4 p-5">
              <div className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-success" />
                <span className="text-lg font-semibold">Grand total</span>
              </div>
              <span className="text-2xl font-bold tabular-nums">
                {formatCurrency(report.grandTotal, currency)}
              </span>
            </CardContent>
          </Card>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Generated {new Date(report.generatedAt).toLocaleString("en-US")}
        {sortKey ? " • sorted by column (overriding default order)" : ""}
      </p>
    </div>
  );
}

function SortableHead({
  label,
  col,
  align = "left",
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  col: SortKey;
  align?: "left" | "right";
  sortKey: SortKey | null;
  sortDir: "asc" | "desc";
  onSort: (key: SortKey) => void;
}) {
  const active = sortKey === col;
  const Icon = !active ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead className={align === "right" ? "text-right" : undefined}>
      <button
        type="button"
        onClick={() => onSort(col)}
        className={`inline-flex items-center gap-1 rounded hover:text-foreground ${
          align === "right" ? "flex-row-reverse" : ""
        } ${active ? "text-foreground" : ""}`}
      >
        {label}
        <Icon className="h-3 w-3 opacity-70" />
      </button>
    </TableHead>
  );
}
