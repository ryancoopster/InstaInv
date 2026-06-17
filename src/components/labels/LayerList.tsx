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
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  Eye,
  EyeOff,
  Trash2,
  Type,
  QrCode,
  Barcode,
  Image as ImageIcon,
  Square,
  Minus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ElementType, LabelElement } from "@/lib/labels/types";

const ICONS: Record<ElementType, React.ElementType> = {
  text: Type,
  qrcode: QrCode,
  barcode: Barcode,
  image: ImageIcon,
  rect: Square,
  line: Minus,
};

function describe(el: LabelElement): string {
  switch (el.type) {
    case "text":
      return el.text?.trim() || "Text";
    case "qrcode":
      return el.binding ? `QR · ${el.binding}` : "QR code";
    case "barcode":
      return el.binding ? `Barcode · ${el.binding}` : "Barcode";
    case "image":
      return el.src ? "Image" : "Image (empty)";
    case "rect":
      return "Rectangle";
    case "line":
      return "Line";
    default:
      return el.type;
  }
}

function LayerRow({
  el,
  selected,
  onSelect,
  onToggleHidden,
  onDelete,
}: {
  el: LabelElement;
  selected: boolean;
  onSelect: () => void;
  onToggleHidden: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: el.id });
  const Icon = ICONS[el.type];
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-sm",
        selected ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-accent",
      )}
    >
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
        aria-label="Drag layer"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className={cn("truncate", el.hidden && "text-muted-foreground line-through")}>{describe(el)}</span>
      </button>
      <button
        type="button"
        onClick={onToggleHidden}
        className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
        aria-label={el.hidden ? "Show layer" : "Hide layer"}
      >
        {el.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive"
        aria-label="Delete layer"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// Layers are drawn bottom-to-top by array order; we show them top-to-bottom
// (last element = front) for a familiar "layers" feel.
export function LayerList({
  elements,
  selectedId,
  onSelect,
  onReorder,
  onToggleHidden,
  onDelete,
}: {
  elements: LabelElement[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReorder: (ids: string[]) => void;
  onToggleHidden: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  // Display front-to-back (reverse of paint order).
  const display = React.useMemo(() => [...elements].reverse(), [elements]);

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = display.map((el) => el.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const nextDisplay = arrayMove(ids, from, to);
    // convert back to paint order
    onReorder([...nextDisplay].reverse());
  }

  if (elements.length === 0) {
    return <p className="px-1 py-2 text-xs text-muted-foreground">No layers yet. Add an element from the palette.</p>;
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]} onDragEnd={handleDragEnd}>
      <SortableContext items={display.map((el) => el.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-1.5">
          {display.map((el) => (
            <LayerRow
              key={el.id}
              el={el}
              selected={el.id === selectedId}
              onSelect={() => onSelect(el.id)}
              onToggleHidden={() => onToggleHidden(el.id)}
              onDelete={() => onDelete(el.id)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
