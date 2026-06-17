// Shared, JSON-safe types for the consolidated buy list. Decimals are strings.

export type BuyListSource = "STOCK_SHORTFALL" | "USER_REQUEST" | "ADMIN_MANUAL";

export interface BuyListLine {
  // A stable key for React lists / dedupe (itemId or request id).
  key: string;
  // Originating order-request id when this line came from an OrderRequest row
  // (null for live stock-shortfall lines that have no request yet).
  requestId: string | null;
  itemId: string | null;
  name: string;
  partNumber: string | null;
  supplier: string;
  needed: number; // quantity to buy
  unitCost: string; // serialized Decimal
  lineTotal: string; // needed * unitCost, serialized
  source: BuyListSource;
  // For shortfall lines: current vs desired so the UI can show the gap.
  currentQuantity?: number;
  desiredQuantity?: number;
}

export interface BuyListGroup {
  supplierId: string | null;
  supplier: string;
  lines: BuyListLine[];
  supplierTotal: string; // serialized Decimal
  // ids of OrderRequest rows in this group eligible to be marked ordered.
  approvedRequestIds: string[];
}

export interface BuyList {
  groups: BuyListGroup[];
  grandTotal: string;
  // Counts for header chips.
  shortfallCount: number;
  approvedCount: number;
  manualCount: number;
}
