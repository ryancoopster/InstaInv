import type { PermissionKey } from "@/lib/permissions";

// Tri-state permission map used by the per-user override editor.
//   key present  + true  → Allow
//   key present  + false → Deny
//   key absent           → Inherit (use the role / userType value)
export type PermissionOverrideMap = Partial<Record<PermissionKey, boolean>>;

// Map of permissionKey -> boolean granted by a role (UserType).
export type RolePermissionMap = Partial<Record<PermissionKey, boolean>>;

// Safe (no passwordHash) user shape returned by the users API.
export interface AdminUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
  isActive: boolean;
  userTypeId: string;
  userType: AdminRole;
  permissionOverrides: PermissionOverrideMap;
  effectivePermissions: Record<PermissionKey, boolean>;
  sortOrder: number;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminRole {
  id: string;
  name: string;
  description: string | null;
  isAdmin: boolean;
  isSystem: boolean;
  permissions: RolePermissionMap;
  sortOrder: number;
  userCount?: number;
  createdAt?: string;
  updatedAt?: string;
}
