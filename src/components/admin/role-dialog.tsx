"use client";

import * as React from "react";
import { Loader2, Save, ShieldCheck, ShieldPlus } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PermissionMatrix } from "./permission-matrix";
import type { AdminRole, RolePermissionMap } from "./types";

type Mode = "create" | "edit";

export function RoleDialog({
  open,
  onOpenChange,
  mode,
  role,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: Mode;
  role: AdminRole | null;
  onSaved: () => void;
}) {
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [isAdmin, setIsAdmin] = React.useState(false);
  const [permissions, setPermissions] = React.useState<RolePermissionMap>({});
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    if (mode === "edit" && role) {
      setName(role.name);
      setDescription(role.description ?? "");
      setIsAdmin(role.isAdmin);
      setPermissions({ ...role.permissions });
    } else {
      setName("");
      setDescription("");
      setIsAdmin(false);
      setPermissions({});
    }
    setError(null);
  }, [open, mode, role]);

  const submit = async () => {
    setError(null);
    setSaving(true);
    try {
      const payload = {
        name,
        description: description.trim() ? description.trim() : null,
        isAdmin,
        permissions,
      };
      if (mode === "create") {
        await api.post<AdminRole>("/api/roles", payload);
        toast.success({ title: "Role created", description: name });
      } else if (role) {
        await api.patch<AdminRole>(`/api/roles/${role.id}`, payload);
        toast.success({ title: "Role updated", description: name });
      }
      onOpenChange(false);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save role");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Create role" : `Edit ${role?.name ?? "role"}`}</DialogTitle>
          <DialogDescription>
            Roles define a baseline set of permissions. Assign roles to users on the Users page.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="role-name">Name</Label>
              <Input
                id="role-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Warehouse Lead"
                disabled={role?.isSystem}
              />
              {role?.isSystem && (
                <p className="text-xs text-muted-foreground">System role name is locked.</p>
              )}
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
              <div>
                <Label htmlFor="role-admin" className="flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  Administrator
                </Label>
                <p className="text-xs text-muted-foreground">
                  {isAdmin ? "Grants every permission." : "Grant access via the matrix below."}
                </p>
              </div>
              <Switch id="role-admin" checked={isAdmin} onCheckedChange={setIsAdmin} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="role-desc">Description</Label>
            <Textarea
              id="role-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this role for?"
              rows={2}
            />
          </div>

          {isAdmin && (
            <div className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm">
              <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
              <span>
                This is an administrator role and <strong>grants everything</strong>. The matrix is
                shown for reference but isn&apos;t used while admin is on.
              </span>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Permissions</Label>
              {!isAdmin && (
                <Badge variant="secondary">{Object.keys(permissions).length} granted</Badge>
              )}
            </div>
            <PermissionMatrix value={permissions} onChange={setPermissions} disabled={isAdmin} />
          </div>
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving || name.trim().length === 0}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : mode === "create" ? (
              <ShieldPlus className="h-4 w-4" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {mode === "create" ? "Create role" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
