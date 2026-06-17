import "server-only";
import { prisma } from "@/lib/prisma";
import { reorderQty } from "@/lib/utils";
import type { BuyList, BuyListGroup, BuyListLine } from "@/components/orders/buy-list-types";

// ---------------------------------------------------------------------------
// Buy-list computation — the heart of the orders module.
//
// The buy list is a single, consolidated "what to purchase" view grouped by
// supplier. It combines THREE independent sources:
//
//   1. STOCK_SHORTFALL  — live items where reorderQty(quantity, desiredQuantity)
//                         > 0, computed straight from the Item table. These are
//                         shortfalls that do NOT yet have an open OrderRequest.
//                         (Once an admin "generates" requests, they become
//                         OrderRequest rows and are then counted via source 2
//                         instead — see `openShortfallItemIds` — so a single
//                         item is never double-counted.)
//
//   2. APPROVED requests — OrderRequest rows with status APPROVED. Things a
//                         human explicitly put on the buy list (a user request
//                         an admin approved, or a generated shortfall request
//                         that was approved).
//
//   3. ADMIN_MANUAL     — OrderRequest rows whose source is ADMIN_MANUAL and are
//                         still open (REQUESTED or APPROVED): admin bulk entries
//                         that should appear regardless of approval state.
//
// Each line carries needed qty, unit cost and line total (needed * unitCost).
// Lines are grouped by their effective supplier; each group has a subtotal and
// the whole list has a grand total. All money is returned as decimal strings.
// ---------------------------------------------------------------------------

// Round currency to 2dp and return a stable string.
function money(n: number): string {
  return (Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2);
}

interface RawLine {
  line: BuyListLine;
  supplierId: string | null;
}

export async function computeBuyList(): Promise<BuyList> {
  // --- Sources 2 & 3: open requests (APPROVED + open ADMIN_MANUAL). ---
  const requests = await prisma.orderRequest.findMany({
    where: {
      OR: [
        { status: "APPROVED" },
        { source: "ADMIN_MANUAL", status: { in: ["REQUESTED", "APPROVED"] } },
      ],
    },
    include: {
      item: {
        select: {
          id: true,
          name: true,
          partNumber: true,
          purchaseCost: true,
          quantity: true,
          desiredQuantity: true,
          supplier: { select: { id: true, name: true } },
        },
      },
      supplier: { select: { id: true, name: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  // Items that already have an OPEN request (REQUESTED/APPROVED/ORDERED) so we
  // don't ALSO surface them as a live shortfall line (avoid double-counting).
  const openItemRows = await prisma.orderRequest.findMany({
    where: {
      itemId: { not: null },
      status: { in: ["REQUESTED", "APPROVED", "ORDERED"] },
    },
    select: { itemId: true },
  });
  const openShortfallItemIds = new Set(
    openItemRows.map((r) => r.itemId).filter(Boolean) as string[],
  );

  const raw: RawLine[] = [];
  let approvedCount = 0;
  let manualCount = 0;

  for (const r of requests) {
    if (r.source === "ADMIN_MANUAL") manualCount++;
    else approvedCount++;

    const name = r.item?.name ?? r.freeName ?? "(unnamed)";
    const partNumber = r.item?.partNumber ?? r.freePartNumber ?? null;
    const sup = r.supplier ?? r.item?.supplier ?? null;
    const supplierName = sup?.name ?? r.freeSupplier ?? "Unassigned";

    // unitCost precedence: explicit request cost -> item purchaseCost -> 0.
    const unit =
      r.unitCost != null ? Number(r.unitCost) : r.item ? Number(r.item.purchaseCost) : 0;
    const needed = r.quantity;

    raw.push({
      supplierId: sup?.id ?? null,
      line: {
        key: `req:${r.id}`,
        requestId: r.id,
        itemId: r.itemId,
        name,
        partNumber,
        supplier: supplierName,
        needed,
        unitCost: money(unit),
        lineTotal: money(unit * needed),
        source: r.source === "ADMIN_MANUAL" ? "ADMIN_MANUAL" : "USER_REQUEST",
      },
    });
  }

  // --- Source 1: live stock shortfalls (items below desired, no open request). ---
  const items = await prisma.item.findMany({
    where: { desiredQuantity: { gt: 0 } },
    select: {
      id: true,
      name: true,
      partNumber: true,
      purchaseCost: true,
      quantity: true,
      desiredQuantity: true,
      supplier: { select: { id: true, name: true } },
    },
  });

  let shortfallCount = 0;
  for (const it of items) {
    const needed = reorderQty(it.quantity, it.desiredQuantity);
    if (needed <= 0) continue;
    if (openShortfallItemIds.has(it.id)) continue; // already represented by a request

    shortfallCount++;
    const unit = Number(it.purchaseCost);
    raw.push({
      supplierId: it.supplier?.id ?? null,
      line: {
        key: `item:${it.id}`,
        requestId: null,
        itemId: it.id,
        name: it.name,
        partNumber: it.partNumber,
        supplier: it.supplier?.name ?? "Unassigned",
        needed,
        unitCost: money(unit),
        lineTotal: money(unit * needed),
        source: "STOCK_SHORTFALL",
        currentQuantity: it.quantity,
        desiredQuantity: it.desiredQuantity,
      },
    });
  }

  // --- Group by supplier. ---
  const groupMap = new Map<string, BuyListGroup>();
  for (const { supplierId, line } of raw) {
    // Group key: supplierId when present, else the (textual) supplier name so
    // free-text / unassigned suppliers still cluster sensibly.
    const groupKey = supplierId ?? `name:${line.supplier}`;
    let group = groupMap.get(groupKey);
    if (!group) {
      group = {
        supplierId,
        supplier: line.supplier,
        lines: [],
        supplierTotal: "0.00",
        approvedRequestIds: [],
      };
      groupMap.set(groupKey, group);
    }
    group.lines.push(line);
    if (line.requestId) group.approvedRequestIds.push(line.requestId);
  }

  // --- Totals. ---
  let grand = 0;
  const groups = [...groupMap.values()].map((g) => {
    const subtotal = g.lines.reduce((s, l) => s + Number(l.lineTotal), 0);
    grand += subtotal;
    return { ...g, supplierTotal: money(subtotal) };
  });

  // Sort: "Unassigned" sinks to the bottom, otherwise alphabetical.
  groups.sort((a, b) => {
    if (a.supplier === "Unassigned") return 1;
    if (b.supplier === "Unassigned") return -1;
    return a.supplier.localeCompare(b.supplier);
  });

  return {
    groups,
    grandTotal: money(grand),
    shortfallCount,
    approvedCount,
    manualCount,
  };
}
