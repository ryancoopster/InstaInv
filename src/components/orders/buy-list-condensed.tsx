"use client";

import * as React from "react";
import { PackageCheck } from "lucide-react";
import { formatCurrency, applySort, cn } from "@/lib/utils";
import { SortHeader, type SortState } from "@/components/orders/sort-header";
import type { BuyList as BuyListData, BuyListSource } from "@/components/orders/buy-list-types";

// Source chip styling for the condensed view. Mirrors the grouped view's labels
// (USER_REQUEST surfaces as "Approved") so the two modes read consistently.
const SOURCE_LABEL: Record<BuyListSource, { label: string; className: string }> = {
  STOCK_SHORTFALL: {
    label: "Shortfall",
    className: "bg-warning/15 text-warning-foreground ring-1 ring-inset ring-warning/30",
  },
  USER_REQUEST: {
    label: "Approved",
    className: "bg-secondary text-secondary-foreground ring-1 ring-inset ring-border",
  },
  ADMIN_MANUAL: {
    label: "Manual",
    className: "bg-muted text-muted-foreground ring-1 ring-inset ring-border",
  },
};

// A single flattened line, enriched with primitive sort keys (prefixed `s_`) so
// `applySort` can order by any column without colliding with object fields.
interface FlatLine {
  key: string;
  supplierId: string | null;
  supplier: string;
  partNumber: string | null;
  name: string;
  needed: number;
  unitCost: string;
  lineTotal: string;
  source: BuyListSource;
  sortOrder: number; // stable original index for the "manual" (no-sort) view
  // flat sort keys
  s_supplier: string;
  s_partNumber: string;
  s_name: string;
  s_needed: number;
  s_unitCost: number;
  s_lineTotal: number;
  s_source: string;
}

// A row in the rendered table: either a data line or a per-supplier subtotal.
type Row =
  | { kind: "line"; line: FlatLine; zebra: boolean }
  | {
      kind: "subtotal";
      supplierId: string | null;
      supplier: string;
      lineCount: number;
      supplierTotal: string;
    };

const COLS = 7; // Supplier, Part #, Item, Need, Unit Cost, Line Total, Source

export function BuyListCondensed({ data }: { data: BuyListData }) {
  // Default sort = supplier (alphabetical-ish, matching the grouped order), then
  // a column click overrides it. Clicking back to `null` restores supplier order.
  const [sort, setSort] = React.useState<SortState>({ key: null, dir: "asc" });

  // Flatten every group's lines into one list with stable indices + sort keys.
  const flat = React.useMemo<FlatLine[]>(() => {
    const out: FlatLine[] = [];
    let idx = 0;
    for (const g of data.groups) {
      for (const l of g.lines) {
        out.push({
          key: l.key,
          supplierId: g.supplierId,
          supplier: g.supplier,
          partNumber: l.partNumber,
          name: l.name,
          needed: l.needed,
          unitCost: l.unitCost,
          lineTotal: l.lineTotal,
          source: l.source,
          sortOrder: idx++,
          s_supplier: g.supplier,
          s_partNumber: l.partNumber ?? "",
          s_name: l.name,
          s_needed: l.needed,
          s_unitCost: Number(l.unitCost),
          s_lineTotal: Number(l.lineTotal),
          s_source: SOURCE_LABEL[l.source].label,
        });
      }
    }
    return out;
  }, [data]);

  // Apply the active column sort (or fall back to the original supplier-grouped
  // order via `sortOrder`). When sorting by a non-supplier column we keep a
  // secondary supplier tiebreak so identical values still cluster sensibly.
  const sorted = React.useMemo(() => {
    const base = applySort(flat, sort.key, sort.dir);
    return base;
  }, [flat, sort]);

  // Whether to draw per-supplier subtotal rows + group separators. Only when the
  // table is actually grouped by supplier (manual order or sorting by supplier),
  // because otherwise rows from one supplier are interleaved and subtotals would
  // be meaningless.
  const grouped = sort.key === null || sort.key === "s_supplier";

  // Build the final row list (lines + subtotals) and zebra striping.
  const rows = React.useMemo<Row[]>(() => {
    const out: Row[] = [];
    if (!grouped) {
      sorted.forEach((line, i) => {
        out.push({ kind: "line", line, zebra: i % 2 === 1 });
      });
      return out;
    }

    let runStart = 0;
    let zebra = false;
    const flush = (start: number, end: number) => {
      if (end <= start) return;
      const first = sorted[start];
      let total = 0;
      for (let i = start; i < end; i++) total += Number(sorted[i].lineTotal);
      out.push({
        kind: "subtotal",
        supplierId: first.supplierId,
        supplier: first.supplier,
        lineCount: end - start,
        supplierTotal: (Math.round((total + Number.EPSILON) * 100) / 100).toFixed(2),
      });
    };

    for (let i = 0; i < sorted.length; i++) {
      const line = sorted[i];
      const prev = sorted[i - 1];
      const newGroup = i > 0 && line.supplier !== prev.supplier;
      if (newGroup) {
        flush(runStart, i);
        runStart = i;
        zebra = false;
      }
      out.push({ kind: "line", line, zebra });
      zebra = !zebra;
    }
    flush(runStart, sorted.length);
    return out;
  }, [sorted, grouped]);

  const totalLines = flat.length;

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-lg border border-border">
        {/* maxHeight keeps the sticky header useful with 200+ rows; the inner
            div scrolls and the <thead> stays pinned. */}
        <div className="max-h-[70vh] overflow-auto scrollbar-thin">
          <table className="w-full border-collapse text-xs tabular-nums">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-border bg-muted/80 backdrop-blur supports-[backdrop-filter]:bg-muted/60">
                <CondHeader label="Supplier" sortKey="s_supplier" sort={sort} onSort={setSort} />
                <CondHeader label="Part #" sortKey="s_partNumber" sort={sort} onSort={setSort} />
                <CondHeader label="Item" sortKey="s_name" sort={sort} onSort={setSort} />
                <CondHeader
                  label="Need"
                  sortKey="s_needed"
                  sort={sort}
                  onSort={setSort}
                  align="right"
                />
                <CondHeader
                  label="Unit Cost"
                  sortKey="s_unitCost"
                  sort={sort}
                  onSort={setSort}
                  align="right"
                />
                <CondHeader
                  label="Line Total"
                  sortKey="s_lineTotal"
                  sort={sort}
                  onSort={setSort}
                  align="right"
                />
                <CondHeader label="Source" sortKey="s_source" sort={sort} onSort={setSort} />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                if (row.kind === "subtotal") {
                  return (
                    <tr
                      key={`sub:${row.supplierId ?? row.supplier}:${i}`}
                      className="border-y border-border bg-muted/50"
                    >
                      <td colSpan={5} className="px-3 py-1 text-right font-medium text-muted-foreground">
                        {row.supplier} subtotal
                        <span className="ml-1 font-normal">
                          ({row.lineCount} line{row.lineCount === 1 ? "" : "s"})
                        </span>
                      </td>
                      <td className="px-3 py-1 text-right font-semibold">
                        {formatCurrency(row.supplierTotal)}
                      </td>
                      <td className="px-3 py-1" />
                    </tr>
                  );
                }

                const { line, zebra } = row;
                const meta = SOURCE_LABEL[line.source];
                return (
                  <tr
                    key={line.key}
                    className={cn(
                      "border-b border-border/50 transition-colors hover:bg-accent/60",
                      zebra ? "bg-muted/20" : "bg-transparent",
                    )}
                  >
                    <td className="max-w-[14rem] truncate px-3 py-1 text-muted-foreground" title={line.supplier}>
                      {line.supplier}
                    </td>
                    <td
                      className="max-w-[10rem] truncate px-3 py-1 font-mono text-[11px] text-muted-foreground"
                      title={line.partNumber ?? undefined}
                    >
                      {line.partNumber ?? "—"}
                    </td>
                    <td className="max-w-[22rem] truncate px-3 py-1 font-medium" title={line.name}>
                      {line.name}
                    </td>
                    <td className="px-3 py-1 text-right">{line.needed}</td>
                    <td className="px-3 py-1 text-right">{formatCurrency(line.unitCost)}</td>
                    <td className="px-3 py-1 text-right font-medium">
                      {formatCurrency(line.lineTotal)}
                    </td>
                    <td className="px-3 py-1">
                      <span
                        className={cn(
                          "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                          meta.className,
                        )}
                      >
                        {meta.label}
                      </span>
                    </td>
                  </tr>
                );
              })}

              {/* Grand total */}
              <tr className="sticky bottom-0 z-10 border-t-2 border-border bg-card font-semibold">
                <td colSpan={5} className="px-3 py-2 text-right">
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <PackageCheck className="h-3.5 w-3.5" />
                    Grand total
                    <span className="font-normal">
                      ({totalLines} line{totalLines === 1 ? "" : "s"})
                    </span>
                  </span>
                </td>
                <td className="px-3 py-2 text-right text-sm">
                  {formatCurrency(data.grandTotal)}
                </td>
                <td className="px-3 py-2" />
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      {!grouped && (
        <p className="text-xs text-muted-foreground">
          Sorted by column — per-supplier subtotals are hidden. Sort by Supplier (or clear the
          sort) to see them.
        </p>
      )}
    </div>
  );
}

// A condensed, sticky-header sortable column header. Renders a real <th> (rather
// than the UI <TableHead>) so it can live inside the dense native table and
// inherit the sticky/zebra styling, while reusing the same SortState contract.
function CondHeader({
  label,
  sortKey,
  sort,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: string;
  sort: SortState;
  onSort: (next: SortState) => void;
  align?: "left" | "right";
}) {
  const active = sort.key === sortKey;

  function cycle() {
    if (!active) return onSort({ key: sortKey, dir: "asc" });
    if (sort.dir === "asc") return onSort({ key: sortKey, dir: "desc" });
    return onSort({ key: null, dir: "asc" });
  }

  return (
    <th
      className={cn(
        "h-8 whitespace-nowrap px-3 text-[11px] font-medium uppercase tracking-wide",
        align === "right" ? "text-right" : "text-left",
      )}
    >
      <button
        type="button"
        onClick={cycle}
        className={cn(
          "inline-flex items-center gap-1 transition-colors hover:text-foreground",
          align === "right" ? "flex-row-reverse" : "",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
        <SortGlyph active={active} dir={sort.dir} />
      </button>
    </th>
  );
}

function SortGlyph({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  // Inline glyphs keep the header compact; same semantics as SortHeader's icons.
  return (
    <span className="text-[10px] leading-none opacity-70">
      {!active ? "↕" : dir === "asc" ? "↑" : "↓"}
    </span>
  );
}
