"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List,
  MapPin,
  Move,
  Plus,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { BoxFrontView } from "./BoxFrontView";
import { DrawerListView } from "./DrawerListView";
import { DrawerForm } from "./DrawerForm";
import type { BoxDetail, DrawerSummary } from "./types";

interface BoxDetailClientProps {
  box: BoxDetail;
  canManage: boolean;
  prevBoxId: string | null;
  nextBoxId: string | null;
}

type ViewMode = "front" | "list";

export function BoxDetailClient({ box, canManage, prevBoxId, nextBoxId }: BoxDetailClientProps) {
  const router = useRouter();
  const [drawers, setDrawers] = React.useState<DrawerSummary[]>(box.drawers);
  const [view, setView] = React.useState<ViewMode>("front");
  const [editLayout, setEditLayout] = React.useState(false);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editingDrawer, setEditingDrawer] = React.useState<DrawerSummary | null>(null);
  const [deleting, setDeleting] = React.useState<DrawerSummary | null>(null);

  React.useEffect(() => {
    setDrawers(box.drawers);
  }, [box.drawers]);

  async function reload() {
    try {
      const fresh = await api.get<DrawerSummary[]>(`/api/drawers?boxId=${box.id}`);
      setDrawers(fresh);
    } catch {
      router.refresh();
    }
  }

  function openDrawer(drawerId: string) {
    router.push(`/boxes/${box.id}/drawers/${drawerId}`);
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await api.del(`/api/drawers/${deleting.id}`);
      setDrawers((prev) => prev.filter((d) => d.id !== deleting.id));
      toast.success("Drawer deleted");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Delete failed";
      toast.error({ title: "Could not delete", description: message });
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2 text-muted-foreground">
          <Link href="/boxes">
            <ArrowLeft className="h-4 w-4" />
            All boxes
          </Link>
        </Button>

        <PageHeader
          title={box.name}
          description={
            <span className="flex flex-wrap items-center gap-2">
              {box.location && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {box.location}
                </span>
              )}
              <Badge variant="secondary">
                {box.gridRows} × {box.gridCols} grid
              </Badge>
              <Badge variant="outline">
                {drawers.length} drawer{drawers.length === 1 ? "" : "s"}
              </Badge>
            </span>
          }
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {/* Prev / next box stepper */}
              <div className="flex items-center rounded-md border border-border">
                <Button
                  asChild={Boolean(prevBoxId)}
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-r-none"
                  disabled={!prevBoxId}
                  aria-label="Previous box"
                >
                  {prevBoxId ? (
                    <Link href={`/boxes/${prevBoxId}`}>
                      <ChevronLeft className="h-4 w-4" />
                    </Link>
                  ) : (
                    <span>
                      <ChevronLeft className="h-4 w-4" />
                    </span>
                  )}
                </Button>
                <Button
                  asChild={Boolean(nextBoxId)}
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-l-none border-l border-border"
                  disabled={!nextBoxId}
                  aria-label="Next box"
                >
                  {nextBoxId ? (
                    <Link href={`/boxes/${nextBoxId}`}>
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  ) : (
                    <span>
                      <ChevronRight className="h-4 w-4" />
                    </span>
                  )}
                </Button>
              </div>

              {/* View toggle */}
              <div className="flex items-center rounded-md border border-border p-0.5">
                <Button
                  variant={view === "front" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-8"
                  onClick={() => {
                    setView("front");
                  }}
                >
                  <LayoutGrid className="h-4 w-4" />
                  Front
                </Button>
                <Button
                  variant={view === "list" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-8"
                  onClick={() => {
                    setView("list");
                    setEditLayout(false);
                  }}
                >
                  <List className="h-4 w-4" />
                  List
                </Button>
              </div>

              {canManage && view === "front" && drawers.length > 0 && (
                <Button
                  variant={editLayout ? "default" : "outline"}
                  size="sm"
                  onClick={() => setEditLayout((v) => !v)}
                >
                  <Move className="h-4 w-4" />
                  {editLayout ? "Done" : "Edit layout"}
                </Button>
              )}

              {canManage && (
                <Button
                  size="sm"
                  onClick={() => {
                    setEditingDrawer(null);
                    setFormOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4" />
                  Add drawer
                </Button>
              )}
            </div>
          }
        />
      </div>

      {box.summary && (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {box.summary}
        </p>
      )}

      {editLayout && (
        <p className="text-xs text-muted-foreground">
          Drag drawers onto empty cells to move them. Use the corner controls to resize
          (shift-click to shrink). Changes save automatically.
        </p>
      )}

      {drawers.length === 0 ? (
        <EmptyState
          icon={LayoutGrid}
          title="No drawers yet"
          description={
            canManage
              ? "Add a drawer to lay it out in the box front view."
              : "This box has no drawers yet."
          }
          action={
            canManage ? (
              <Button
                onClick={() => {
                  setEditingDrawer(null);
                  setFormOpen(true);
                }}
              >
                <Plus className="h-4 w-4" />
                Add drawer
              </Button>
            ) : undefined
          }
        />
      ) : view === "front" ? (
        <BoxFrontView
          gridRows={box.gridRows}
          gridCols={box.gridCols}
          drawers={drawers}
          editMode={editLayout}
          canManage={canManage}
          onOpen={openDrawer}
          onEdit={(d) => {
            setEditingDrawer(d);
            setFormOpen(true);
          }}
          onDelete={(d) => setDeleting(d)}
          onLayoutChange={setDrawers}
        />
      ) : (
        <DrawerListView
          boxId={box.id}
          drawers={drawers}
          canManage={canManage}
          onOpen={openDrawer}
          onEdit={(d) => {
            setEditingDrawer(d);
            setFormOpen(true);
          }}
          onDelete={(d) => setDeleting(d)}
          onReordered={setDrawers}
        />
      )}

      <DrawerForm
        open={formOpen}
        onOpenChange={setFormOpen}
        boxId={box.id}
        drawer={editingDrawer}
        onSaved={reload}
      />

      <Dialog open={Boolean(deleting)} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete drawer</DialogTitle>
            <DialogDescription>
              Delete <span className="font-medium text-foreground">{deleting?.name}</span>? Its bins
              are removed. Items inside become unassigned but are not deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Delete drawer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
