"use client";

import * as React from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  pointerWithin,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  ChevronsLeftRight,
  ChevronsUpDown,
  Move,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { cn, clamp, formatNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { BinChip } from "./BinChip";
import { COLOR_SWATCHES, type BinDetail, type DrawerItem } from "./types";

interface VirtualDrawerProps {
  drawerId: string;
  binRows: number;
  binCols: number;
  bins: BinDetail[];
  items: DrawerItem[];
  canManage: boolean;
  canReorganize: boolean;
  onChanged: () => void;
  setBins: (bins: BinDetail[]) => void;
  setItems: (updater: (items: DrawerItem[]) => DrawerItem[]) => void;
}

const UNASSIGNED = "unassigned";
const binDrop = (id: string) => `bin:${id}`;

export function VirtualDrawer({
  drawerId,
  binRows,
  binCols,
  bins,
  items,
  canManage,
  canReorganize,
  onChanged,
  setBins,
  setItems,
}: VirtualDrawerProps) {
  const [editBins, setEditBins] = React.useState(false);
  const [activeItem, setActiveItem] = React.useState<DrawerItem | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const itemsByBin = React.useMemo(() => {
    const map = new Map<string, DrawerItem[]>();
    map.set(UNASSIGNED, []);
    for (const b of bins) map.set(b.id, []);
    for (const it of items) {
      const key = it.binId && map.has(it.binId) ? it.binId : UNASSIGNED;
      map.get(key)!.push(it);
    }
    return map;
  }, [bins, items]);

  function occupiedSet(exceptBinId?: string) {
    const set = new Set<string>();
    for (const b of bins) {
      if (b.id === exceptBinId) continue;
      for (let r = b.gridRow; r < b.gridRow + b.rowSpan; r++) {
        for (let c = b.gridCol; c < b.gridCol + b.colSpan; c++) set.add(`${r}-${c}`);
      }
    }
    return set;
  }

  async function moveItem(itemId: string, targetBinId: string | null) {
    const current = items.find((i) => i.id === itemId);
    if (!current) return;
    if ((current.binId ?? null) === targetBinId) return;

    setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, binId: targetBinId } : i)));
    try {
      // Item relocation is owned by the items module endpoint.
      await api.post("/api/items/move", { itemId, drawerId, binId: targetBinId });
      onChanged();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Move failed";
      toast.error({ title: "Could not move item", description: message });
      // revert
      setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, binId: current.binId } : i)));
    }
  }

  function handleDragStart(event: DragStartEvent) {
    const itemId = (event.active.data.current as { itemId?: string } | undefined)?.itemId;
    setActiveItem(items.find((i) => i.id === itemId) ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveItem(null);
    const { active, over } = event;
    if (!over) return;
    const itemId = (active.data.current as { itemId?: string } | undefined)?.itemId;
    if (!itemId) return;
    const overId = String(over.id);
    if (overId === binDrop(UNASSIGNED)) {
      moveItem(itemId, null);
      return;
    }
    const m = /^bin:(.+)$/.exec(overId);
    if (m) moveItem(itemId, m[1]);
  }

  async function persistBin(binId: string, patch: Partial<BinDetail>) {
    try {
      await api.patch(`/api/bins/${binId}`, patch);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Could not save bin";
      toast.error({ title: "Bin not saved", description: message });
    }
  }

  function resizeBin(bin: BinDetail, dRow: number, dCol: number) {
    const rowSpan = clamp(bin.rowSpan + dRow, 1, binRows);
    const colSpan = clamp(bin.colSpan + dCol, 1, binCols);
    if (rowSpan === bin.rowSpan && colSpan === bin.colSpan) return;
    if (bin.gridRow + rowSpan > binRows || bin.gridCol + colSpan > binCols) {
      toast.error("Bin would exceed the drawer grid");
      return;
    }
    const occ = occupiedSet(bin.id);
    for (let r = bin.gridRow; r < bin.gridRow + rowSpan; r++) {
      for (let c = bin.gridCol; c < bin.gridCol + colSpan; c++) {
        if (occ.has(`${r}-${c}`)) {
          toast.error("Not enough room to resize");
          return;
        }
      }
    }
    setBins(bins.map((b) => (b.id === bin.id ? { ...b, rowSpan, colSpan } : b)));
    persistBin(bin.id, { rowSpan, colSpan });
  }

  async function addBin() {
    // Find first free cell.
    const occ = occupiedSet();
    let spot: { row: number; col: number } | null = null;
    for (let r = 0; r < binRows && !spot; r++) {
      for (let c = 0; c < binCols && !spot; c++) {
        if (!occ.has(`${r}-${c}`)) spot = { row: r, col: c };
      }
    }
    if (!spot) {
      toast.error("No empty cell — grow the drawer's bin grid first");
      return;
    }
    try {
      const bin = await api.post<BinDetail>("/api/bins", {
        drawerId,
        gridRow: spot.row,
        gridCol: spot.col,
        rowSpan: 1,
        colSpan: 1,
      });
      setBins([...bins, bin]);
      onChanged();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Could not add bin";
      toast.error({ title: "Add bin failed", description: message });
    }
  }

  async function deleteBin(bin: BinDetail) {
    try {
      await api.del(`/api/bins/${bin.id}`);
      setBins(bins.filter((b) => b.id !== bin.id));
      // Items in that bin become unassigned in the local view.
      setItems((prev) => prev.map((i) => (i.binId === bin.id ? { ...i, binId: null } : i)));
      onChanged();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Could not delete bin";
      toast.error({ title: "Delete failed", description: message });
    }
  }

  const dragEnabled = canReorganize;
  const unassigned = itemsByBin.get(UNASSIGNED) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {dragEnabled
            ? "Drag item chips between bins, or to the tray below to unassign them."
            : "A virtual layout of the drawer's bins and the items in each."}
        </p>
        {canManage && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={addBin}>
              <Plus className="h-4 w-4" />
              Add bin
            </Button>
            <Button
              variant={editBins ? "default" : "outline"}
              size="sm"
              onClick={() => setEditBins((v) => !v)}
            >
              <Move className="h-4 w-4" />
              {editBins ? "Done" : "Edit bins"}
            </Button>
          </div>
        )}
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div
          className="grid gap-2 rounded-lg border border-border bg-muted/30 p-3"
          style={{
            gridTemplateColumns: `repeat(${binCols}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${binRows}, minmax(96px, auto))`,
          }}
        >
          {bins.length === 0 && (
            <div
              className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground"
              style={{ gridColumn: `1 / span ${binCols}`, gridRow: `1 / span ${binRows}` }}
            >
              No bins yet.
              {canManage && (
                <Button variant="outline" size="sm" onClick={addBin}>
                  <Plus className="h-4 w-4" />
                  Add the first bin
                </Button>
              )}
            </div>
          )}

          {bins.map((bin) => (
            <BinCell
              key={bin.id}
              bin={bin}
              items={itemsByBin.get(bin.id) ?? []}
              editBins={editBins}
              dragEnabled={dragEnabled}
              canManage={canManage}
              onRename={(name) => {
                setBins(bins.map((b) => (b.id === bin.id ? { ...b, name } : b)));
                persistBin(bin.id, { name });
              }}
              onColor={(color) => {
                setBins(bins.map((b) => (b.id === bin.id ? { ...b, color } : b)));
                persistBin(bin.id, { color });
              }}
              onResize={(dr, dc) => resizeBin(bin, dr, dc)}
              onDelete={() => deleteBin(bin)}
            />
          ))}
        </div>

        {/* Unassigned tray (droppable) */}
        <UnassignedTray items={unassigned} dragEnabled={dragEnabled} />

        <DragOverlay>
          {activeItem ? (
            <div className="inline-flex items-center gap-1 rounded-full border border-primary bg-background px-2 py-0.5 text-xs shadow-lg">
              <span className="truncate">{activeItem.name}</span>
              <span className="rounded-full bg-muted px-1 tabular-nums">{activeItem.quantity}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function BinCell({
  bin,
  items,
  editBins,
  dragEnabled,
  canManage,
  onRename,
  onColor,
  onResize,
  onDelete,
}: {
  bin: BinDetail;
  items: DrawerItem[];
  editBins: boolean;
  dragEnabled: boolean;
  canManage: boolean;
  onRename: (name: string) => void;
  onColor: (color: string | null) => void;
  onResize: (dRow: number, dCol: number) => void;
  onDelete: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: binDrop(bin.id) });
  const [nameDraft, setNameDraft] = React.useState(bin.name ?? "");

  React.useEffect(() => setNameDraft(bin.name ?? ""), [bin.name]);

  return (
    <div
      ref={setNodeRef}
      style={{
        gridRow: `${bin.gridRow + 1} / span ${bin.rowSpan}`,
        gridColumn: `${bin.gridCol + 1} / span ${bin.colSpan}`,
      }}
      className={cn(
        "flex min-h-0 flex-col gap-1.5 rounded-md border bg-card p-2 transition-colors",
        isOver ? "border-primary ring-2 ring-primary/40" : "border-border",
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full border border-black/10"
            style={{ backgroundColor: bin.color ?? "var(--muted)" }}
          />
          {editBins ? (
            <Input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={() => onRename(nameDraft.trim())}
              placeholder="Bin name"
              className="h-6 w-28 px-1.5 text-xs"
            />
          ) : (
            <span className="truncate text-xs font-medium">{bin.name || "Bin"}</span>
          )}
        </div>
        <Badge variant="outline" className="shrink-0">
          {formatNumber(items.length)}
        </Badge>
      </div>

      {editBins && canManage && (
        <div className="flex flex-wrap items-center gap-1">
          {COLOR_SWATCHES.slice(0, 8).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onColor(c)}
              style={{ backgroundColor: c }}
              className={cn(
                "h-4 w-4 rounded-full border border-black/10",
                bin.color === c && "ring-2 ring-foreground ring-offset-1 ring-offset-card",
              )}
              aria-label={`Color ${c}`}
            />
          ))}
          <button
            type="button"
            onClick={() => onColor(null)}
            className="flex h-4 w-4 items-center justify-center rounded-full border border-border text-[9px] text-muted-foreground"
            aria-label="Clear color"
          >
            ✕
          </button>
        </div>
      )}

      <div className="flex flex-1 flex-wrap content-start gap-1">
        {items.length === 0 ? (
          <span className="text-[11px] italic text-muted-foreground">Empty</span>
        ) : (
          items.map((item) => <BinChip key={item.id} item={item} draggable={dragEnabled} />)
        )}
      </div>

      {editBins && canManage && (
        <div className="flex items-center justify-end gap-0.5 border-t border-border pt-1">
          <button
            type="button"
            className="rounded p-0.5 text-muted-foreground hover:text-foreground"
            title="Widen / narrow (shift-click to shrink)"
            onClick={(e) => onResize(0, e.shiftKey ? -1 : 1)}
          >
            <ChevronsLeftRight className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="rounded p-0.5 text-muted-foreground hover:text-foreground"
            title="Taller / shorter (shift-click to shrink)"
            onClick={(e) => onResize(e.shiftKey ? -1 : 1, 0)}
          >
            <ChevronsUpDown className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="rounded p-0.5 text-destructive hover:bg-destructive/10"
            title="Delete bin"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

function UnassignedTray({ items, dragEnabled }: { items: DrawerItem[]; dragEnabled: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `bin:${UNASSIGNED}` });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-lg border border-dashed p-3 transition-colors",
        isOver ? "border-primary bg-primary/10" : "border-border bg-muted/20",
      )}
    >
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Unassigned in this drawer
      </p>
      <div className="flex flex-wrap gap-1">
        {items.length === 0 ? (
          <span className="text-[11px] italic text-muted-foreground">
            {dragEnabled ? "Drag items here to remove them from a bin." : "None."}
          </span>
        ) : (
          items.map((item) => <BinChip key={item.id} item={item} draggable={dragEnabled} />)
        )}
      </div>
    </div>
  );
}
