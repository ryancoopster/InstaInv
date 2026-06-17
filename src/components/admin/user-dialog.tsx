"use client";

import * as React from "react";
import { KeyRound, Loader2, Save, UserPlus } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PermissionOverrideEditor } from "./permission-override-editor";
import type { AdminRole, AdminUser, PermissionOverrideMap } from "./types";

type Mode = "create" | "edit";

export function UserDialog({
  open,
  onOpenChange,
  mode,
  user,
  roles,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: Mode;
  user: AdminUser | null;
  roles: AdminRole[];
  onSaved: () => void;
}) {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [userTypeId, setUserTypeId] = React.useState("");
  const [isActive, setIsActive] = React.useState(true);
  const [overrides, setOverrides] = React.useState<PermissionOverrideMap>({});
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // (Re)hydrate form whenever the dialog opens.
  React.useEffect(() => {
    if (!open) return;
    if (mode === "edit" && user) {
      setName(user.name);
      setEmail(user.email);
      setPassword("");
      setUserTypeId(user.userTypeId);
      setIsActive(user.isActive);
      setOverrides({ ...user.permissionOverrides });
    } else {
      setName("");
      setEmail("");
      setPassword("");
      setUserTypeId(roles[0]?.id ?? "");
      setIsActive(true);
      setOverrides({});
    }
    setError(null);
  }, [open, mode, user, roles]);

  const selectedRole = roles.find((r) => r.id === userTypeId) ?? null;

  const submit = async () => {
    setError(null);
    setSaving(true);
    try {
      if (mode === "create") {
        await api.post<AdminUser>("/api/users", {
          name,
          email,
          password,
          userTypeId,
          isActive,
        });
        toast.success({ title: "User created", description: email });
      } else if (user) {
        await api.patch<AdminUser>(`/api/users/${user.id}`, {
          name,
          email,
          userTypeId,
          isActive,
          permissionOverrides: overrides,
        });
        toast.success({ title: "User updated", description: email });
      }
      onOpenChange(false);
      onSaved();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Could not save user";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Add user" : `Edit ${user?.name ?? "user"}`}</DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Create an account and assign it a role."
              : "Change the user's details, role, status and per-user permission overrides."}
          </DialogDescription>
        </DialogHeader>

        {mode === "create" ? (
          <div className="space-y-4">
            <ProfileFields
              name={name}
              setName={setName}
              email={email}
              setEmail={setEmail}
              userTypeId={userTypeId}
              setUserTypeId={setUserTypeId}
              isActive={isActive}
              setIsActive={setIsActive}
              roles={roles}
            />
            <div className="space-y-1.5">
              <Label htmlFor="new-password">Password</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
              />
            </div>
          </div>
        ) : (
          <Tabs defaultValue="profile">
            <TabsList>
              <TabsTrigger value="profile">Profile</TabsTrigger>
              <TabsTrigger value="permissions">
                Permissions
                {Object.keys(overrides).length > 0 && (
                  <span className="ml-1 rounded-full bg-primary px-1.5 text-[10px] leading-4 text-primary-foreground">
                    {Object.keys(overrides).length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="profile" className="space-y-4 pt-2">
              <ProfileFields
                name={name}
                setName={setName}
                email={email}
                setEmail={setEmail}
                userTypeId={userTypeId}
                setUserTypeId={setUserTypeId}
                isActive={isActive}
                setIsActive={setIsActive}
                roles={roles}
              />
              {user && <PasswordResetSection userId={user.id} />}
            </TabsContent>
            <TabsContent value="permissions" className="pt-2">
              {selectedRole?.isAdmin ? (
                <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground">
                  This user&apos;s role <strong>{selectedRole.name}</strong> is an administrator and
                  grants every permission. Overrides set to <em>Deny</em> below will still take
                  effect and remove specific permissions from this user.
                </div>
              ) : null}
              <div className="mt-3">
                <PermissionOverrideEditor
                  overrides={overrides}
                  onChange={setOverrides}
                  role={{
                    isAdmin: selectedRole?.isAdmin ?? false,
                    permissions: selectedRole?.permissions ?? {},
                  }}
                />
              </div>
            </TabsContent>
          </Tabs>
        )}

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
          <Button onClick={submit} disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : mode === "create" ? (
              <UserPlus className="h-4 w-4" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {mode === "create" ? "Create user" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProfileFields({
  name,
  setName,
  email,
  setEmail,
  userTypeId,
  setUserTypeId,
  isActive,
  setIsActive,
  roles,
}: {
  name: string;
  setName: (v: string) => void;
  email: string;
  setEmail: (v: string) => void;
  userTypeId: string;
  setUserTypeId: (v: string) => void;
  isActive: boolean;
  setIsActive: (v: boolean) => void;
  roles: AdminRole[];
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="user-name">Name</Label>
          <Input id="user-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="user-email">Email</Label>
          <Input
            id="user-email"
            type="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@example.com"
          />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="user-role">Role</Label>
          <Select id="user-role" value={userTypeId} onChange={(e) => setUserTypeId(e.target.value)}>
            {roles.length === 0 && <option value="">No roles available</option>}
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.isAdmin ? " (admin)" : ""}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex items-end justify-between gap-3 rounded-md border border-border px-3 py-2">
          <div>
            <Label htmlFor="user-active" className="block">
              Active
            </Label>
            <p className="text-xs text-muted-foreground">Inactive users cannot sign in.</p>
          </div>
          <Switch id="user-active" checked={isActive} onCheckedChange={setIsActive} />
        </div>
      </div>
    </>
  );
}

function PasswordResetSection({ userId }: { userId: string }) {
  const [open, setOpen] = React.useState(false);
  const [password, setPassword] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const reset = async () => {
    setSaving(true);
    try {
      await api.patch(`/api/users/${userId}/password`, { password });
      toast.success("Password reset");
      setPassword("");
      setOpen(false);
    } catch (err) {
      toast.error({
        title: "Could not reset password",
        description: err instanceof ApiError ? err.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <KeyRound className="h-3.5 w-3.5" />
        Reset password
      </Button>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <Label htmlFor="reset-password">New password</Label>
      <div className="flex gap-2">
        <Input
          id="reset-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
        />
        <Button type="button" size="sm" onClick={reset} disabled={saving || password.length < 8}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Set"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            setOpen(false);
            setPassword("");
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
