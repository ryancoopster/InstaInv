"use client";

import * as React from "react";
import { useDraggable } from "@dnd-kit/core";
import { MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import type { DrawerItem } from "./types";

export interface TileField {
  key: string;
  label: string;
}

// BC-1 / VD-3: an item action exposed via the always-available kebab (⋮) menu so
// assign/unassign works on touch and keyboard, not only via right-click.
export interface BinChipAction {
  label: string;
  onSelect: () => void;
  destructive?: boolean;
  separatorBefore?: boolean;
}

interface BinChipProps {
  item: DrawerItem;
  draggable: boolean;
  onClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  // When provided, render an always-available kebab (⋮) trigger exposing these
  // actions via a DropdownMenu (role=menu/menuitem, Escape, focusable) so the
  // assign/unassign actions are reachable by touch and keyboard, not only via
  // the right-click context menu.
  actions?: BinChipAction[];
  // When provided, render a larger card showing these item fields (each with a
  // header label) instead of the compact chip.
  tileFields?: TileField[];
}

// Stops a pointerdown on the kebab from reaching dnd-kit's drag listeners on the
// parent chip button, so opening the menu never starts a drag.
function ChipActionsMenu({ actions, item }: { actions: BinChipAction[]; item: DrawerItem }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <button
          type="button"
          aria-label={`Actions for ${item.name}`}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
        >
          <MoreVertical className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {actions.map((a) => (
          <React.Fragment key={a.label}>
            {a.separatorBefore && <DropdownMenuSeparator />}
            <DropdownMenuItem
              destructive={a.destructive}
              onClick={(e) => {
                e.stopPropagation();
                a.onSelect();
              }}
            >
              {a.label}
            </DropdownMenuItem>
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function fieldValue(item: DrawerItem, key: string): string | null {
  switch (key) {
    case "partNumber":
      return item.partNumber || null;
    case "sku":
      return item.sku || null;
    case "quantity":
      return `${item.quantity}${item.unit ? ` ${item.unit}` : ""}`;
    case "unit":
      return item.unit || null;
    case "category":
      return item.category?.name || null;
    case "supplier":
      return item.supplierName || null;
    default:
      if (key.startsWith("custom:")) {
        const v = item.customValues?.[key.slice(7)];
        if (v == null || v === "") return null;
        return Array.isArray(v) ? v.join(", ") : String(v);
      }
      return null;
  }
}

// A chip/card representing an item that lives in a bin. In reorganize mode it's
// draggable. Right-click opens an unassign/assign menu (handled by the parent).
// With tileFields it renders a larger card with labeled fields.
export function BinChip({ item, draggable, onClick, onContextMenu, actions, tileFields }: BinChipProps) {
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
  const hasActions = Boolean(actions && actions.length > 0);

  // Larger labeled card when fields are selected.
  if (tileFields && tileFields.length > 0) {
    return (
      // BC-1: wrap so the always-available kebab can sit as a sibling of the
      // draggable button (nested <button> is invalid HTML).
      <div className="relative w-full max-w-full">
        <button
          ref={setNodeRef}
          type="button"
          style={style}
          className={cn(
            "flex w-full max-w-full flex-col gap-1 rounded-md border border-border bg-background p-2 text-left shadow-sm transition-colors",
            // BC-1: touch-none makes touch-drag deterministic for the draggable chip.
            draggable ? "cursor-grab touch-none active:cursor-grabbing hover:border-primary/60" : "hover:bg-muted",
            isDragging && "ring-2 ring-primary",
          )}
          onClick={(e) => {
            e.stopPropagation();
            onClick?.();
          }}
          onContextMenu={onContextMenu}
          {...(draggable ? { ...attributes, ...listeners } : {})}
          title={item.name}
        >
          <div className="flex items-center gap-1.5 pr-5">
            {dot && (
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: dot }} aria-hidden />
            )}
            <span className="truncate text-xs font-semibold">{item.name}</span>
          </div>
          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
            {tileFields.map((f) => {
              const v = fieldValue(item, f.key);
              if (v == null) return null;
              return (
                <div key={f.key} className="min-w-0">
                  <div className="truncate text-[8px] font-medium uppercase tracking-wide text-muted-foreground">
                    {f.label}
                  </div>
                  <div className="truncate text-[11px] tabular-nums">{v}</div>
                </div>
              );
            })}
          </div>
        </button>
        {hasActions && (
          <div className="absolute right-1 top-1">
            <ChipActionsMenu actions={actions!} item={item} />
          </div>
        )}
      </div>
    );
  }

  return (
    // BC-1: wrap so the always-available kebab can sit as a sibling of the
    // draggable button (nested <button> is invalid HTML).
    <div
      className={cn(
        "inline-flex max-w-full items-center gap-0.5 rounded-full border border-border bg-background py-0.5 pl-2 pr-0.5 text-xs shadow-sm transition-colors",
        !hasActions && "pr-2",
        // BC-1: keep the previous hover affordance on the pill after moving the
        // styling from the inner button to this wrapper.
        draggable ? "hover:border-primary/60" : "hover:bg-muted",
        isDragging && "ring-2 ring-primary",
      )}
    >
      <button
        ref={setNodeRef}
        type="button"
        style={style}
        className={cn(
          "inline-flex min-w-0 items-center gap-1 outline-none",
          draggable ? "cursor-grab touch-none active:cursor-grabbing" : "",
        )}
        onClick={(e) => {
          e.stopPropagation();
          onClick?.();
        }}
        onContextMenu={onContextMenu}
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
      {hasActions && <ChipActionsMenu actions={actions!} item={item} />}
    </div>
  );
}
