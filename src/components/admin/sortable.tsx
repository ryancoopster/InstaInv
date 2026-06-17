"use client";

import * as React from "react";
import { useSortable } from "@dnd-kit/sortable";
import type { DraggableAttributes } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

// dnd-kit's listener map isn't exported at the package root; derive it from
// the hook's return type so the drag-handle props stay correctly typed.
type DragListeners = ReturnType<typeof useSortable>["listeners"];
import { ArrowDown, ArrowUp, ChevronsUpDown, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { TableCell, TableHead } from "@/components/ui/table";

export type SortDir = "asc" | "desc";

export interface SortState {
  key: string | null;
  dir: SortDir;
}

/**
 * A clickable column header that cycles: none → asc → desc → none.
 * When `sort.key` is null the list falls back to manual (drag) order.
 */
export function SortableHead({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: React.ReactNode;
  sortKey: string;
  sort: SortState;
  onSort: (next: SortState) => void;
  className?: string;
}) {
  const active = sort.key === sortKey;
  const cycle = () => {
    if (!active) return onSort({ key: sortKey, dir: "asc" });
    if (sort.dir === "asc") return onSort({ key: sortKey, dir: "desc" });
    return onSort({ key: null, dir: "asc" });
  };
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={cycle}
        className={cn(
          "inline-flex items-center gap-1 rounded-sm py-0.5 text-xs font-medium uppercase tracking-wide transition-colors hover:text-foreground",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
        {active ? (
          sort.dir === "asc" ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : (
          <ChevronsUpDown className="h-3 w-3 opacity-50" />
        )}
      </button>
    </TableHead>
  );
}

interface SortableRowContextValue {
  attributes: DraggableAttributes;
  listeners: DragListeners;
  dragDisabled: boolean;
}

const SortableRowContext = React.createContext<SortableRowContextValue | null>(null);

/**
 * A draggable <tr>. Drag is disabled while a column sort is active (manual order
 * is only meaningful in its own view), matching the contract's sort convention.
 */
export function SortableRow({
  id,
  dragDisabled,
  children,
  className,
}: {
  id: string;
  dragDisabled: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: dragDisabled,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    position: "relative",
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <SortableRowContext.Provider value={{ attributes, listeners, dragDisabled }}>
      <tr
        ref={setNodeRef}
        style={style}
        className={cn(
          "border-b border-border transition-colors hover:bg-muted/50",
          isDragging && "bg-muted shadow-md",
          className,
        )}
      >
        {children}
      </tr>
    </SortableRowContext.Provider>
  );
}

/** Drag handle cell — must be rendered inside a <SortableRow>. */
export function DragHandleCell() {
  const ctx = React.useContext(SortableRowContext);
  return (
    <TableCell className="w-8 pr-0">
      <button
        type="button"
        aria-label="Drag to reorder"
        disabled={ctx?.dragDisabled}
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors",
          ctx?.dragDisabled
            ? "cursor-not-allowed opacity-30"
            : "cursor-grab hover:bg-muted hover:text-foreground active:cursor-grabbing",
        )}
        {...ctx?.attributes}
        {...ctx?.listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
    </TableCell>
  );
}
