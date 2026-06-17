import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ShieldAlert } from "lucide-react";
import { computeBuyList } from "@/components/orders/compute-buy-list";
import { OrdersView } from "@/components/orders/orders-view";
import type { StockRow } from "@/components/orders/stock-levels-editor";
import type { ItemOption, SupplierOption } from "@/components/orders/request-form";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  // The buy list requires orders.viewAll (same gate as the nav link).
  if (!hasPermission(user, "orders.viewAll")) {
    return (
      <div className="space-y-6">
        <PageHeader title="Buy List" />
        <EmptyState
          icon={ShieldAlert}
          title="No access"
          description="You don't have permission to view the consolidated buy list."
        />
      </div>
    );
  }

  // Compute the buy list server-side for the initial render.
  const buyList = await computeBuyList();

  // Stock-levels editor rows + form pick-lists (loaded together).
  const [items, suppliers] = await Promise.all([
    prisma.item.findMany({
      select: {
        id: true,
        name: true,
        partNumber: true,
        supplierId: true,
        purchaseCost: true,
        quantity: true,
        desiredQuantity: true,
        sortOrder: true,
        supplier: { select: { name: true } },
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.supplier.findMany({
      select: { id: true, name: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);

  const stockRows: StockRow[] = items.map((i) => ({
    id: i.id,
    name: i.name,
    partNumber: i.partNumber,
    supplier: i.supplier?.name ?? "Unassigned",
    quantity: i.quantity,
    desiredQuantity: i.desiredQuantity,
    sortOrder: i.sortOrder,
  }));

  const itemOptions: ItemOption[] = items.map((i) => ({
    id: i.id,
    name: i.name,
    partNumber: i.partNumber,
    supplierId: i.supplierId,
    purchaseCost: i.purchaseCost.toString(),
  }));
  const supplierOptions: SupplierOption[] = suppliers;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Buy List"
        description="Everything that needs purchasing, consolidated by supplier."
      />
      <OrdersView
        buyList={buyList}
        stockRows={stockRows}
        items={itemOptions}
        suppliers={supplierOptions}
      />
    </div>
  );
}
