// Shared client-side types for the boxes/drawers/bins module. These mirror the
// serialized shapes returned by the /api/boxes, /api/drawers and /api/bins routes.

export interface BoxListItem {
  id: string;
  name: string;
  description: string | null;
  location: string | null;
  imageUrl: string | null;
  gridRows: number;
  gridCols: number;
  summary: string | null;
  sortOrder: number;
  drawerCount: number;
  itemCount: number;
  pieceCount: number;
}

export interface DrawerSummary {
  id: string;
  boxId: string;
  name: string;
  label: string | null;
  gridRow: number;
  gridCol: number;
  rowSpan: number;
  colSpan: number;
  binRows: number;
  binCols: number;
  color: string | null;
  summary: string | null;
  sortOrder: number;
  binCount: number;
  itemCount: number;
  pieceCount: number;
}

export interface BoxDetail {
  id: string;
  name: string;
  description: string | null;
  location: string | null;
  imageUrl: string | null;
  gridRows: number;
  gridCols: number;
  summary: string | null;
  sortOrder: number;
  drawers: DrawerSummary[];
}

export interface BinDetail {
  id: string;
  drawerId: string;
  name: string | null;
  gridRow: number;
  gridCol: number;
  rowSpan: number;
  colSpan: number;
  color: string | null;
  sortOrder: number;
}

export interface DrawerItem {
  id: string;
  name: string;
  quantity: number;
  unit: string | null;
  imageUrl: string | null;
  binId: string | null;
  sortOrder: number;
  category: { name: string; color: string | null } | null;
}

export interface DrawerDetail {
  id: string;
  boxId: string;
  box: { id: string; name: string; gridRows: number; gridCols: number };
  name: string;
  label: string | null;
  gridRow: number;
  gridCol: number;
  rowSpan: number;
  colSpan: number;
  binRows: number;
  binCols: number;
  color: string | null;
  summary: string | null;
  sortOrder: number;
  bins: BinDetail[];
  items: DrawerItem[];
}

// Small palette used for drawer/bin color strips. Stored as hex on the entity.
export const COLOR_SWATCHES = [
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#eab308",
  "#84cc16",
  "#22c55e",
  "#14b8a6",
  "#06b6d4",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
];
