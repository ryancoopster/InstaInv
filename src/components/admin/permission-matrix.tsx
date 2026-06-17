"use client";

import * as React from "react";
import { permissionsByGroup, type PermissionKey } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import type { RolePermissionMap } from "./types";

/**
 * Grouped permission checkbox matrix used by the role editor.
 * When `disabled` (role is admin) all rows show as granted and read-only,
 * since isAdmin grants everything regardless of the map.
 */
export function PermissionMatrix({
  value,
  onChange,
  disabled,
}: {
  value: RolePermissionMap;
  onChange: (next: RolePermissionMap) => void;
  disabled?: boolean;
}) {
  const groups = React.useMemo(() => permissionsByGroup(), []);

  const isOn = (key: PermissionKey) => (disabled ? true : Boolean(value[key]));

  const setKey = (key: PermissionKey, on: boolean) => {
    if (disabled) return;
    const next: RolePermissionMap = { ...value };
    if (on) next[key] = true;
    else delete next[key];
    onChange(next);
  };

  const setGroup = (keys: PermissionKey[], on: boolean) => {
    if (disabled) return;
    const next: RolePermissionMap = { ...value };
    for (const k of keys) {
      if (on) next[k] = true;
      else delete next[k];
    }
    onChange(next);
  };

  const grantedCount = disabled
    ? Object.values(groups).reduce((n, g) => n + g.length, 0)
    : Object.keys(value).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {disabled
            ? "Administrator role — all permissions are granted."
            : `${grantedCount} permission${grantedCount === 1 ? "" : "s"} granted.`}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {Object.entries(groups).map(([group, perms]) => {
          const keys = perms.map((p) => p.key);
          const allOn = keys.every((k) => isOn(k));
          const someOn = keys.some((k) => isOn(k));
          return (
            <div
              key={group}
              className={cn(
                "rounded-md border border-border",
                disabled && "opacity-70",
              )}
            >
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {group}
                </span>
                {!disabled && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => setGroup(keys, !allOn)}
                  >
                    {allOn ? "Clear" : someOn ? "Select all" : "Select all"}
                  </Button>
                )}
              </div>
              <div className="divide-y divide-border">
                {perms.map((p) => {
                  const checked = isOn(p.key);
                  return (
                    <label
                      key={p.key}
                      className={cn(
                        "flex cursor-pointer items-start gap-2.5 px-3 py-2 transition-colors",
                        !disabled && "hover:bg-muted/50",
                        disabled && "cursor-default",
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        disabled={disabled}
                        onCheckedChange={(on) => setKey(p.key, on)}
                        className="mt-0.5"
                        aria-label={p.label}
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium leading-tight">{p.label}</span>
                        <span className="block text-xs text-muted-foreground">{p.description}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
