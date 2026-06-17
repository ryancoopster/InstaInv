import type { Prisma, OrderRequest } from "@prisma/client";

// Shared Prisma include + serialization for OrderRequest rows. Kept in one place
// so the API routes and the server pages produce identical JSON shapes. Prisma
// Decimal columns (unitCost) are serialized to plain strings per the contract.

export const requestInclude = {
  item: {
    select: {
      id: true,
      name: true,
      partNumber: true,
      purchaseCost: true,
      quantity: true,
      desiredQuantity: true,
      unit: true,
      supplier: { select: { id: true, name: true } },
    },
  },
  supplier: { select: { id: true, name: true } },
  requestedBy: { select: { id: true, name: true, email: true } },
  approvedBy: { select: { id: true, name: true, email: true } },
} satisfies Prisma.OrderRequestInclude;

export type OrderRequestWithRelations = Prisma.OrderRequestGetPayload<{
  include: typeof requestInclude;
}>;

// JSON-safe shape sent to the client (Decimals -> string, Dates -> ISO string).
export interface SerializedRequest {
  id: string;
  itemId: string | null;
  item: {
    id: string;
    name: string;
    partNumber: string | null;
    purchaseCost: string;
    quantity: number;
    desiredQuantity: number;
    unit: string | null;
    supplier: { id: string; name: string } | null;
  } | null;
  freeName: string | null;
  freePartNumber: string | null;
  freeSupplier: string | null;
  supplierId: string | null;
  supplier: { id: string; name: string } | null;
  quantity: number;
  unitCost: string | null;
  note: string | null;
  status: OrderRequest["status"];
  source: OrderRequest["source"];
  requestedById: string | null;
  requestedBy: { id: string; name: string; email: string } | null;
  approvedById: string | null;
  approvedBy: { id: string; name: string; email: string } | null;
  approvedAt: string | null;
  orderedAt: string | null;
  receivedAt: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  // Convenience display name (item name or free-text name).
  displayName: string;
  // Effective supplier name for grouping (explicit -> item -> free-text).
  supplierName: string;
}

export function serializeRequest(r: OrderRequestWithRelations): SerializedRequest {
  const supplierName =
    r.supplier?.name ?? r.item?.supplier?.name ?? r.freeSupplier ?? "Unassigned";
  return {
    id: r.id,
    itemId: r.itemId,
    item: r.item
      ? {
          id: r.item.id,
          name: r.item.name,
          partNumber: r.item.partNumber,
          purchaseCost: r.item.purchaseCost.toString(),
          quantity: r.item.quantity,
          desiredQuantity: r.item.desiredQuantity,
          unit: r.item.unit,
          supplier: r.item.supplier,
        }
      : null,
    freeName: r.freeName,
    freePartNumber: r.freePartNumber,
    freeSupplier: r.freeSupplier,
    supplierId: r.supplierId,
    supplier: r.supplier,
    quantity: r.quantity,
    unitCost: r.unitCost != null ? r.unitCost.toString() : null,
    note: r.note,
    status: r.status,
    source: r.source,
    requestedById: r.requestedById,
    requestedBy: r.requestedBy,
    approvedById: r.approvedById,
    approvedBy: r.approvedBy,
    approvedAt: r.approvedAt ? r.approvedAt.toISOString() : null,
    orderedAt: r.orderedAt ? r.orderedAt.toISOString() : null,
    receivedAt: r.receivedAt ? r.receivedAt.toISOString() : null,
    sortOrder: r.sortOrder,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    displayName: r.item?.name ?? r.freeName ?? "(unnamed)",
    supplierName,
  };
}
