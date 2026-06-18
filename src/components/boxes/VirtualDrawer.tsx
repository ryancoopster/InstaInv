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
import { Move, Plus, Trash2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { cn, formatNumber } from "@/lib/utils";
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
const ROW_H = 104; // fixed cell height (px) so grid drag/resize math is consistent
const GAP = 4;

function clampInt(n: number, min: number, max: number) {
  return Math.min(Math.max(Math.round(n), min), max);
}

type DragState = {
  binId: string;
  mode: "move" | "resize";
  startX: number;
  startY: number;
  orig: Pick<BinDetail, "gridRow" | "gridCol" | "rowSpan" | "colSpan">;
};

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

  // Local grid size so we can auto-grow it (kept in sync with props).
  const [rows, setRows] = React.useState(binRows);
  const [cols, setCols] = React.useState(binCols);
  React.useEffect(() => setRows(binRows), [binRows]);
  React.useEffect(() => setCols(binCols), [binCols]);

  const gridRef = React.useRef<HTMLDivElement>(null);
  const dragRef = React.useRef<DragState | null>(null);
  const [preview, setPreview] = React.useState<{ id: string; bin: BinDetail } | null>(null);

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

  function fits(cand: Pick<BinDetail, "gridRow" | "gridCol" | "rowSpan" | "colSpan">, exceptId: string) {
    const occ = occupiedSet(exceptId);
    for (let r = cand.gridRow; r < cand.gridRow + cand.rowSpan; r++) {
      for (let c = cand.gridCol; c < cand.gridCol + cand.colSpan; c++) {
        if (occ.has(`${r}-${c}`)) return false;
      }
    }
    return true;
  }

  // Ensure there's always a spare trailing row + column for new bins.
  async function growToFit(nextBins: BinDetail[]) {
    let maxRow = 0;
    let maxCol = 0;
    for (const b of nextBins) {
      maxRow = Math.max(maxRow, b.gridRow + b.rowSpan);
      maxCol = Math.max(maxCol, b.gridCol + b.colSpan);
    }
    const neededRows = Math.max(binRows, maxRow + 1);
    const neededCols = Math.max(binCols, maxCol + 1);
    if (neededRows !== rows || neededCols !== cols) {
      setRows(neededRows);
      setCols(neededCols);
      try {
        await api.patch(`/api/drawers/${drawerId}`, { binRows: neededRows, binCols: neededCols });
      } catch {
        /* non-fatal: local grid still grew */
      }
    }
  }

  async function moveItem(itemId: string, targetBinId: string | null) {
    const current = items.find((i) => i.id === itemId);
    if (!current) return;
    if ((current.binId ?? null) === targetBinId) return;
    setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, binId: targetBinId } : i)));
    try {
      await api.post("/api/items/move", { itemId, drawerId, binId: targetBinId });
      onChanged();
    } catch (err) {
      toast.error({
        title: "Could not move item",
        description: err instanceof ApiError ? err.message : "Move failed",
      });
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
      toast.error({
        title: "Bin not saved",
        description: err instanceof ApiError ? err.message : "Could not save bin",
      });
    }
  }

  // --- Bin grid drag / resize (edit mode) ---------------------------------
  function beginBinDrag(e: React.PointerEvent, bin: BinDetail, mode: "move" | "resize") {
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = {
      binId: bin.id,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      orig: { gridRow: bin.gridRow, gridCol: bin.gridCol, rowSpan: bin.rowSpan, colSpan: bin.colSpan },
    };
    setPreview({ id: bin.id, bin });
  }

  React.useEffect(() => {
    function onMove(e: PointerEvent) {
      const drag = dragRef.current;
      const grid = gridRef.current;
      if (!drag || !grid) return;
      const rect = grid.getBoundingClientRect();
      const cellW = rect.width / cols;
      const cellH = ROW_H + GAP;
      const dCol = Math.round((e.clientX - drag.startX) / cellW);
      const dRow = Math.round((e.clientY - drag.startY) / cellH);
      const o = drag.orig;

      let cand: BinDetail | null = null;
      const base = bins.find((b) => b.id === drag.binId);
      if (!base) return;

      if (drag.mode === "move") {
        const gridCol = clampInt(o.gridCol + dCol, 0, cols - o.colSpan);
        const gridRow = clampInt(o.gridRow + dRow, 0, rows - o.rowSpan);
        cand = { ...base, gridRow, gridCol, rowSpan: o.rowSpan, colSpan: o.colSpan };
      } else {
        const colSpan = clampInt(o.colSpan + dCol, 1, cols - o.gridCol);
        const rowSpan = clampInt(o.rowSpan + dRow, 1, rows - o.gridRow);
        cand = { ...base, rowSpan, colSpan };
      }
      // Only show the preview if it doesn't collide; otherwise keep the last valid.
      if (fits(cand, drag.binId)) setPreview({ id: drag.binId, bin: cand });
    }

    async function onUp() {
      const drag = dragRef.current;
      dragRef.current = null;
      const pv = preview;
      setPreview(null);
      if (!drag || !pv) return;
      const patch = {
        gridRow: pv.bin.gridRow,
        gridCol: pv.bin.gridCol,
        rowSpan: pv.bin.rowSpan,
        colSpan: pv.bin.colSpan,
      };
      const orig = drag.orig;
      if (
        patch.gridRow === orig.gridRow &&
        patch.gridCol === orig.gridCol &&
        patch.rowSpan === orig.rowSpan &&
        patch.colSpan === orig.colSpan
      ) {
        return; // no change
      }
      const next = bins.map((b) => (b.id === drag.binId ? { ...b, ...patch } : b));
      setBins(next);
      await persistBin(drag.binId, patch);
      await growToFit(next);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  });

  async function addBin() {
    const occ = occupiedSet();
    let spot: { row: number; col: number } | null = null;
    for (let r = 0; r < rows && !spot; r++) {
      for (let c = 0; c < cols && !spot; c++) {
        if (!occ.has(`${r}-${c}`)) spot = { row: r, col: c };
      }
    }
    // Auto-grow a new row if the grid is full.
    if (!spot) spot = { row: rows, col: 0 };
    try {
      const bin = await api.post<BinDetail>("/api/bins", {
        drawerId,
        gridRow: spot.row,
        gridCol: spot.col,
        rowSpan: 1,
        colSpan: 1,
      });
      const next = [...bins, bin];
      setBins(next);
      await growToFit(next);
      onChanged();
    } catch (err) {
      toast.error({
        title: "Add bin failed",
        description: err instanceof ApiError ? err.message : "Could not add bin",
      });
    }
  }

  async function deleteBin(bin: BinDetail) {
    try {
      await api.del(`/api/bins/${bin.id}`);
      setBins(bins.filter((b) => b.id !== bin.id));
      setItems((prev) => prev.map((i) => (i.binId === bin.id ? { ...i, binId: null } : i)));
      onChanged();
    } catch (err) {
      toast.error({
        title: "Delete failed",
        description: err instanceof ApiError ? err.message : "Could not delete bin",
      });
    }
  }

  // While editing the bin layout we disable item-chip dragging so the two
  // interactions don't fight; reorganize-drag is for moving items between bins.
  const dragEnabled = canReorganize && !editBins;
  const unassigned = itemsByBin.get(UNASSIGNED) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {editBins
            ? "Drag a bin by its header to move it; drag the corner handle to resize. The grid grows automatically."
            : dragEnabled
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
          ref={gridRef}
          className={cn(
            "relative grid rounded-lg border bg-muted/30 p-0",
            editBins ? "border-primary/40" : "border-border",
          )}
          style={{
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${rows}, ${ROW_H}px)`,
            gap: GAP,
            padding: GAP,
          }}
        >
          {/* Grid cell guides (edit mode) */}
          {editBins &&
            Array.from({ length: rows * cols }).map((_, i) => {
              const r = Math.floor(i / cols);
              const c = i % cols;
              return (
                <div
                  key={`cell-${i}`}
                  className="rounded-md border border-dashed border-border/60"
                  style={{ gridRow: `${r + 1} / span 1`, gridColumn: `${c + 1} / span 1` }}
                />
              );
            })}

          {bins.length === 0 && !editBins && (
            <div
              className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground"
              style={{ gridColumn: `1 / span ${cols}`, gridRow: `1 / span ${Math.max(1, rows)}` }}
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

          {bins.map((bin) => {
            const shown = preview && preview.id === bin.id ? preview.bin : bin;
            return (
              <BinCell
                key={bin.id}
                bin={shown}
                items={itemsByBin.get(bin.id) ?? []}
                editBins={editBins}
                dragEnabled={dragEnabled}
                canManage={canManage}
                dragging={preview?.id === bin.id}
                onRename={(name) => {
                  setBins(bins.map((b) => (b.id === bin.id ? { ...b, name } : b)));
                  persistBin(bin.id, { name });
                }}
                onColor={(color) => {
                  setBins(bins.map((b) => (b.id === bin.id ? { ...b, color } : b)));
                  persistBin(bin.id, { color });
                }}
                onMoveHandle={(e) => beginBinDrag(e, bin, "move")}
                onResizeHandle={(e) => beginBinDrag(e, bin, "resize")}
                onDelete={() => deleteBin(bin)}
              />
            );
          })}
        </div>

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
  dragging,
  onRename,
  onColor,
  onMoveHandle,
  onResizeHandle,
  onDelete,
}: {
  bin: BinDetail;
  items: DrawerItem[];
  editBins: boolean;
  dragEnabled: boolean;
  canManage: boolean;
  dragging: boolean;
  onRename: (name: string) => void;
  onColor: (color: string | null) => void;
  onMoveHandle: (e: React.PointerEvent) => void;
  onResizeHandle: (e: React.PointerEvent) => void;
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
        "relative flex min-h-0 flex-col gap-1.5 rounded-md border bg-card p-2 transition-shadow",
        isOver ? "border-primary ring-2 ring-primary/40" : "border-border",
        dragging && "z-10 shadow-lg ring-2 ring-primary",
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <div className="flex min-w-0 items-center gap-1.5">
          {editBins && canManage && (
            <span
              role="button"
              aria-label="Move bin"
              onPointerDown={onMoveHandle}
              className="-ml-1 cursor-grab touch-none rounded p-0.5 text-muted-foreground hover:text-foreground active:cursor-grabbing"
              title="Drag to move"
            >
              <Move className="h-3.5 w-3.5" />
            </span>
          )}
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
              className="h-6 w-24 px-1.5 text-xs"
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
          <button
            type="button"
            onClick={onDelete}
            className="ml-auto rounded p-0.5 text-destructive hover:bg-destructive/10"
            title="Delete bin"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="flex flex-1 flex-wrap content-start gap-1 overflow-hidden">
        {items.length === 0 ? (
          <span className="text-[11px] italic text-muted-foreground">Empty</span>
        ) : (
          items.map((item) => <BinChip key={item.id} item={item} draggable={dragEnabled} />)
        )}
      </div>

      {/* Resize handle (edit mode) */}
      {editBins && canManage && (
        <span
          role="button"
          aria-label="Resize bin"
          onPointerDown={onResizeHandle}
          title="Drag to resize"
          className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize touch-none"
          style={{
            background:
              "linear-gradient(135deg, transparent 0 50%, var(--border) 50% 60%, transparent 60% 70%, var(--border) 70% 80%, transparent 80%)",
          }}
        />
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
