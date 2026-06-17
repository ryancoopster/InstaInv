"use client";

import * as React from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

// Generic vertical drag-and-drop reorder context. The caller renders rows; each
// row uses <SortableHandle /> (or SortableRow) for the drag affordance.

interface SortableListProps {
  ids: string[];
  onReorder: (ids: string[]) => void;
  disabled?: boolean;
  children: React.ReactNode;
}

export function SortableList({ ids, onReorder, disabled, children }: SortableListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    onReorder(arrayMove(ids, oldIndex, newIndex));
  };

  if (disabled) return <>{children}</>;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

interface SortableRowContextValue {
  attributes: React.HTMLAttributes<HTMLElement>;
  listeners: Record<string, Function> | undefined;
  isDragging: boolean;
}

const SortableRowContext = React.createContext<SortableRowContextValue | null>(null);

// Renders a <tr> (or any element via `as`) wired to dnd-kit. Children can drop a
// <SortableHandle /> anywhere to expose the drag grip.
export function SortableRow({
  id,
  as: Tag = "tr",
  className,
  children,
  ...rest
}: {
  id: string;
  as?: any;
  className?: string;
  children: React.ReactNode;
} & Record<string, any>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 30 : undefined,
    position: isDragging ? "relative" : undefined,
  };

  return (
    <SortableRowContext.Provider value={{ attributes, listeners, isDragging }}>
      <Tag
        ref={setNodeRef}
        style={style}
        className={cn(isDragging && "opacity-80 shadow-lg", className)}
        {...rest}
      >
        {children}
      </Tag>
    </SortableRowContext.Provider>
  );
}

// Drag affordance — place inside a SortableRow. Falls back gracefully if used
// outside a row (renders a static grip).
export function SortableHandle({ className }: { className?: string }) {
  const ctx = React.useContext(SortableRowContext);
  return (
    <button
      type="button"
      aria-label="Drag to reorder"
      className={cn(
        "inline-flex h-7 w-7 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing",
        className,
      )}
      {...(ctx?.attributes ?? {})}
      {...(ctx?.listeners ?? {})}
    >
      <GripVertical className="h-4 w-4" />
    </button>
  );
}
