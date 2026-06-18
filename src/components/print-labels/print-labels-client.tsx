"use client";

// Print Labels tab: filter + bulk-select items, pick an item label template,
// then open or download a single PDF with one label per selected item.

import * as React from "react";
import { Printer, Download, Loader2, X, Search } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { ItemRow } from "@/components/items/types";
import type { LabelTemplateDTO } from "@/components/labels/types";

interface Option {
  id: string;
  name: string;
}

export function PrintLabelsClient({
  categories,
  suppliers,
  boxes,
}: {
  categories: Option[];
  suppliers: Option[];
  boxes: Option[];
}) {
  // --- Filters -------------------------------------------------------------
  const [q, setQ] = React.useState("");
  const [categoryId, setCategoryId] = React.useState("");
  const [supplierId, setSupplierId] = React.useState("");
  const [boxId, setBoxId] = React.useState("");
  const [lowStockOnly, setLowStockOnly] = React.useState(false);

  // --- Data ----------------------------------------------------------------
  const [items, setItems] = React.useState<ItemRow[]>([]);
  const [loading, setLoading] = React.useState(true);

  // Selection persists across filter changes so a batch can be built up from
  // several different filters.
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  // --- Templates -----------------------------------------------------------
  const [templates, setTemplates] = React.useState<LabelTemplateDTO[]>([]);
  const [templateId, setTemplateId] = React.useState("");
  const [printing, setPrinting] = React.useState(false);

  // Load item label templates once.
  React.useEffect(() => {
    let active = true;
    (async () => {
      try {
        const all = await api.get<LabelTemplateDTO[]>("/api/labels");
        if (!active) return;
        const forItems = all.filter((t) => t.target === "ITEM");
        setTemplates(forItems);
        const def = forItems.find((t) => t.isDefault) ?? forItems[0];
        setTemplateId(def?.id ?? "");
      } catch (err) {
        const message = err instanceof ApiError ? err.message : "Could not load label templates.";
        toast.error({ title: "Templates failed to load", description: message });
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Fetch items whenever a server-side filter changes (debounced on search).
  React.useEffect(() => {
    let active = true;
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (q.trim()) params.set("q", q.trim());
        if (categoryId) params.set("categoryId", categoryId);
        if (supplierId) params.set("supplierId", supplierId);
        if (boxId) params.set("boxId", boxId);
        const data = await api.get<ItemRow[]>(`/api/items?${params.toString()}`);
        if (active) setItems(data);
      } catch (err) {
        if (active) {
          const message = err instanceof ApiError ? err.message : "Could not load items.";
          toast.error({ title: "Items failed to load", description: message });
        }
      } finally {
        if (active) setLoading(false);
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [q, categoryId, supplierId, boxId]);

  // Low-stock is a client-side filter (the items API doesn't expose it).
  const displayed = React.useMemo(
    () => (lowStockOnly ? items.filter((i) => i.quantity < i.desiredQuantity) : items),
    [items, lowStockOnly],
  );

  const displayedIds = React.useMemo(() => displayed.map((i) => i.id), [displayed]);
  const allDisplayedSelected =
    displayedIds.length > 0 && displayedIds.every((id) => selected.has(id));

  // --- Selection helpers ---------------------------------------------------
  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllDisplayed() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allDisplayedSelected) {
        for (const id of displayedIds) next.delete(id);
      } else {
        for (const id of displayedIds) next.add(id);
      }
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function clearFilters() {
    setQ("");
    setCategoryId("");
    setSupplierId("");
    setBoxId("");
    setLowStockOnly(false);
  }

  // --- Print ---------------------------------------------------------------
  async function print(downloadMode: boolean) {
    const itemIds = [...selected];
    if (!templateId) {
      toast.error("Pick a label template first");
      return;
    }
    if (itemIds.length === 0) {
      toast.error("Select at least one item");
      return;
    }
    setPrinting(true);
    try {
      const res = await fetch("/api/labels/print-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId, itemIds }),
        cache: "no-store",
      });
      if (!res.ok) {
        let message = `Print failed (${res.status})`;
        try {
          const j = await res.json();
          message = j?.error || message;
        } catch {
          /* non-JSON error body */
        }
        throw new Error(message);
      }
      const count = Number(res.headers.get("X-Label-Count")) || itemIds.length;
      const missing = Number(res.headers.get("X-Label-Missing")) || 0;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (downloadMode) {
        const a = document.createElement("a");
        a.href = url;
        a.download = "labels.pdf";
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        window.open(url, "_blank", "noopener");
      }
      // Give the new tab / download time to read the blob before revoking.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      toast.success({
        title: downloadMode ? "Labels downloaded" : "Labels ready",
        description: `${count} label${count === 1 ? "" : "s"} generated${missing ? ` (${missing} item${missing === 1 ? "" : "s"} skipped)` : ""}.`,
      });
    } catch (err) {
      toast.error({
        title: "Could not print labels",
        description: err instanceof Error ? err.message : "Unexpected error.",
      });
    } finally {
      setPrinting(false);
    }
  }

  const selectedCount = selected.size;
  const noTemplates = templates.length === 0;

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, part #, SKU…"
            className="pl-8"
          />
        </div>
        <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Category">
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} aria-label="Supplier">
          <option value="">All suppliers</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Select value={boxId} onChange={(e) => setBoxId(e.target.value)} aria-label="Box">
          <option value="">All boxes</option>
          {boxes.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={lowStockOnly} onCheckedChange={setLowStockOnly} />
          Low stock only
        </label>
        <div className="flex items-center">
          <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
            <X className="h-4 w-4" />
            Clear filters
          </Button>
        </div>
      </div>

      {/* Action toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3">
        <div className="flex items-center gap-3 text-sm">
          <span className="font-medium">
            {selectedCount} selected
          </span>
          {selectedCount > 0 && (
            <Button variant="ghost" size="sm" onClick={clearSelection} className="text-muted-foreground">
              Clear selection
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-[16rem]">
            <Select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              disabled={noTemplates}
              aria-label="Label template"
            >
              {noTemplates ? (
                <option value="">No item label templates — create one in Labels</option>
              ) : (
                templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.isDefault ? " (default)" : ""} — {t.tapeName || `${t.widthMm}×${t.heightMm}mm`}
                  </option>
                ))
              )}
            </Select>
          </div>
          <Button
            variant="outline"
            onClick={() => print(true)}
            disabled={printing || noTemplates || selectedCount === 0}
            className="gap-1.5"
          >
            <Download className="h-4 w-4" />
            Download
          </Button>
          <Button
            onClick={() => print(false)}
            disabled={printing || noTemplates || selectedCount === 0}
            className="gap-1.5"
          >
            {printing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            Print {selectedCount > 0 ? selectedCount : ""} label{selectedCount === 1 ? "" : "s"}
          </Button>
        </div>
      </div>

      {/* Items table */}
      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allDisplayedSelected}
                  onCheckedChange={toggleAllDisplayed}
                  disabled={displayed.length === 0}
                  aria-label="Select all"
                />
              </TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Part #</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Location</TableHead>
              <TableHead className="text-right">Qty</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                  <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                  Loading items…
                </TableCell>
              </TableRow>
            ) : displayed.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                  No items match these filters.
                </TableCell>
              </TableRow>
            ) : (
              displayed.map((item) => {
                const isSelected = selected.has(item.id);
                const location = item.drawer
                  ? [item.drawer.box?.name, item.drawer.label || item.drawer.name]
                      .filter(Boolean)
                      .join(" · ")
                  : "—";
                return (
                  <TableRow
                    key={item.id}
                    onClick={() => toggle(item.id)}
                    className={cn("cursor-pointer", isSelected && "bg-primary/5")}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggle(item.id)}
                        aria-label={`Select ${item.name}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell className="text-muted-foreground">{item.partNumber || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{item.category?.name || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{item.supplier?.name || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{location}</TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums",
                        item.quantity < item.desiredQuantity && "text-destructive",
                      )}
                    >
                      {item.quantity}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
