"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronRight, GripVertical, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { applySort, cn, formatNumber } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";
import type { DrawerSummary } from "./types";

interface DrawerListViewProps {
  boxId: string;
  drawers: DrawerSummary[];
  canManage: boolean;
  onOpen: (drawerId: string) => void;
  onEdit: (drawer: DrawerSummary) => void;
  onDelete: (drawer: DrawerSummary) => void;
  onReordered: (drawers: DrawerSummary[]) => void;
}

type SortKey = "manual" | "name" | "label" | "itemCount" | "binCount";

export function DrawerListView({
  boxId,
  drawers,
  canManage,
  onOpen,
  onEdit,
  onDelete,
  onReordered,
}: DrawerListViewProps) {
  const router = useRouter();
  void boxId;
  const [sortKey, setSortKey] = React.useState<SortKey>("manual");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const draggable = canManage && sortKey === "manual";
  const view =
    sortKey === "manual"
      ? applySort(drawers, null)
      : applySort(drawers, sortKey, sortKey === "name" || sortKey === "label" ? "asc" : "desc");

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = drawers.findIndex((d) => d.id === active.id);
    const newIndex = drawers.findIndex((d) => d.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const next = arrayMove(drawers, oldIndex, newIndex).map((d, i) => ({ ...d, sortOrder: i }));
    onReordered(next);
    try {
      await api.patch("/api/drawers/reorder", { ids: next.map((d) => d.id) });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Reorder failed";
      toast.error({ title: "Could not save order", description: message });
      router.refresh();
    }
  }

  function HeaderButton({ label, value }: { label: string; value: SortKey }) {
    const active = sortKey === value;
    return (
      <button
        type="button"
        onClick={() => setSortKey(active && value !== "manual" ? "manual" : value)}
        className={cn("uppercase tracking-wide hover:text-foreground", active && "text-foreground")}
      >
        {label}
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-border">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <Table>
          <TableHeader>
            <TableRow>
              {draggable && <TableHead className="w-8" />}
              <TableHead>
                <HeaderButton label="Drawer" value="name" />
              </TableHead>
              <TableHead className="w-20">
                <HeaderButton label="Label" value="label" />
              </TableHead>
              <TableHead className="text-right">
                <HeaderButton label="Bins" value="binCount" />
              </TableHead>
              <TableHead className="text-right">
                <HeaderButton label="Items" value="itemCount" />
              </TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <SortableContext items={view.map((d) => d.id)} strategy={verticalListSortingStrategy}>
            <TableBody>
              {view.map((drawer) => (
                <DrawerRow
                  key={drawer.id}
                  drawer={drawer}
                  draggable={draggable}
                  canManage={canManage}
                  onOpen={() => onOpen(drawer.id)}
                  onEdit={() => onEdit(drawer)}
                  onDelete={() => onDelete(drawer)}
                />
              ))}
            </TableBody>
          </SortableContext>
        </Table>
      </DndContext>
    </div>
  );
}

function DrawerRow({
  drawer,
  draggable,
  canManage,
  onOpen,
  onEdit,
  onDelete,
}: {
  drawer: DrawerSummary;
  draggable: boolean;
  canManage: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: drawer.id,
    disabled: !draggable,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <TableRow ref={setNodeRef} style={style} className={cn(isDragging && "bg-muted")}>
      {draggable && (
        <TableCell className="w-8">
          <button
            type="button"
            className="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
            aria-label="Drag to reorder"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        </TableCell>
      )}
      <TableCell>
        <button type="button" onClick={onOpen} className="flex items-center gap-2 text-left font-medium hover:underline">
          <span
            className="inline-block h-3 w-3 shrink-0 rounded-full border border-black/10"
            style={{ backgroundColor: drawer.color ?? "var(--muted)" }}
          />
          {drawer.name}
        </button>
      </TableCell>
      <TableCell>
        {drawer.label ? <Badge variant="outline">{drawer.label}</Badge> : <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell className="text-right tabular-nums">{formatNumber(drawer.binCount)}</TableCell>
      <TableCell className="text-right tabular-nums">{formatNumber(drawer.itemCount)}</TableCell>
      <TableCell className="text-right">
        {canManage ? (
          <DropdownMenu>
            <DropdownMenuTrigger>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={onOpen}>
                <ChevronRight className="h-4 w-4" />
                Open
              </DropdownMenuItem>
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
        ) : (
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onOpen} aria-label="Open drawer">
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}
