"use client";

// Consistent card chrome for every dashboard widget, plus the edit-mode controls
// (drag handle, span picker, hide). Sortable via @dnd-kit/sortable. Outside edit
// mode it renders a clean, control-free card.

import * as React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, EyeOff, Columns2, Columns3, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  WIDGET_META,
  type WidgetSpan,
  type WidgetType,
} from "@/components/dashboard/types";

const SPAN_TO_CLASS: Record<WidgetSpan, string> = {
  1: "lg:col-span-1",
  2: "lg:col-span-2",
  3: "lg:col-span-3",
};

const SPAN_ICON: Record<WidgetSpan, React.ElementType> = {
  1: Square,
  2: Columns2,
  3: Columns3,
};

export function WidgetFrame({
  type,
  span,
  editing,
  onSpanChange,
  onHide,
  children,
}: {
  type: WidgetType;
  span: WidgetSpan;
  editing: boolean;
  onSpanChange: (span: WidgetSpan) => void;
  onHide: () => void;
  children: React.ReactNode;
}) {
  const meta = WIDGET_META[type];
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: type,
    disabled: !editing,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 20 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "col-span-1 min-w-0",
        SPAN_TO_CLASS[span],
        editing && "relative",
      )}
    >
      <Card
        className={cn(
          "flex h-full flex-col overflow-hidden",
          editing && "border-dashed ring-1 ring-border",
          isDragging && "shadow-lg ring-2 ring-primary/50",
        )}
      >
        {editing && (
          <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                aria-label={`Drag ${meta.title}`}
                className="flex h-7 w-7 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:cursor-grabbing"
                {...attributes}
                {...listeners}
              >
                <GripVertical className="h-4 w-4" />
              </button>
              <span className="truncate text-sm font-medium">{meta.title}</span>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <div className="flex items-center gap-0.5 rounded-md border border-border bg-background p-0.5">
                {meta.allowedSpans.map((s) => {
                  const Icon = SPAN_ICON[s];
                  const active = s === span;
                  return (
                    <button
                      key={s}
                      type="button"
                      aria-label={`Set width to ${s} column${s === 1 ? "" : "s"}`}
                      aria-pressed={active}
                      onClick={() => onSpanChange(s)}
                      className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-sm transition-colors",
                        active
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </button>
                  );
                })}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                aria-label={`Hide ${meta.title}`}
                onClick={onHide}
              >
                <EyeOff className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
        <div className="min-w-0 flex-1">{children}</div>
      </Card>
    </div>
  );
}
