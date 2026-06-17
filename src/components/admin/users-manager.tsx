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
  MoreHorizontal,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  UserCog,
  Users as UsersIcon,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { applySort } from "@/lib/utils";
import { usePermissions } from "@/components/shell/permission-context";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
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
import { UserDialog } from "./user-dialog";
import type { AdminRole, AdminUser } from "./types";

export function UsersManager({
  initialUsers,
  roles,
  currentUserId,
}: {
  initialUsers: AdminUser[];
  roles: AdminRole[];
  currentUserId: string;
}) {
  const { can } = usePermissions();
  const canManage = can("users.manage");

  const [users, setUsers] = React.useState<AdminUser[]>(initialUsers);
  const [sort, setSort] = React.useState<SortState>({ key: null, dir: "asc" });
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [dialogMode, setDialogMode] = React.useState<"create" | "edit">("create");
  const [editing, setEditing] = React.useState<AdminUser | null>(null);
  const [deleting, setDeleting] = React.useState<AdminUser | null>(null);
  const [deletingBusy, setDeletingBusy] = React.useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const refresh = React.useCallback(async () => {
    try {
      const fresh = await api.get<AdminUser[]>("/api/users");
      setUsers(fresh);
    } catch {
      /* keep existing list on transient errors */
    }
  }, []);

  const viewRows = React.useMemo(() => applySort(users, sort.key, sort.dir), [users, sort]);
  const dragDisabled = sort.key !== null || !canManage;

  const onDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = users.findIndex((u) => u.id === active.id);
    const newIndex = users.findIndex((u) => u.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(users, oldIndex, newIndex).map((u, i) => ({ ...u, sortOrder: i }));
    setUsers(next);
    try {
      await api.patch("/api/users/reorder", { ids: next.map((u) => u.id) });
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
  const openEdit = (u: AdminUser) => {
    setDialogMode("edit");
    setEditing(u);
    setDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeletingBusy(true);
    try {
      await api.del(`/api/users/${deleting.id}`);
      toast.success({ title: "User deleted", description: deleting.email });
      setDeleting(null);
      refresh();
    } catch (err) {
      toast.error({
        title: "Could not delete user",
        description: err instanceof ApiError ? err.message : undefined,
      });
    } finally {
      setDeletingBusy(false);
    }
  };

  const toggleActive = async (u: AdminUser) => {
    try {
      await api.patch(`/api/users/${u.id}`, { isActive: !u.isActive });
      toast.success(u.isActive ? "User deactivated" : "User activated");
      refresh();
    } catch (err) {
      toast.error({
        title: "Could not update user",
        description: err instanceof ApiError ? err.message : undefined,
      });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="Manage accounts, roles and per-user permission overrides."
        actions={
          canManage ? (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Add user
            </Button>
          ) : null
        }
      />

      {users.length === 0 ? (
        <EmptyState
          icon={UsersIcon}
          title="No users yet"
          description="Create the first account to start managing access."
          action={
            canManage ? (
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4" />
                Add user
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
                  <SortableHead label="Name" sortKey="name" sort={sort} onSort={setSort} />
                  <SortableHead label="Email" sortKey="email" sort={sort} onSort={setSort} />
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Overrides</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <SortableContext
                  items={viewRows.map((u) => u.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {viewRows.map((u) => {
                    const overrideCount = Object.keys(u.permissionOverrides).length;
                    const isSelf = u.id === currentUserId;
                    return (
                      <SortableRow key={u.id} id={u.id} dragDisabled={dragDisabled}>
                        <DragHandleCell />
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar name={u.name} src={u.image} className="h-8 w-8" />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium">{u.name}</span>
                                {isSelf && (
                                  <Badge variant="outline" className="text-[10px]">
                                    You
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{u.email}</TableCell>
                        <TableCell>
                          <Badge variant={u.userType.isAdmin ? "default" : "secondary"}>
                            {u.userType.isAdmin && <ShieldCheck className="h-3 w-3" />}
                            {u.userType.name}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {u.isActive ? (
                            <Badge variant="success">Active</Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">
                              Inactive
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {overrideCount > 0 ? (
                            <Badge variant="warning">{overrideCount} custom</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">Inherits role</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {canManage ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger>
                                <Button variant="ghost" size="icon" aria-label="User actions">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => openEdit(u)}>
                                  <Pencil className="h-4 w-4" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => openEdit(u)}>
                                  <UserCog className="h-4 w-4" />
                                  Permission overrides
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => toggleActive(u)}
                                  disabled={isSelf && u.isActive}
                                >
                                  {u.isActive ? "Deactivate" : "Activate"}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  destructive
                                  disabled={isSelf}
                                  onClick={() => setDeleting(u)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </SortableRow>
                    );
                  })}
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

      <UserDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mode={dialogMode}
        user={editing}
        roles={roles}
        onSaved={refresh}
      />

      <Dialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete user</DialogTitle>
            <DialogDescription>
              This permanently removes <strong>{deleting?.name}</strong> ({deleting?.email}). This
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)} disabled={deletingBusy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deletingBusy}>
              <Trash2 className="h-4 w-4" />
              Delete user
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
