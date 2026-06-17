// Central permission registry. UserType.permissions and User.permissionOverrides
// are maps of these keys -> boolean. `isAdmin` on a UserType grants everything.
//
// Effective permission for a user =
//   user.permissionOverrides[key]  (if defined)
//   else userType.isAdmin ? true
//   else userType.permissions[key] ?? false

export type PermissionKey =
  | "items.view"
  | "items.create"
  | "items.edit"
  | "items.delete"
  | "items.adjustQuantity"
  | "categories.view"
  | "categories.manage"
  | "suppliers.view"
  | "suppliers.manage"
  | "boxes.view"
  | "boxes.manage"
  | "boxes.reorganize"
  | "orders.request"
  | "orders.viewAll"
  | "orders.approve"
  | "orders.markOrdered"
  | "orders.setDesired"
  | "reports.view"
  | "reports.export"
  | "labels.view"
  | "labels.design"
  | "labels.print"
  | "ocr.scan"
  | "users.view"
  | "users.manage"
  | "settings.manage";

export interface PermissionMeta {
  key: PermissionKey;
  group: string;
  label: string;
  description: string;
}

export const PERMISSIONS: PermissionMeta[] = [
  { key: "items.view", group: "Inventory", label: "View items", description: "See the item inventory." },
  { key: "items.create", group: "Inventory", label: "Create items", description: "Add new items." },
  { key: "items.edit", group: "Inventory", label: "Edit items", description: "Edit item details and fields." },
  { key: "items.delete", group: "Inventory", label: "Delete items", description: "Remove items." },
  { key: "items.adjustQuantity", group: "Inventory", label: "Adjust quantity", description: "Change current on-hand counts (inventory taking)." },
  { key: "categories.view", group: "Categories", label: "View categories", description: "See categories and custom fields." },
  { key: "categories.manage", group: "Categories", label: "Manage categories", description: "Create/edit categories and custom field definitions." },
  { key: "suppliers.view", group: "Suppliers", label: "View suppliers", description: "See suppliers/vendors." },
  { key: "suppliers.manage", group: "Suppliers", label: "Manage suppliers", description: "Create/edit suppliers." },
  { key: "boxes.view", group: "Boxes", label: "View boxes", description: "See boxes, drawers and bins." },
  { key: "boxes.manage", group: "Boxes", label: "Manage boxes", description: "Create/edit boxes, drawers and bins." },
  { key: "boxes.reorganize", group: "Boxes", label: "Reorganize", description: "Move items between boxes/drawers/bins." },
  { key: "orders.request", group: "Ordering", label: "Request items", description: "Submit item order requests." },
  { key: "orders.viewAll", group: "Ordering", label: "View all requests", description: "See everyone's order requests." },
  { key: "orders.approve", group: "Ordering", label: "Approve requests", description: "Approve or reject requests onto the buy list." },
  { key: "orders.markOrdered", group: "Ordering", label: "Mark ordered/received", description: "Advance approved items to ordered/received." },
  { key: "orders.setDesired", group: "Ordering", label: "Set desired quantities", description: "Bulk-enter desired vs current quantities." },
  { key: "reports.view", group: "Reports", label: "View reports", description: "View reorder reports." },
  { key: "reports.export", group: "Reports", label: "Export reports", description: "Export PDF/Excel reports." },
  { key: "labels.view", group: "Labels", label: "View labels", description: "See label templates." },
  { key: "labels.design", group: "Labels", label: "Design labels", description: "Create/edit label templates." },
  { key: "labels.print", group: "Labels", label: "Print labels", description: "Print/generate labels." },
  { key: "ocr.scan", group: "Inventory", label: "Scan checklists", description: "Upload and OCR printed count sheets." },
  { key: "users.view", group: "Administration", label: "View users", description: "See users and roles." },
  { key: "users.manage", group: "Administration", label: "Manage users & roles", description: "Create users, roles and assign permissions." },
  { key: "settings.manage", group: "Administration", label: "Manage settings", description: "Edit application settings." },
];

export const ALL_PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);

export function permissionsByGroup(): Record<string, PermissionMeta[]> {
  return PERMISSIONS.reduce<Record<string, PermissionMeta[]>>((acc, p) => {
    (acc[p.group] ??= []).push(p);
    return acc;
  }, {});
}

// A minimal user-permission shape so this module stays free of Prisma types.
export interface PermissionSubject {
  userType: { isAdmin: boolean; permissions: unknown };
  permissionOverrides: unknown;
}

function asMap(value: unknown): Record<string, boolean> {
  if (value && typeof value === "object") return value as Record<string, boolean>;
  return {};
}

export function hasPermission(subject: PermissionSubject | null | undefined, key: PermissionKey): boolean {
  if (!subject) return false;
  const overrides = asMap(subject.permissionOverrides);
  if (key in overrides) return Boolean(overrides[key]);
  if (subject.userType?.isAdmin) return true;
  return Boolean(asMap(subject.userType?.permissions)[key]);
}

export function effectivePermissions(subject: PermissionSubject | null | undefined): Record<PermissionKey, boolean> {
  const out = {} as Record<PermissionKey, boolean>;
  for (const key of ALL_PERMISSION_KEYS) out[key] = hasPermission(subject, key);
  return out;
}

// Convenience preset maps used by the seed for built-in roles.
export function presetBasicUser(): Record<string, boolean> {
  return {
    "items.view": true,
    "items.adjustQuantity": true,
    "categories.view": true,
    "suppliers.view": true,
    "boxes.view": true,
    "orders.request": true,
    "reports.view": true,
    "labels.view": true,
  };
}

export function presetManager(): Record<string, boolean> {
  return {
    ...presetBasicUser(),
    "items.create": true,
    "items.edit": true,
    "items.delete": true,
    "categories.manage": true,
    "suppliers.manage": true,
    "boxes.manage": true,
    "boxes.reorganize": true,
    "orders.viewAll": true,
    "orders.approve": true,
    "orders.markOrdered": true,
    "orders.setDesired": true,
    "reports.export": true,
    "labels.design": true,
    "labels.print": true,
    "ocr.scan": true,
  };
}
