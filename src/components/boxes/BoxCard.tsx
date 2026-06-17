"use client";

import * as React from "react";
import Link from "next/link";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Boxes, GripVertical, Layers, MapPin, MoreVertical, Package, Pencil, Trash2 } from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { BoxListItem } from "./types";

interface BoxCardProps {
  box: BoxListItem;
  canManage: boolean;
  draggable: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

export function BoxCard({ box, canManage, draggable, onEdit, onDelete }: BoxCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: box.id,
    disabled: !draggable,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn("group relative overflow-hidden transition-colors hover:border-primary/40", isDragging && "z-10 ring-2 ring-primary")}
    >
      {draggable && (
        <button
          type="button"
          className="absolute left-1 top-1 z-10 cursor-grab rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent group-hover:opacity-100 active:cursor-grabbing"
          aria-label="Drag to reorder"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}

      {canManage && (
        <div className="absolute right-1 top-1 z-10 opacity-0 transition-opacity group-hover:opacity-100">
          <DropdownMenu>
            <DropdownMenuTrigger>
              <Button variant="ghost" size="icon" className="h-7 w-7">
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

      <Link href={`/boxes/${box.id}`} className="block">
        <div className="flex h-32 w-full items-center justify-center overflow-hidden bg-muted">
          {box.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={box.imageUrl} alt={box.name} className="h-full w-full object-cover" />
          ) : (
            <Boxes className="h-10 w-10 text-muted-foreground" />
          )}
        </div>
        <CardContent className="space-y-2 p-4">
          <div className="space-y-1">
            <h3 className="truncate font-semibold leading-tight">{box.name}</h3>
            {box.location && (
              <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                <MapPin className="h-3 w-3 shrink-0" />
                {box.location}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            <Badge variant="secondary">
              <Layers className="h-3 w-3" />
              {formatNumber(box.drawerCount)} drawer{box.drawerCount === 1 ? "" : "s"}
            </Badge>
            <Badge variant="outline">
              <Package className="h-3 w-3" />
              {formatNumber(box.itemCount)} item{box.itemCount === 1 ? "" : "s"}
            </Badge>
          </div>

          {box.summary && (
            <p className="line-clamp-2 text-xs text-muted-foreground">{box.summary}</p>
          )}
        </CardContent>
      </Link>
    </Card>
  );
}
