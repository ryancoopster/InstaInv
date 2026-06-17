"use client";

import * as React from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  pointerWithin,
  type DragEndEvent,
} from "@dnd-kit/core";
import { ChevronsLeftRight, ChevronsUpDown, Layers, MoreVertical, Package, Pencil, Trash2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { cn, clamp, formatNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";
import type { DrawerSummary } from "./types";

interface BoxFrontViewProps {
  gridRows: number;
  gridCols: number;
  drawers: DrawerSummary[];
  editMode: boolean;
  canManage: boolean;
  onOpen: (drawerId: string) => void;
  onEdit: (drawer: DrawerSummary) => void;
  onDelete: (drawer: DrawerSummary) => void;
  /** Persist a layout change locally (optimistic) before the API round-trip. */
  onLayoutChange: (drawers: DrawerSummary[]) => void;
}

interface CellId {
  row: number;
  col: number;
}

const cellKey = (r: number, c: number) => `cell-${r}-${c}`;
const parseCell = (id: string): CellId | null => {
  const m = /^cell-(\d+)-(\d+)$/.exec(id);
  return m ? { row: Number(m[1]), col: Number(m[2]) } : null;
};

export function BoxFrontView({
  gridRows,
  gridCols,
  drawers,
  editMode,
  canManage,
  onOpen,
  onEdit,
  onDelete,
  onLayoutChange,
}: BoxFrontViewProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // Which grid cells are occupied (so empty cells can show droppable targets).
  const occupied = React.useMemo(() => {
    const set = new Set<string>();
    for (const d of drawers) {
      for (let r = d.gridRow; r < d.gridRow + d.rowSpan; r++) {
        for (let c = d.gridCol; c < d.gridCol + d.colSpan; c++) {
          set.add(`${r}-${c}`);
        }
      }
    }
    return set;
  }, [drawers]);

  function wouldCollide(self: DrawerSummary, row: number, col: number, rowSpan: number, colSpan: number) {
    if (row < 0 || col < 0 || row + rowSpan > gridRows || col + colSpan > gridCols) return true;
    for (const d of drawers) {
      if (d.id === self.id) continue;
      const overlapR = row < d.gridRow + d.rowSpan && row + rowSpan > d.gridRow;
      const overlapC = col < d.gridCol + d.colSpan && col + colSpan > d.gridCol;
      if (overlapR && overlapC) return true;
    }
    return false;
  }

  async function persist(drawerId: string, patch: Partial<DrawerSummary>) {
    try {
      await api.patch(`/api/drawers/${drawerId}`, patch);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Could not save layout";
      toast.error({ title: "Layout not saved", description: message });
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const target = parseCell(String(over.id));
    if (!target) return;
    const drawer = drawers.find((d) => d.id === active.id);
    if (!drawer) return;
    if (drawer.gridRow === target.row && drawer.gridCol === target.col) return;
    if (wouldCollide(drawer, target.row, target.col, drawer.rowSpan, drawer.colSpan)) {
      toast.error("That spot is occupied or off the grid");
      return;
    }
    const next = drawers.map((d) =>
      d.id === drawer.id ? { ...d, gridRow: target.row, gridCol: target.col } : d,
    );
    onLayoutChange(next);
    await persist(drawer.id, { gridRow: target.row, gridCol: target.col });
  }

  function resize(drawer: DrawerSummary, dRow: number, dCol: number) {
    const rowSpan = clamp(drawer.rowSpan + dRow, 1, gridRows);
    const colSpan = clamp(drawer.colSpan + dCol, 1, gridCols);
    if (rowSpan === drawer.rowSpan && colSpan === drawer.colSpan) return;
    if (wouldCollide(drawer, drawer.gridRow, drawer.gridCol, rowSpan, colSpan)) {
      toast.error("Not enough room to resize");
      return;
    }
    const next = drawers.map((d) => (d.id === drawer.id ? { ...d, rowSpan, colSpan } : d));
    onLayoutChange(next);
    persist(drawer.id, { rowSpan, colSpan });
  }

  const emptyCells: CellId[] = [];
  if (editMode) {
    for (let r = 0; r < gridRows; r++) {
      for (let c = 0; c < gridCols; c++) {
        if (!occupied.has(`${r}-${c}`)) emptyCells.push({ row: r, col: c });
      }
    }
  }

  const grid = (
    <div
      className="grid gap-2 rounded-lg border border-border bg-muted/30 p-3"
      style={{
        gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${gridRows}, minmax(72px, 1fr))`,
      }}
    >
      {editMode &&
        emptyCells.map((cell) => (
          <DropCell key={cellKey(cell.row, cell.col)} row={cell.row} col={cell.col} />
        ))}

      {drawers.map((drawer) => (
        <DrawerCell
          key={drawer.id}
          drawer={drawer}
          editMode={editMode}
          canManage={canManage}
          onOpen={() => onOpen(drawer.id)}
          onEdit={() => onEdit(drawer)}
          onDelete={() => onDelete(drawer)}
          onResize={(dr, dc) => resize(drawer, dr, dc)}
        />
      ))}
    </div>
  );

  if (!editMode) return grid;

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragEnd={handleDragEnd}>
      {grid}
    </DndContext>
  );
}

function DropCell({ row, col }: { row: number; col: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: cellKey(row, col) });
  return (
    <div
      ref={setNodeRef}
      style={{ gridRow: row + 1, gridColumn: col + 1 }}
      className={cn(
        "flex items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground transition-colors",
        isOver ? "border-primary bg-primary/10 text-primary" : "border-border/60",
      )}
    >
      Drop here
    </div>
  );
}

function DrawerCell({
  drawer,
  editMode,
  canManage,
  onOpen,
  onEdit,
  onDelete,
  onResize,
}: {
  drawer: DrawerSummary;
  editMode: boolean;
  canManage: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onResize: (dRow: number, dCol: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: drawer.id,
    disabled: !editMode,
  });

  const style: React.CSSProperties = {
    gridRow: `${drawer.gridRow + 1} / span ${drawer.rowSpan}`,
    gridColumn: `${drawer.gridCol + 1} / span ${drawer.colSpan}`,
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    zIndex: isDragging ? 20 : undefined,
    opacity: isDragging ? 0.85 : 1,
  };

  const accent = drawer.color ?? undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-md border border-border bg-card shadow-sm transition-colors",
        editMode ? "cursor-grab active:cursor-grabbing" : "cursor-pointer hover:border-primary/50",
        isDragging && "ring-2 ring-primary",
      )}
      {...(editMode ? { ...attributes, ...listeners } : {})}
      onClick={() => {
        if (!editMode) onOpen();
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (!editMode && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      {/* Color strip */}
      <div className="h-1.5 w-full shrink-0" style={{ backgroundColor: accent ?? "transparent" }} />

      <div className="flex min-h-0 flex-1 flex-col gap-1 p-2">
        <div className="flex items-start justify-between gap-1">
          <div className="min-w-0">
            {drawer.label && (
              <span className="inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {drawer.label}
              </span>
            )}
            <p className="mt-0.5 truncate text-sm font-medium leading-tight">{drawer.name}</p>
          </div>
          {canManage && !editMode && (
            <div onClick={(e) => e.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger>
                  <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={onEdit}>
                    <Pencil className="h-4 w-4" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem destructive onClick={onDelete}>
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-0.5">
            <Package className="h-3 w-3" />
            {formatNumber(drawer.itemCount)}
          </span>
          <span className="inline-flex items-center gap-0.5">
            <Layers className="h-3 w-3" />
            {formatNumber(drawer.binCount)}
          </span>
        </div>
      </div>

      {/* Resize controls in edit mode */}
      {editMode && (
        <div
          className="absolute bottom-1 right-1 flex gap-0.5"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="rounded bg-background/90 p-0.5 text-muted-foreground shadow hover:text-foreground"
            title="Widen / narrow (click = +1 col, shift+click = -1 col)"
            onClick={(e) => onResize(0, e.shiftKey ? -1 : 1)}
          >
            <ChevronsLeftRight className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="rounded bg-background/90 p-0.5 text-muted-foreground shadow hover:text-foreground"
            title="Taller / shorter (click = +1 row, shift+click = -1 row)"
            onClick={(e) => onResize(e.shiftKey ? -1 : 1, 0)}
          >
            <ChevronsUpDown className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
