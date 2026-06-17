"use client";

import * as React from "react";
import type { PermissionKey } from "@/lib/permissions";

export type PermissionMap = Record<PermissionKey, boolean>;

interface PermissionContextValue {
  perms: PermissionMap;
  can: (key: PermissionKey) => boolean;
}

const PermissionContext = React.createContext<PermissionContextValue | null>(null);

export function PermissionProvider({
  value,
  children,
}: {
  value: PermissionMap;
  children: React.ReactNode;
}) {
  const ctx = React.useMemo<PermissionContextValue>(
    () => ({
      perms: value,
      can: (key: PermissionKey) => Boolean(value[key]),
    }),
    [value],
  );
  return <PermissionContext.Provider value={ctx}>{children}</PermissionContext.Provider>;
}

export function usePermissions(): PermissionContextValue {
  const ctx = React.useContext(PermissionContext);
  if (!ctx) {
    // Fail-safe: default to denying everything rather than crashing.
    return {
      perms: {} as PermissionMap,
      can: () => false,
    };
  }
  return ctx;
}
