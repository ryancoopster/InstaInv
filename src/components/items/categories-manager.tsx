"use client";

import * as React from "react";
import {
  Plus,
  Pencil,
  Trash2,
  FolderTree,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { usePermissions } from "@/components/shell/permission-context";
import { SortableList, SortableRow, SortableHandle } from "./sortable";
import { CategoryForm } from "./category-form";
import { CustomFieldDefEditor } from "./custom-field-def-editor";
import type { CategoryRow } from "./types";

export function CategoriesManager({ initial }: { initial: CategoryRow[] }) {
  const { can } = usePermissions();
  const canManage = can("categories.manage");
  const [rows, setRows] = React.useState<CategoryRow[]>(initial);
  const [editing, setEditing] = React.useState<CategoryRow | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function openNew() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(c: CategoryRow) {
    setEditing(c);
    setDialogOpen(true);
  }

  function onSaved(saved: CategoryRow) {
    setRows((prev) => {
      const exists = prev.some((p) => p.id === saved.id);
      return exists
        ? prev.map((p) => (p.id === saved.id ? { ...p, ...saved } : p))
        : [...prev, { ...saved, _count: { items: 0, customFields: 0 } }];
    });
    setDialogOpen(false);
  }

  async function remove(c: CategoryRow) {
    if (!confirm(`Delete category "${c.name}"? Its custom fields will be removed and items uncategorized.`)) return;
    const prev = rows;
    setRows((r) => r.filter((x) => x.id !== c.id));
    try {
      await api.del(`/api/categories/${c.id}`);
      toast.success("Category deleted");
    } catch (err) {
      setRows(prev);
      toast.error(err instanceof ApiError ? err.message : "Delete failed");
    }
  }

  async function persistReorder(ids: string[]) {
    const byId = new Map(rows.map((r) => [r.id, r]));
    setRows(ids.map((id) => byId.get(id)!).filter(Boolean));
    try {
      await api.patch("/api/categories/reorder", { ids });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Reorder failed");
    }
  }

  // Parents available in the form (excludes the one being edited).
  const parentOptions = rows
    .filter((r) => !editing || r.id !== editing.id)
    .map((r) => ({ id: r.id, name: r.name }));

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <Button onClick={openNew}>
            <Plus className="h-4 w-4" />
            New category
          </Button>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={FolderTree}
          title="No categories yet"
          description="Categories group your items and define the custom fields each item can carry."
          action={
            canManage ? (
              <Button onClick={openNew}>
                <Plus className="h-4 w-4" />
                New category
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-2">
          <SortableList
            ids={rows.map((r) => r.id)}
            onReorder={persistReorder}
            disabled={!canManage}
          >
            {rows.map((c) => {
              const isOpen = expanded.has(c.id);
              return (
                <SortableRow key={c.id} id={c.id} as="div" className="rounded-lg border border-border bg-card">
                  <div className="flex items-center gap-2 p-3">
                    {canManage ? <SortableHandle /> : <span className="inline-block h-7 w-7" />}
                    <button
                      type="button"
                      onClick={() => toggleExpand(c.id)}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                      aria-label="Toggle custom fields"
                    >
                      {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                    <span
                      className="h-3 w-3 shrink-0 rounded-full border border-border"
                      style={{ backgroundColor: c.color ?? "transparent" }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{c.name}</span>
                        {c.parent && (
                          <Badge variant="outline" className="text-xs">
                            in {c.parent.name}
                          </Badge>
                        )}
                      </div>
                      {c.description && (
                        <p className="truncate text-xs text-muted-foreground">{c.description}</p>
                      )}
                    </div>
                    <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
                      <Badge variant="secondary">{c._count?.items ?? 0} items</Badge>
                      <Badge variant="secondary">{c._count?.customFields ?? 0} fields</Badge>
                    </div>
                    {canManage && (
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(c)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => remove(c)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                  {isOpen && (
                    <div className={cn("border-t border-border p-3")}>
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Custom fields
                      </p>
                      <CustomFieldDefEditor categoryId={c.id} canManage={canManage} />
                    </div>
                  )}
                </SortableRow>
              );
            })}
          </SortableList>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit category" : "New category"}</DialogTitle>
          </DialogHeader>
          <CategoryForm
            category={editing}
            parents={parentOptions}
            onSaved={onSaved}
            onCancel={() => setDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
