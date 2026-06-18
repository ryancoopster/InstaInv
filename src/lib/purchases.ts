import "server-only";
import { Prisma } from "@prisma/client";

// Builds the Purchase row data for an OrderRequest that has just been marked
// RECEIVED ("bought"). Snapshots item/supplier names + cost so the log survives
// later renames/deletes. unitCost precedence mirrors compute-buy-list:
// request.unitCost -> item.purchaseCost -> 0.

export interface RequestForPurchase {
  id: string;
  itemId: string | null;
  supplierId: string | null;
  quantity: number;
  unitCost: Prisma.Decimal | null;
  freeName: string | null;
  freePartNumber: string | null;
  freeSupplier: string | null;
  item?: { name: string; partNumber: string | null; purchaseCost: Prisma.Decimal | null } | null;
  supplier?: { name: string } | null;
}

export function buildPurchaseData(
  req: RequestForPurchase,
  userId: string,
  appliedToStock: boolean,
): Prisma.PurchaseUncheckedCreateInput {
  const unit = req.unitCost ?? req.item?.purchaseCost ?? new Prisma.Decimal(0);
  const total = new Prisma.Decimal(unit).mul(req.quantity);
  return {
    itemId: req.itemId ?? null,
    orderRequestId: req.id,
    supplierId: req.supplierId ?? null,
    itemName: req.item?.name ?? req.freeName ?? null,
    partNumber: req.item?.partNumber ?? req.freePartNumber ?? null,
    supplierName: req.supplier?.name ?? req.freeSupplier ?? null,
    quantity: req.quantity,
    unitCost: unit,
    totalCost: total,
    appliedToStock,
    purchasedById: userId,
  };
}

// Serialize a Purchase (Decimal -> string, Date -> ISO) for the JSON boundary.
export function serializePurchase(p: {
  id: string;
  itemId: string | null;
  orderRequestId: string | null;
  supplierId: string | null;
  itemName: string | null;
  partNumber: string | null;
  supplierName: string | null;
  quantity: number;
  unitCost: Prisma.Decimal;
  totalCost: Prisma.Decimal;
  appliedToStock: boolean;
  note: string | null;
  purchasedById: string | null;
  purchasedAt: Date;
  purchasedBy?: { name: string } | null;
}) {
  return {
    id: p.id,
    itemId: p.itemId,
    orderRequestId: p.orderRequestId,
    supplierId: p.supplierId,
    itemName: p.itemName,
    partNumber: p.partNumber,
    supplierName: p.supplierName,
    quantity: p.quantity,
    unitCost: p.unitCost.toString(),
    totalCost: p.totalCost.toString(),
    appliedToStock: p.appliedToStock,
    note: p.note,
    purchasedByName: p.purchasedBy?.name ?? null,
    purchasedAt: p.purchasedAt.toISOString(),
  };
}

export type PurchaseDTO = ReturnType<typeof serializePurchase>;
