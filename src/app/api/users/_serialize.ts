import "server-only";
import type { User, UserType } from "@prisma/client";
import {
  ALL_PERMISSION_KEYS,
  effectivePermissions,
  type PermissionKey,
} from "@/lib/permissions";

type UserWithType = User & { userType: UserType };

function asMap(value: unknown): Partial<Record<PermissionKey, boolean>> {
  if (!value || typeof value !== "object") return {};
  const src = value as Record<string, unknown>;
  const out: Partial<Record<PermissionKey, boolean>> = {};
  for (const key of ALL_PERMISSION_KEYS) {
    if (key in src) out[key] = Boolean(src[key]);
  }
  return out;
}

export function serializeRole(
  role: UserType & { _count?: { users: number } },
) {
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    isAdmin: role.isAdmin,
    isSystem: role.isSystem,
    permissions: asMap(role.permissions),
    sortOrder: role.sortOrder,
    userCount: role._count?.users,
    createdAt: role.createdAt.toISOString(),
    updatedAt: role.updatedAt.toISOString(),
  };
}

// Strip passwordHash, normalise JSON maps, and compute effective permissions.
export function serializeUser(user: UserWithType) {
  const { passwordHash: _omit, ...rest } = user;
  return {
    id: rest.id,
    name: rest.name,
    email: rest.email,
    image: rest.image,
    isActive: rest.isActive,
    userTypeId: rest.userTypeId,
    userType: serializeRole(user.userType),
    permissionOverrides: asMap(rest.permissionOverrides),
    effectivePermissions: effectivePermissions(user),
    sortOrder: rest.sortOrder,
    lastLoginAt: rest.lastLoginAt ? rest.lastLoginAt.toISOString() : null,
    createdAt: rest.createdAt.toISOString(),
    updatedAt: rest.updatedAt.toISOString(),
  };
}
