"use client";

import * as React from "react";
import { Check, RotateCcw, Save, AlertTriangle } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { applySort } from "@/lib/utils";
import { usePermissions } from "@/components/shell/permission-context";
import { api, ApiError } from "@/lib/api";
import { toast } from "@/components/ui/toast";
import type { ApplyResult, BoxOption, ParsedRow } from "./types";

interface EditRow extends ParsedRow {
  // The value the user will apply. Starts from parsedQty.
  value: string;
  include: boolean;
}

function confidenceBadge(confidence: number, matchedBy: ParsedRow["matchedBy"]) {
  if (matchedBy === "none" || confidence <= 0) {
    return <Badge variant="outline">No match</Badge>;
  }
  if (confidence >= 0.85) return <Badge variant="success">High</Badge>;
  if (confidence >= 0.5) return <Badge variant="warning">Medium</Badge>;
  return <Badge variant="destructive">Low</Badge>;
}

const MATCH_LABEL: Record<ParsedRow["matchedBy"], string> = {
  code: "barcode/code",
  partNumber: "part #",
  sku: "SKU",
  barcode: "barcode",
  name: "name",
  none: "—",
};

type SortKey = "confidence" | "name" | "currentQty" | "value";

export function OcrReviewTable({
  box,
  rows,
  onApplied,
  onReset,
}: {
  box: BoxOption;
  rows: ParsedRow[];
  onApplied?: (result: ApplyResult) => void;
  onReset?: () => void;
}) {
  const { can } = usePermissions();
  const canApply = can("items.adjustQuantity");

  const [edits, setEdits] = React.useState<EditRow[]>(() =>
    rows.map((r, i) => ({
      ...r,
      // Preserve the parse ordering as the manual default sort.
      sortOrder: i,
      value: r.parsedQty != null ? String(r.parsedQty) : "",
      // Default to including rows we actually parsed a number for.
      include: r.parsedQty != null,
    })) as unknown as EditRow[],
  );
  const [sortKey, setSortKey] = React.useState<SortKey | null>("confidence");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("desc");
  const [saving, setSaving] = React.useState(false);

  // Keep edits in sync if a fresh parse comes in.
  React.useEffect(() => {
    setEdits(
      rows.map((r, i) => ({
        ...r,
        sortOrder: i,
        value: r.parsedQty != null ? String(r.parsedQty) : "",
        include: r.parsedQty != null,
      })) as unknown as EditRow[],
    );
  }, [rows]);

  const setField = (itemId: string, patch: Partial<EditRow>) => {
    setEdits((prev) => prev.map((e) => (e.itemId === itemId ? { ...e, ...patch } : e)));
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  const view = React.useMemo(() => {
    // For "value" sort we need a numeric proxy; map empty to -1.
    const withNumeric = edits.map((e) => ({
      ...e,
      valueNum: e.value === "" ? -1 : Number(e.value),
    }));
    const key = sortKey === "value" ? "valueNum" : sortKey;
    return applySort(withNumeric, key, sortDir);
  }, [edits, sortKey, sortDir]);

  const includedCount = edits.filter((e) => e.include).length;
  const changedCount = edits.filter(
    (e) => e.include && e.value !== "" && Number(e.value) !== e.currentQty,
  ).length;

  const allIncluded = includedCount === edits.length && edits.length > 0;
  const toggleAll = () => {
    const next = !allIncluded;
    setEdits((prev) => prev.map((e) => ({ ...e, include: next })));
  };

  async function handleApply() {
    const updates = edits
      .filter((e) => e.include && e.value !== "" && Number.isFinite(Number(e.value)))
      .map((e) => ({ itemId: e.itemId, quantity: Math.max(0, Math.round(Number(e.value))) }));

    if (updates.length === 0) {
      toast.warning("Nothing selected to apply.");
      return;
    }

    setSaving(true);
    try {
      const result = await api.post<ApplyResult>("/api/checklist/apply", { updates });
      toast.success({
        title: "Quantities updated",
        description: `${result.applied} item${result.applied === 1 ? "" : "s"} updated${
          result.skipped.length ? `, ${result.skipped.length} skipped` : ""
        }.`,
      });
      onApplied?.(result);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to apply updates.";
      toast.error({ title: "Apply failed", description: message });
    } finally {
      setSaving(false);
    }
  }

  const SortHead = ({ k, children, className }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => toggleSort(k)}
        className="inline-flex items-center gap-1 hover:text-foreground"
      >
        {children}
        {sortKey === k && <span aria-hidden>{sortDir === "asc" ? "▲" : "▼"}</span>}
      </button>
    </TableHead>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-muted/40 px-4 py-3">
        <div className="space-y-0.5 text-sm">
          <p className="font-medium text-foreground">
            Review matches for <span className="text-primary">{box.name}</span>
          </p>
          <p className="text-muted-foreground">
            {includedCount} selected • {changedCount} will change. Correct any wrong matches or
            numbers before applying.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onReset && (
            <Button variant="ghost" size="sm" onClick={onReset} disabled={saving}>
              <RotateCcw className="h-4 w-4" />
              Start over
            </Button>
          )}
          <Button onClick={handleApply} disabled={saving || !canApply || changedCount === 0}>
            {saving ? <Spinner size={16} /> : <Save className="h-4 w-4" />}
            Apply {changedCount > 0 ? `(${changedCount})` : ""}
          </Button>
        </div>
      </div>

      {!canApply && (
        <p className="flex items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground">
          <AlertTriangle className="h-4 w-4 text-warning" />
          You can review here, but applying changes requires the &quot;Adjust quantity&quot; permission.
        </p>
      )}

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
        Handwriting recognition is best-effort. Every value below was read by OCR and may be wrong —
        please verify each one against the paper sheet before applying.
      </p>

      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox checked={allIncluded} onCheckedChange={toggleAll} aria-label="Toggle all" />
              </TableHead>
              <SortHead k="name">Item</SortHead>
              <SortHead k="confidence">Match</SortHead>
              <TableHead>Read from sheet</TableHead>
              <SortHead k="currentQty" className="text-right">Current</SortHead>
              <SortHead k="value" className="text-right">Counted</SortHead>
              <TableHead className="text-right">Δ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {view.map((e) => {
              const num = e.value === "" ? null : Number(e.value);
              const delta = num == null ? null : num - e.currentQty;
              return (
                <TableRow key={e.itemId} className={e.include ? "" : "opacity-60"}>
                  <TableCell>
                    <Checkbox
                      checked={e.include}
                      onCheckedChange={(checked) => setField(e.itemId, { include: checked })}
                      aria-label={`Include ${e.name}`}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-foreground">{e.name}</div>
                    {e.unit && <div className="text-xs text-muted-foreground">unit: {e.unit}</div>}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      {confidenceBadge(e.confidence, e.matchedBy)}
                      {e.matchedBy !== "none" && (
                        <span className="text-[11px] text-muted-foreground">
                          via {MATCH_LABEL[e.matchedBy]}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[220px]">
                    {e.sourceLine ? (
                      <span className="block truncate font-mono text-xs text-muted-foreground" title={e.sourceLine}>
                        {e.sourceLine}
                      </span>
                    ) : (
                      <span className="text-xs italic text-muted-foreground">no line found</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {e.currentQty}
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={e.value}
                      onChange={(ev) => setField(e.itemId, { value: ev.target.value, include: true })}
                      className="ml-auto h-8 w-24 text-right tabular-nums"
                      placeholder="—"
                    />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {delta == null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : delta === 0 ? (
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <Check className="h-3.5 w-3.5" /> 0
                      </span>
                    ) : (
                      <Badge variant={delta > 0 ? "success" : "destructive"}>
                        {delta > 0 ? "+" : ""}
                        {delta}
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {view.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                  No items to review for this box.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
