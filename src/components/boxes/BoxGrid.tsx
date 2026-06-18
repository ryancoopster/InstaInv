"use client";

import * as React from "react";
import Link from "next/link";
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
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { ArrowDownAZ, Boxes as BoxesIcon, Plus, PackageX } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { applySort } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { BoxCard } from "./BoxCard";
import { BoxForm } from "./BoxForm";
import type { BoxListItem } from "./types";

interface BoxGridProps {
  initialBoxes: BoxListItem[];
  canManage: boolean;
  unassignedCount?: number;
}

type SortKey = "manual" | "name" | "drawerCount" | "itemCount";

export function BoxGrid({ initialBoxes, canManage, unassignedCount = 0 }: BoxGridProps) {
  const router = useRouter();
  const [boxes, setBoxes] = React.useState<BoxListItem[]>(initialBoxes);
  const [sortKey, setSortKey] = React.useState<SortKey>("manual");
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<BoxListItem | null>(null);
  const [deleting, setDeleting] = React.useState<BoxListItem | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Manual order = drag order; any other key is a view-time override.
  const draggable = canManage && sortKey === "manual";
  const view =
    sortKey === "manual"
      ? applySort(boxes, null)
      : applySort(boxes, sortKey, sortKey === "name" ? "asc" : "desc");

  async function reload() {
    try {
      const fresh = await api.get<BoxListItem[]>("/api/boxes");
      setBoxes(fresh);
    } catch {
      router.refresh();
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = boxes.findIndex((b) => b.id === active.id);
    const newIndex = boxes.findIndex((b) => b.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const next = arrayMove(boxes, oldIndex, newIndex).map((b, i) => ({ ...b, sortOrder: i }));
    setBoxes(next);
    try {
      await api.patch("/api/boxes/reorder", { ids: next.map((b) => b.id) });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Reorder failed";
      toast.error({ title: "Could not save order", description: message });
      reload();
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await api.del(`/api/boxes/${deleting.id}`);
      setBoxes((prev) => prev.filter((b) => b.id !== deleting.id));
      toast.success("Box deleted");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Delete failed";
      toast.error({ title: "Could not delete", description: message });
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Boxes"
        description="Cases and boxes that hold your drawers. Open one to see its front view."
        actions={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <ArrowDownAZ className="h-4 w-4 text-muted-foreground" />
              <Select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                className="h-9 w-[150px]"
                aria-label="Sort boxes"
              >
                <option value="manual">Manual order</option>
                <option value="name">Name</option>
                <option value="drawerCount">Most drawers</option>
                <option value="itemCount">Most items</option>
              </Select>
            </div>
            {canManage && (
              <Button
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                <Plus className="h-4 w-4" />
                New box
              </Button>
            )}
          </div>
        }
      />

      {unassignedCount > 0 && (
        <Link
          href="/items"
          className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-3 transition-colors hover:border-primary/60"
        >
          <div className="flex items-center gap-2">
            <PackageX className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Unassigned items</p>
              <p className="text-xs text-muted-foreground">Items not placed in any box</p>
            </div>
          </div>
          <Badge variant="secondary">{unassignedCount}</Badge>
        </Link>
      )}

      {view.length === 0 ? (
        <EmptyState
          icon={BoxesIcon}
          title="No boxes yet"
          description={canManage ? "Create your first box to start organizing drawers and bins." : "No boxes have been added yet."}
          action={
            canManage ? (
              <Button
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                <Plus className="h-4 w-4" />
                New box
              </Button>
            ) : undefined
          }
        />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={view.map((b) => b.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {view.map((box) => (
                <BoxCard
                  key={box.id}
                  box={box}
                  canManage={canManage}
                  draggable={draggable}
                  onEdit={() => {
                    setEditing(box);
                    setFormOpen(true);
                  }}
                  onDelete={() => setDeleting(box)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {!draggable && canManage && view.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Switch to <span className="font-medium">Manual order</span> to drag boxes into a custom order.
        </p>
      )}

      <BoxForm open={formOpen} onOpenChange={setFormOpen} box={editing} onSaved={reload} />

      <Dialog open={Boolean(deleting)} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete box</DialogTitle>
            <DialogDescription>
              Delete <span className="font-medium text-foreground">{deleting?.name}</span>? This
              removes its drawers and bins. Items inside are not deleted but become unassigned.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Delete box
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
