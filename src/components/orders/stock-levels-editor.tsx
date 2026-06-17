"use client";

import * as React from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Save, PackageSearch } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { applySort, reorderQty, cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "@/components/ui/toast";
import { SortableRow } from "@/components/orders/sortable-row";
import { SortHeader, type SortState } from "@/components/orders/sort-header";

export interface StockRow {
  id: string;
  name: string;
  partNumber: string | null;
  supplier: string;
  quantity: number;
  desiredQuantity: number;
  sortOrder: number;
}

// Bulk editor for Item.desiredQuantity. Edits are staged locally and saved in
// one bulk PATCH; supports drag reorder (persisted) and column sort override.
export function StockLevelsEditor({ initial }: { initial: StockRow[] }) {
  const [rows, setRows] = React.useState<StockRow[]>(initial);
  // Staged desiredQuantity edits keyed by item id (string for free typing).
  const [edits, setEdits] = React.useState<Record<string, string>>({});
  const [sort, setSort] = React.useState<SortState>({ key: null, dir: "asc" });
  const [saving, setSaving] = React.useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const manualMode = sort.key === null;
  const view = React.useMemo(() => applySort(rows, sort.key, sort.dir), [rows, sort]);

  const dirtyCount = Object.keys(edits).filter((id) => {
    const row = rows.find((r) => r.id === id);
    return row && Number(edits[id]) !== row.desiredQuantity;
  }).length;

  function setDesired(id: string, value: string) {
    setEdits((prev) => ({ ...prev, [id]: value }));
  }

  function effectiveDesired(row: StockRow): number {
    const staged = edits[row.id];
    if (staged === undefined || staged === "") return row.desiredQuantity;
    const n = Number(staged);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : row.desiredQuantity;
  }

  async function save() {
    const updates = rows
      .filter((r) => {
        const staged = edits[r.id];
        return staged !== undefined && staged !== "" && Number(staged) !== r.desiredQuantity;
      })
      .map((r) => ({ itemId: r.id, desiredQuantity: Math.max(0, Math.floor(Number(edits[r.id]))) }));

    if (updates.length === 0) {
      toast.info("No changes to save.");
      return;
    }
    setSaving(true);
    try {
      const res = await api.patch<{ updated: number }>("/api/orders/bulk-desired", { updates });
      // Commit staged edits into the base rows.
      setRows((prev) =>
        prev.map((r) => {
          const u = updates.find((x) => x.itemId === r.id);
          return u ? { ...r, desiredQuantity: u.desiredQuantity } : r;
        }),
      );
      setEdits({});
      toast.success(`Saved ${res.updated} stock level${res.updated === 1 ? "" : "s"}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = rows.findIndex((r) => r.id === active.id);
    const newIndex = rows.findIndex((r) => r.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(rows, oldIndex, newIndex);
    setRows(next);
    try {
      // Item reorder lives in the items module; persist via its reorder endpoint.
      await api.patch("/api/items/reorder", { ids: next.map((r) => r.id) });
    } catch {
      // Non-fatal: ordering is a convenience here.
    }
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={PackageSearch}
        title="No items"
        description="Add items first, then set their desired stock levels here."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Set the target stock level for each item. Anything below target appears on the buy list.
        </p>
        <Button onClick={save} disabled={saving || dirtyCount === 0} size="sm">
          <Save className="h-4 w-4" />
          {saving ? "Saving…" : dirtyCount > 0 ? `Save ${dirtyCount} change${dirtyCount === 1 ? "" : "s"}` : "Save"}
        </Button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={onDragEnd}
      >
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <SortHeader label="Item" sortKey="name" sort={sort} onSort={setSort} />
                <SortHeader label="Supplier" sortKey="supplier" sort={sort} onSort={setSort} />
                <SortHeader
                  label="On hand"
                  sortKey="quantity"
                  sort={sort}
                  onSort={setSort}
                  className="text-right"
                />
                <SortHeader
                  label="Desired"
                  sortKey="desiredQuantity"
                  sort={sort}
                  onSort={setSort}
                  className="text-right"
                />
                <TableHead className="text-right">Shortfall</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <SortableContext
                items={view.map((r) => r.id)}
                strategy={verticalListSortingStrategy}
              >
                {view.map((row) => {
                  const desired = effectiveDesired(row);
                  const shortfall = reorderQty(row.quantity, desired);
                  const staged = edits[row.id];
                  const isDirty =
                    staged !== undefined && staged !== "" && Number(staged) !== row.desiredQuantity;
                  return (
                    <SortableRow key={row.id} id={row.id} disabled={!manualMode}>
                      <TableCell className="font-medium">
                        <div>{row.name}</div>
                        {row.partNumber && (
                          <div className="text-xs text-muted-foreground">{row.partNumber}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{row.supplier}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.quantity}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min={0}
                          inputMode="numeric"
                          value={staged ?? String(row.desiredQuantity)}
                          onChange={(e) => setDesired(row.id, e.target.value)}
                          className={cn(
                            "ml-auto h-8 w-20 text-right tabular-nums",
                            isDirty && "border-primary ring-1 ring-primary/40",
                          )}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        {shortfall > 0 ? (
                          <Badge variant="warning">{shortfall}</Badge>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                    </SortableRow>
                  );
                })}
              </SortableContext>
            </TableBody>
          </Table>
        </div>
      </DndContext>
      {!manualMode && (
        <p className="text-xs text-muted-foreground">
          Sorted by a column. Clear the sort to drag-reorder manually.
        </p>
      )}
    </div>
  );
}
