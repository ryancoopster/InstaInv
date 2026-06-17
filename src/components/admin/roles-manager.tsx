"use client";

import * as React from "react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis, restrictToParentElement } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import {
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  ShieldCheck,
  ShieldPlus,
  Trash2,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { applySort } from "@/lib/utils";
import { ALL_PERMISSION_KEYS } from "@/lib/permissions";
import { usePermissions } from "@/components/shell/permission-context";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "@/components/ui/toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DragHandleCell,
  SortableHead,
  SortableRow,
  type SortState,
} from "./sortable";
import { RoleDialog } from "./role-dialog";
import type { AdminRole } from "./types";

const TOTAL = ALL_PERMISSION_KEYS.length;

export function RolesManager({ initialRoles }: { initialRoles: AdminRole[] }) {
  const { can } = usePermissions();
  const canManage = can("users.manage");

  const [roles, setRoles] = React.useState<AdminRole[]>(initialRoles);
  const [sort, setSort] = React.useState<SortState>({ key: null, dir: "asc" });
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [dialogMode, setDialogMode] = React.useState<"create" | "edit">("create");
  const [editing, setEditing] = React.useState<AdminRole | null>(null);
  const [deleting, setDeleting] = React.useState<AdminRole | null>(null);
  const [deletingBusy, setDeletingBusy] = React.useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const refresh = React.useCallback(async () => {
    try {
      setRoles(await api.get<AdminRole[]>("/api/roles"));
    } catch {
      /* keep current */
    }
  }, []);

  const viewRows = React.useMemo(() => applySort(roles, sort.key, sort.dir), [roles, sort]);
  const dragDisabled = sort.key !== null || !canManage;

  const onDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = roles.findIndex((r) => r.id === active.id);
    const newIndex = roles.findIndex((r) => r.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(roles, oldIndex, newIndex).map((r, i) => ({ ...r, sortOrder: i }));
    setRoles(next);
    try {
      await api.patch("/api/roles/reorder", { ids: next.map((r) => r.id) });
    } catch (err) {
      toast.error({
        title: "Could not save order",
        description: err instanceof ApiError ? err.message : undefined,
      });
      refresh();
    }
  };

  const openCreate = () => {
    setDialogMode("create");
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (r: AdminRole) => {
    setDialogMode("edit");
    setEditing(r);
    setDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeletingBusy(true);
    try {
      await api.del(`/api/roles/${deleting.id}`);
      toast.success({ title: "Role deleted", description: deleting.name });
      setDeleting(null);
      refresh();
    } catch (err) {
      toast.error({
        title: "Could not delete role",
        description: err instanceof ApiError ? err.message : undefined,
      });
    } finally {
      setDeletingBusy(false);
    }
  };

  const permSummary = (r: AdminRole) =>
    r.isAdmin ? "All permissions" : `${Object.keys(r.permissions).length} of ${TOTAL}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Roles"
        description="Permission tiers assigned to users. Per-user overrides live on the Users page."
        actions={
          canManage ? (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              New role
            </Button>
          ) : null
        }
      />

      {roles.length === 0 ? (
        <EmptyState
          icon={ShieldPlus}
          title="No roles yet"
          description="Create a role to start grouping permissions."
          action={
            canManage ? (
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4" />
                New role
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="rounded-lg border border-border">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis, restrictToParentElement]}
            onDragEnd={onDragEnd}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <SortableHead label="Role" sortKey="name" sort={sort} onSort={setSort} />
                  <TableHead>Description</TableHead>
                  <TableHead>Permissions</TableHead>
                  <SortableHead label="Users" sortKey="userCount" sort={sort} onSort={setSort} />
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <SortableContext
                  items={viewRows.map((r) => r.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {viewRows.map((r) => (
                    <SortableRow key={r.id} id={r.id} dragDisabled={dragDisabled}>
                      <DragHandleCell />
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{r.name}</span>
                          {r.isAdmin && (
                            <Badge variant="default">
                              <ShieldCheck className="h-3 w-3" />
                              Admin
                            </Badge>
                          )}
                          {r.isSystem && (
                            <Badge variant="outline" className="text-muted-foreground">
                              <Lock className="h-3 w-3" />
                              System
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-xs text-muted-foreground">
                        <span className="line-clamp-1">{r.description || "—"}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={r.isAdmin ? "default" : "secondary"}>{permSummary(r)}</Badge>
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {r.userCount ?? 0}
                      </TableCell>
                      <TableCell className="text-right">
                        {canManage ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger>
                              <Button variant="ghost" size="icon" aria-label="Role actions">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEdit(r)}>
                                <Pencil className="h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                              {!r.isSystem && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    destructive
                                    disabled={(r.userCount ?? 0) > 0}
                                    onClick={() => setDeleting(r)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    Delete
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </SortableRow>
                  ))}
                </SortableContext>
              </TableBody>
            </Table>
          </DndContext>
        </div>
      )}

      {sort.key !== null && canManage && (
        <p className="text-xs text-muted-foreground">
          Drag-to-reorder is paused while a column sort is active. Clear the sort to restore manual
          ordering.
        </p>
      )}

      <RoleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mode={dialogMode}
        role={editing}
        onSaved={refresh}
      />

      <Dialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete role</DialogTitle>
            <DialogDescription>
              This permanently removes the <strong>{deleting?.name}</strong> role. This cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)} disabled={deletingBusy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deletingBusy}>
              <Trash2 className="h-4 w-4" />
              Delete role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
