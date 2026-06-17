"use client";

import * as React from "react";
import { Ban, Check, CornerDownRight, RotateCcw } from "lucide-react";
import {
  PERMISSIONS,
  permissionsByGroup,
  type PermissionKey,
} from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PermissionOverrideMap, RolePermissionMap } from "./types";

type TriState = "inherit" | "allow" | "deny";

function toTriState(value: boolean | undefined): TriState {
  if (value === undefined) return "inherit";
  return value ? "allow" : "deny";
}

/**
 * Tri-state per-user permission editor.
 *  - "inherit" omits the key from the overrides map (falls back to the role)
 *  - "allow" sets it to true, "deny" sets it to false
 * Shows the effective value (override OR role/admin) next to each control.
 */
export function PermissionOverrideEditor({
  overrides,
  onChange,
  role,
}: {
  overrides: PermissionOverrideMap;
  onChange: (next: PermissionOverrideMap) => void;
  role: { isAdmin: boolean; permissions: RolePermissionMap };
}) {
  const groups = React.useMemo(() => permissionsByGroup(), []);

  const roleGrants = (key: PermissionKey): boolean =>
    role.isAdmin ? true : Boolean(role.permissions[key]);

  const effective = (key: PermissionKey): boolean => {
    if (key in overrides) return Boolean(overrides[key]);
    return roleGrants(key);
  };

  const setState = (key: PermissionKey, state: TriState) => {
    const next: PermissionOverrideMap = { ...overrides };
    if (state === "inherit") {
      delete next[key];
    } else {
      next[key] = state === "allow";
    }
    onChange(next);
  };

  const overrideCount = Object.keys(overrides).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Override individual permissions for this user. Anything left on{" "}
          <span className="font-medium text-foreground">Inherit</span> uses the role.
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={overrideCount === 0}
          onClick={() => onChange({})}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset all ({overrideCount})
        </Button>
      </div>

      <div className="space-y-5">
        {Object.entries(groups).map(([group, perms]) => (
          <div key={group} className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group}
            </h4>
            <div className="divide-y divide-border rounded-md border border-border">
              {perms.map((p) => {
                const state = toTriState(overrides[p.key]);
                const eff = effective(p.key);
                const inheritedValue = roleGrants(p.key);
                return (
                  <div
                    key={p.key}
                    className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{p.label}</span>
                        <Badge variant={eff ? "success" : "outline"} className="shrink-0">
                          {eff ? "Effective: Allowed" : "Effective: Denied"}
                        </Badge>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{p.description}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <TriToggle
                        active={state === "inherit"}
                        onClick={() => setState(p.key, "inherit")}
                        tone="neutral"
                        title={`Inherit from role (${inheritedValue ? "Allowed" : "Denied"})`}
                      >
                        <CornerDownRight className="h-3.5 w-3.5" />
                        Inherit
                      </TriToggle>
                      <TriToggle
                        active={state === "allow"}
                        onClick={() => setState(p.key, "allow")}
                        tone="allow"
                        title="Always allow"
                      >
                        <Check className="h-3.5 w-3.5" />
                        Allow
                      </TriToggle>
                      <TriToggle
                        active={state === "deny"}
                        onClick={() => setState(p.key, "deny")}
                        tone="deny"
                        title="Always deny"
                      >
                        <Ban className="h-3.5 w-3.5" />
                        Deny
                      </TriToggle>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TriToggle({
  active,
  tone,
  onClick,
  title,
  children,
}: {
  active: boolean;
  tone: "neutral" | "allow" | "deny";
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const toneActive =
    tone === "allow"
      ? "bg-success text-success-foreground border-success"
      : tone === "deny"
        ? "bg-destructive text-destructive-foreground border-destructive"
        : "bg-secondary text-secondary-foreground border-border";
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors",
        active
          ? toneActive
          : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

// Count of total permissions, for "fully overridden" hints.
export const TOTAL_PERMISSIONS = PERMISSIONS.length;
