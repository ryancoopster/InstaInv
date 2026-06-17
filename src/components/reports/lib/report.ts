import "server-only";
import { prisma } from "@/lib/prisma";
import { reorderQty } from "@/lib/utils";
import type {
  ReorderReport,
  ReportLine,
  ReportSupplierGroup,
} from "./types";

export type { ReorderReport, ReportLine, ReportSupplierGroup } from "./types";

// ---------------------------------------------------------------------------
// Shared reorder-report computation.
//
// This module is imported by BOTH the JSON route (api/reports/reorder) and the
// file-export route (api/reports/export) so the on-screen report and the
// downloaded PDF/Excel are guaranteed to be identical.
//
// It lives under src/components/reports (this module's own area) rather than
// src/lib (which is shared) per the build contract. Type shapes are mirrored in
// ./types so client components can import them without `server-only`.
// ---------------------------------------------------------------------------

const NO_SUPPLIER_ID = "__none__";
const NO_SUPPLIER_NAME = "No supplier";

export interface ReportFilters {
  /** Restrict to a single supplier id (or the NO_SUPPLIER sentinel). */
  supplierId?: string | null;
  /** When true, only include items whose current qty is below minQuantity. */
  onlyBelowMin?: boolean;
}

/** Default ISO currency. Stored in Setting("currency") when present. */
async function resolveCurrency(): Promise<string> {
  try {
    const setting = await prisma.setting.findUnique({ where: { key: "currency" } });
    const value = setting?.value as unknown;
    if (typeof value === "string" && value.length === 3) return value.toUpperCase();
    if (value && typeof value === "object" && "code" in (value as any)) {
      const code = (value as any).code;
      if (typeof code === "string" && code.length === 3) return code.toUpperCase();
    }
  } catch {
    /* settings table may be empty; fall through */
  }
  return "USD";
}

function money(n: number): string {
  // Decimal-safe-ish: keep 4 dp to match the DB column precision.
  return (Math.round(n * 10000) / 10000).toFixed(4);
}

interface Accumulator {
  supplierId: string;
  supplier: string;
  lines: ReportLine[];
  subtotal: number;
}

/**
 * Compute the reorder report.
 *
 * Sources combined (deduplicated by item):
 *  - Items where reorderQty(quantity, desiredQuantity) > 0.
 *  - Approved OrderRequests (the buy list) — these may reference an item or be
 *    free-text. When a request references an item that's already counted from
 *    the items pass, the request quantity takes precedence (it's what's actually
 *    been approved to buy).
 */
export async function computeReorderReport(filters: ReportFilters = {}): Promise<ReorderReport> {
  const { supplierId, onlyBelowMin } = filters;

  const [items, approved, currency] = await Promise.all([
    prisma.item.findMany({
      select: {
        id: true,
        name: true,
        partNumber: true,
        unit: true,
        quantity: true,
        desiredQuantity: true,
        minQuantity: true,
        purchaseCost: true,
        supplierId: true,
        supplier: { select: { id: true, name: true } },
      },
      orderBy: [{ name: "asc" }],
    }),
    prisma.orderRequest.findMany({
      where: { status: "APPROVED" },
      select: {
        id: true,
        itemId: true,
        freeName: true,
        freePartNumber: true,
        freeSupplier: true,
        quantity: true,
        unitCost: true,
        supplierId: true,
        supplier: { select: { id: true, name: true } },
        item: {
          select: {
            id: true,
            name: true,
            partNumber: true,
            unit: true,
            quantity: true,
            desiredQuantity: true,
            purchaseCost: true,
            supplierId: true,
            supplier: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    resolveCurrency(),
  ]);

  const groups = new Map<string, Accumulator>();
  // Track which item ids have been satisfied by an approved request so the
  // items-pass does not double count them.
  const itemIdsFromRequests = new Set<string>();

  const groupFor = (sId: string | null | undefined, sName: string | null | undefined): Accumulator => {
    const id = sId ?? NO_SUPPLIER_ID;
    const name = sName ?? NO_SUPPLIER_NAME;
    let g = groups.get(id);
    if (!g) {
      g = { supplierId: id, supplier: name, lines: [], subtotal: 0 };
      groups.set(id, g);
    }
    return g;
  };

  const matchesSupplierFilter = (sId: string | null | undefined): boolean => {
    if (!supplierId) return true;
    return (sId ?? NO_SUPPLIER_ID) === supplierId;
  };

  // --- Pass 1: approved order requests (the authoritative buy list). ---
  for (const req of approved) {
    const linkedItem = req.item;
    if (linkedItem) itemIdsFromRequests.add(linkedItem.id);

    const sId = req.supplierId ?? linkedItem?.supplierId ?? null;
    const sName = req.supplier?.name ?? linkedItem?.supplier?.name ?? req.freeSupplier ?? null;
    if (!matchesSupplierFilter(sId)) continue;

    const name = linkedItem?.name ?? req.freeName ?? "Unnamed request";
    const partNumber = linkedItem?.partNumber ?? req.freePartNumber ?? null;
    const current = linkedItem?.quantity ?? 0;
    const desired = linkedItem?.desiredQuantity ?? 0;
    const needed = req.quantity || 0;
    if (needed <= 0) continue;

    const unitCostNum =
      req.unitCost != null
        ? Number(req.unitCost)
        : linkedItem
          ? Number(linkedItem.purchaseCost ?? 0)
          : 0;
    const lineTotalNum = unitCostNum * needed;

    const g = groupFor(sId, sName);
    g.lines.push({
      id: req.id,
      name,
      partNumber,
      current,
      desired,
      needed,
      unitCost: money(unitCostNum),
      lineTotal: money(lineTotalNum),
      origin: "request",
      unit: linkedItem?.unit ?? null,
    });
    g.subtotal += lineTotalNum;
  }

  // --- Pass 2: items needing reorder that aren't already on the buy list. ---
  for (const it of items) {
    if (itemIdsFromRequests.has(it.id)) continue;

    const needed = reorderQty(it.quantity, it.desiredQuantity);
    if (needed <= 0) continue;
    if (onlyBelowMin && !(it.minQuantity > 0 && it.quantity < it.minQuantity)) continue;
    if (!matchesSupplierFilter(it.supplierId)) continue;

    const unitCostNum = Number(it.purchaseCost ?? 0);
    const lineTotalNum = unitCostNum * needed;

    const g = groupFor(it.supplierId, it.supplier?.name ?? null);
    g.lines.push({
      id: it.id,
      name: it.name,
      partNumber: it.partNumber,
      current: it.quantity,
      desired: it.desiredQuantity,
      needed,
      unitCost: money(unitCostNum),
      lineTotal: money(lineTotalNum),
      origin: "item",
      unit: it.unit,
    });
    g.subtotal += lineTotalNum;
  }

  // Drop empty groups, sort supplier groups (No supplier last, then by name),
  // and sort lines within a group by name.
  const suppliers: ReportSupplierGroup[] = [...groups.values()]
    .filter((g) => g.lines.length > 0)
    .sort((a, b) => {
      if (a.supplierId === NO_SUPPLIER_ID) return 1;
      if (b.supplierId === NO_SUPPLIER_ID) return -1;
      return a.supplier.localeCompare(b.supplier);
    })
    .map((g) => ({
      supplierId: g.supplierId,
      supplier: g.supplier,
      lines: [...g.lines].sort((a, b) => a.name.localeCompare(b.name)),
      subtotal: money(g.subtotal),
    }));

  const grandTotalNum = suppliers.reduce((sum, g) => sum + Number(g.subtotal), 0);
  const lineCount = suppliers.reduce((sum, g) => sum + g.lines.length, 0);

  return {
    generatedAt: new Date().toISOString(),
    suppliers,
    grandTotal: money(grandTotalNum),
    currency,
    totals: {
      supplierCount: suppliers.length,
      lineCount,
    },
  };
}

/**
 * The list of suppliers (id + name) that currently have something to reorder.
 * Used to populate the supplier filter dropdown without a second query path.
 */
export async function reorderSupplierOptions(): Promise<{ id: string; name: string }[]> {
  const report = await computeReorderReport();
  return report.suppliers.map((g) => ({ id: g.supplierId, name: g.supplier }));
}
