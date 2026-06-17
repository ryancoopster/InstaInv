"use client";

import * as React from "react";
import { useDraggable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import type { DrawerItem } from "./types";

interface BinChipProps {
  item: DrawerItem;
  draggable: boolean;
  onClick?: () => void;
}

// A small chip representing an item that lives in a bin. In reorganize mode it's
// draggable so the user can move it to another bin / the unassigned tray.
export function BinChip({ item, draggable, onClick }: BinChipProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `item:${item.id}`,
    data: { itemId: item.id },
    disabled: !draggable,
  });

  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.5 : 1,
  };

  const dot = item.category?.color ?? undefined;

  return (
    <button
      ref={setNodeRef}
      type="button"
      style={style}
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-xs shadow-sm transition-colors",
        draggable ? "cursor-grab active:cursor-grabbing hover:border-primary/60" : "hover:bg-muted",
        isDragging && "ring-2 ring-primary",
      )}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      {...(draggable ? { ...attributes, ...listeners } : {})}
      title={`${item.name} · ${item.quantity}${item.unit ? " " + item.unit : ""}`}
    >
      {dot && (
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: dot }} aria-hidden />
      )}
      <span className="truncate">{item.name}</span>
      <span className="shrink-0 rounded-full bg-muted px-1 font-medium tabular-nums text-muted-foreground">
        {item.quantity}
      </span>
    </button>
  );
}
