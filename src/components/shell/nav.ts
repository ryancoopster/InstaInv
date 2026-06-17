import {
  LayoutDashboard,
  Package,
  FolderTree,
  Truck,
  Boxes,
  ClipboardList,
  ShoppingCart,
  BarChart3,
  Tag,
  ScanLine,
  Users,
  ShieldCheck,
  Smartphone,
  DollarSign,
  type LucideIcon,
} from "lucide-react";
import type { PermissionKey } from "@/lib/permissions";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Permission required to see this link. Omit for always-visible. */
  permission?: PermissionKey;
  /** Optional logical group used to render section headers. */
  group?: string;
  /** Match nested routes as active (e.g. /boxes/[id]). */
  exact?: boolean;
}

// Primary navigation. Order matters — it's the render order in the sidebar.
export const NAV_ITEMS: NavItem[] = [
  // --- Main ---
  { label: "Dashboard", href: "/", icon: LayoutDashboard, group: "Overview", exact: true },
  { label: "Items", href: "/items", icon: Package, permission: "items.view", group: "Inventory" },
  { label: "Categories", href: "/categories", icon: FolderTree, permission: "categories.view", group: "Inventory" },
  { label: "Suppliers", href: "/suppliers", icon: Truck, permission: "suppliers.view", group: "Inventory" },
  { label: "Boxes", href: "/boxes", icon: Boxes, permission: "boxes.view", group: "Inventory" },

  // --- Ordering ---
  { label: "Order Requests", href: "/requests", icon: ClipboardList, permission: "orders.request", group: "Ordering" },
  { label: "Buy List", href: "/orders", icon: ShoppingCart, permission: "orders.viewAll", group: "Ordering" },

  // --- Tools ---
  { label: "Reports", href: "/reports", icon: BarChart3, permission: "reports.view", group: "Tools" },
  { label: "Labels", href: "/labels", icon: Tag, permission: "labels.view", group: "Tools" },
  { label: "Scan / Checklists", href: "/scan", icon: ScanLine, permission: "ocr.scan", group: "Tools" },
  { label: "Mobile View", href: "/m", icon: Smartphone, group: "Tools" },

  // --- Administration ---
  { label: "Pricing", href: "/admin/pricing", icon: DollarSign, permission: "pricing.manage", group: "Administration" },
  { label: "Users", href: "/admin/users", icon: Users, permission: "users.view", group: "Administration" },
  { label: "Roles", href: "/admin/roles", icon: ShieldCheck, permission: "users.manage", group: "Administration" },
];

// Render order for the grouped sections.
export const NAV_GROUP_ORDER = [
  "Overview",
  "Inventory",
  "Ordering",
  "Tools",
  "Administration",
] as const;
