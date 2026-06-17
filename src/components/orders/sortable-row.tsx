"use client";

import * as React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

// A draggable <tr>. The drag handle is the first cell; pass the row content
// (cells) as children. Dragging is disabled when `disabled` is true (e.g. when
// a column sort overrides manual order, or the user lacks reorder rights).
export function SortableRow({
  id,
  disabled,
  children,
  className,
}: {
  id: string;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : undefined,
    position: isDragging ? "relative" : undefined,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <TableRow ref={setNodeRef} style={style} className={className}>
      <TableCell className="w-8 pr-0">
        <button
          type="button"
          aria-label="Drag to reorder"
          disabled={disabled}
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded text-muted-foreground",
            disabled ? "cursor-not-allowed opacity-30" : "cursor-grab hover:text-foreground active:cursor-grabbing",
          )}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </TableCell>
      {children}
    </TableRow>
  );
}
