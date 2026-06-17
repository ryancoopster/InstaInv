"use client";

import * as React from "react";
import { Plus, Pencil, Trash2, Truck, Mail, Phone, Globe } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { usePermissions } from "@/components/shell/permission-context";
import { SortableList, SortableRow, SortableHandle } from "./sortable";
import { SupplierForm } from "./supplier-form";
import type { SupplierRow } from "./types";

export function SuppliersManager({ initial }: { initial: SupplierRow[] }) {
  const { can } = usePermissions();
  const canManage = can("suppliers.manage");
  const [rows, setRows] = React.useState<SupplierRow[]>(initial);
  const [editing, setEditing] = React.useState<SupplierRow | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);

  function openNew() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(s: SupplierRow) {
    setEditing(s);
    setDialogOpen(true);
  }

  function onSaved(saved: SupplierRow) {
    setRows((prev) => {
      const exists = prev.some((p) => p.id === saved.id);
      return exists ? prev.map((p) => (p.id === saved.id ? { ...p, ...saved } : p)) : [...prev, saved];
    });
    setDialogOpen(false);
  }

  async function remove(s: SupplierRow) {
    if (!confirm(`Delete supplier "${s.name}"?`)) return;
    const prev = rows;
    setRows((r) => r.filter((x) => x.id !== s.id));
    try {
      await api.del(`/api/suppliers/${s.id}`);
      toast.success("Supplier deleted");
    } catch (err) {
      setRows(prev);
      toast.error(err instanceof ApiError ? err.message : "Delete failed");
    }
  }

  async function persistReorder(ids: string[]) {
    const byId = new Map(rows.map((r) => [r.id, r]));
    setRows(ids.map((id) => byId.get(id)!).filter(Boolean));
    try {
      await api.patch("/api/suppliers/reorder", { ids });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Reorder failed");
    }
  }

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <Button onClick={openNew}>
            <Plus className="h-4 w-4" />
            New supplier
          </Button>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="No suppliers yet"
          description="Add vendors so you can link items to where you buy them."
          action={
            canManage ? (
              <Button onClick={openNew}>
                <Plus className="h-4 w-4" />
                New supplier
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Account #</TableHead>
                <TableHead className="text-right">Items</TableHead>
                {canManage && <TableHead className="w-24 text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              <SortableList
                ids={rows.map((r) => r.id)}
                onReorder={persistReorder}
                disabled={!canManage}
              >
                {rows.map((s) => (
                  <SortableRow key={s.id} id={s.id}>
                    <TableCell className="pr-0">
                      {canManage ? <SortableHandle /> : <span className="inline-block h-7 w-7" />}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{s.name}</div>
                      {s.website && (
                        <a
                          href={s.website}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
                        >
                          <Globe className="h-3 w-3" />
                          {s.website.replace(/^https?:\/\//, "")}
                        </a>
                      )}
                    </TableCell>
                    <TableCell className="space-y-0.5 text-sm text-muted-foreground">
                      {s.email && (
                        <div className="flex items-center gap-1">
                          <Mail className="h-3 w-3" /> {s.email}
                        </div>
                      )}
                      {s.phone && (
                        <div className="flex items-center gap-1">
                          <Phone className="h-3 w-3" /> {s.phone}
                        </div>
                      )}
                      {!s.email && !s.phone && "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{s.accountNo || "—"}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="secondary">{s._count?.items ?? 0}</Badge>
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        <div className="inline-flex gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(s)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => remove(s)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </SortableRow>
                ))}
              </SortableList>
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit supplier" : "New supplier"}</DialogTitle>
          </DialogHeader>
          <SupplierForm
            supplier={editing}
            onSaved={onSaved}
            onCancel={() => setDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
