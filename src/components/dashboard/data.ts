// The single, serialized data payload the dashboard server component builds and
// hands to the client <DashboardGrid>. Every widget reads from this — no widget
// fetches on its own. All Decimal money values are pre-serialized to numbers here
// (the server does the Number() conversion before passing across the boundary),
// and all Date values are ISO strings so the object is safely serializable.

export interface KpiDatum {
  key: string;
  label: string;
  value: string;
  sub?: string;
  /** lucide icon name resolved client-side from a small map. */
  icon: string;
  href?: string;
  /** semantic accent classes, e.g. "text-primary bg-primary/10". */
  accent: string;
}

export interface LowStockRow {
  id: string;
  name: string;
  category: string | null;
  location: string | null;
  quantity: number;
  unit: string | null;
  target: number;
  reorder: number;
  critical: boolean;
}

export interface CategoryDatum {
  name: string;
  count: number;
  value: number;
}

export interface SupplierValueDatum {
  name: string;
  value: number;
}

export interface ActivityRow {
  id: string;
  action: string;
  entity: string | null;
  userName: string | null;
  createdAt: string; // ISO
}

export interface PriceWatchRow {
  id: string;
  name: string;
  supplier: string | null;
  lastFetchedPrice: number | null;
  priceUpdatedAt: string | null; // ISO
  priceFetchStatus: string | null; // "ok" | "error" | "pending" | "unsupported"
  priceFetchError: string | null;
  priceSource: string | null;
}

export interface DashboardData {
  kpis: KpiDatum[];
  lowStock: LowStockRow[];
  lowStockCount: number;
  categories: CategoryDatum[];
  suppliers: SupplierValueDatum[];
  activity: ActivityRow[];
  priceWatch: PriceWatchRow[];
  priceErrorCount: number;
  /** Greeting name + generated timestamp for the header. */
  generatedAt: string; // ISO
}
