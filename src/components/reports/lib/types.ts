// Plain (non-server-only) type mirror of the reorder report shape so client
// components can import it without pulling in `server-only` / prisma.
// Keep in sync with src/components/reports/lib/report.ts.

export interface ReportLine {
  id: string;
  name: string;
  partNumber: string | null;
  current: number;
  desired: number;
  needed: number;
  unitCost: string;
  lineTotal: string;
  origin: "item" | "request";
  unit: string | null;
}

export interface ReportSupplierGroup {
  supplierId: string;
  supplier: string;
  lines: ReportLine[];
  subtotal: string;
}

export interface ReorderReport {
  generatedAt: string;
  suppliers: ReportSupplierGroup[];
  grandTotal: string;
  currency: string;
  totals: {
    supplierCount: number;
    lineCount: number;
  };
}

export interface SupplierOption {
  id: string;
  name: string;
}
