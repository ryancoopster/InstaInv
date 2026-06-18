// Shared types + default layout for the customizable dashboard.
//
// The per-user layout is persisted on User.dashboardConfig (JSON, nullable).
// When null, the UI falls back to DEFAULT_DASHBOARD below.
//
// All data for every widget is loaded once on the server (see app/(main)/page.tsx)
// and passed into the client <DashboardGrid> as a single DashboardData object,
// so toggling widgets on/off never triggers another round-trip.

import type { PermissionKey } from "@/lib/permissions";

// ---------------------------------------------------------------------------
// Widget registry
// ---------------------------------------------------------------------------

export type WidgetType =
  | "kpis"
  | "lowStock"
  | "categoryBreakdown"
  | "supplierValue"
  | "recentActivity"
  | "quickActions"
  | "priceWatch"
  | "outOfStock"
  | "recentItems";

/** Column span on the responsive 1/2/3-column grid. */
export type WidgetSpan = 1 | 2 | 3;

export interface WidgetConfig {
  type: WidgetType;
  /** 1, 2 or 3 columns wide on large screens. */
  span: WidgetSpan;
  /** When false the widget is parked in the "Add widget" tray. */
  visible: boolean;
}

export interface DashboardConfig {
  widgets: WidgetConfig[];
  /** ISO timestamp of the last save — handy for conflict-debugging. */
  updatedAt?: string;
}

// ---------------------------------------------------------------------------
// Per-widget metadata (label, description, default span, optional gate)
// ---------------------------------------------------------------------------

export interface WidgetMeta {
  type: WidgetType;
  title: string;
  description: string;
  /** Default span used when a widget is first added back from the tray. */
  defaultSpan: WidgetSpan;
  /** Spans the user is allowed to choose for this widget. */
  allowedSpans: WidgetSpan[];
  /**
   * Optional permission that must be effective for the widget to render.
   * Widgets the user can't see are silently dropped from the grid.
   */
  permission?: PermissionKey;
}

export const WIDGET_META: Record<WidgetType, WidgetMeta> = {
  kpis: {
    type: "kpis",
    title: "Key metrics",
    description: "Total items, value, low stock, boxes and more.",
    defaultSpan: 3,
    allowedSpans: [2, 3],
  },
  lowStock: {
    type: "lowStock",
    title: "Low stock",
    description: "Items below their desired / minimum level with reorder qty.",
    defaultSpan: 2,
    allowedSpans: [1, 2, 3],
  },
  categoryBreakdown: {
    type: "categoryBreakdown",
    title: "Items by category",
    description: "How your inventory is distributed across categories.",
    defaultSpan: 1,
    allowedSpans: [1, 2, 3],
  },
  supplierValue: {
    type: "supplierValue",
    title: "Value by supplier",
    description: "On-hand stock value grouped by supplier.",
    defaultSpan: 1,
    allowedSpans: [1, 2, 3],
  },
  recentActivity: {
    type: "recentActivity",
    title: "Recent activity",
    description: "The latest changes recorded across the app.",
    defaultSpan: 1,
    allowedSpans: [1, 2, 3],
  },
  quickActions: {
    type: "quickActions",
    title: "Quick actions",
    description: "Jump straight to taking inventory, the buy list or labels.",
    defaultSpan: 1,
    allowedSpans: [1, 2, 3],
  },
  priceWatch: {
    type: "priceWatch",
    title: "Price watch",
    description: "Recently price-checked items and fetch errors.",
    defaultSpan: 2,
    allowedSpans: [1, 2, 3],
    permission: "pricing.manage",
  },
  outOfStock: {
    type: "outOfStock",
    title: "Out of stock",
    description: "Items currently at zero on-hand quantity.",
    defaultSpan: 1,
    allowedSpans: [1, 2, 3],
  },
  recentItems: {
    type: "recentItems",
    title: "Recently added",
    description: "The newest items added to your inventory.",
    defaultSpan: 1,
    allowedSpans: [1, 2, 3],
  },
};

export const ALL_WIDGET_TYPES = Object.keys(WIDGET_META) as WidgetType[];

// ---------------------------------------------------------------------------
// Default layout — used when a user has never customized their dashboard.
// ---------------------------------------------------------------------------

export const DEFAULT_DASHBOARD: DashboardConfig = {
  widgets: [
    { type: "kpis", span: 3, visible: true },
    { type: "categoryBreakdown", span: 1, visible: true },
    { type: "supplierValue", span: 1, visible: true },
    { type: "quickActions", span: 1, visible: true },
    { type: "lowStock", span: 2, visible: true },
    { type: "recentActivity", span: 1, visible: true },
    { type: "priceWatch", span: 3, visible: true },
  ],
};

// ---------------------------------------------------------------------------
// Normalization — keep a stored config in sync with the widget registry.
// Drops unknown widget types, appends (hidden) any widgets added to the app
// since the config was saved, and clamps spans to what's allowed.
// ---------------------------------------------------------------------------

function clampSpan(meta: WidgetMeta, span: unknown): WidgetSpan {
  const n = Number(span);
  if (meta.allowedSpans.includes(n as WidgetSpan)) return n as WidgetSpan;
  return meta.defaultSpan;
}

export function normalizeConfig(raw: unknown): DashboardConfig {
  const source =
    raw && typeof raw === "object" && Array.isArray((raw as DashboardConfig).widgets)
      ? (raw as DashboardConfig)
      : DEFAULT_DASHBOARD;

  const seen = new Set<WidgetType>();
  const widgets: WidgetConfig[] = [];

  for (const w of source.widgets) {
    const type = w?.type as WidgetType;
    const meta = WIDGET_META[type];
    if (!meta || seen.has(type)) continue;
    seen.add(type);
    widgets.push({
      type,
      span: clampSpan(meta, w?.span),
      visible: w?.visible !== false,
    });
  }

  // Append any widget types that exist in the app but not in the stored config,
  // parked as hidden so the user can add them from the tray.
  for (const type of ALL_WIDGET_TYPES) {
    if (seen.has(type)) continue;
    widgets.push({ type, span: WIDGET_META[type].defaultSpan, visible: false });
  }

  return { widgets, updatedAt: source.updatedAt };
}

/** Drop widgets the user lacks permission for (used at render time). */
export function visibleWidgetsFor(
  config: DashboardConfig,
  can: (key: PermissionKey) => boolean,
): WidgetConfig[] {
  return config.widgets.filter((w) => {
    const meta = WIDGET_META[w.type];
    if (!meta) return false;
    if (meta.permission && !can(meta.permission)) return false;
    return true;
  });
}
