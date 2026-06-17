import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ShieldAlert } from "lucide-react";
import { RequestsView } from "@/components/orders/requests-view";
import { serializeRequest, requestInclude } from "@/components/orders/serialize";
import type { ItemOption, SupplierOption } from "@/components/orders/request-form";

export const dynamic = "force-dynamic";

export default async function RequestsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const canRequest = hasPermission(user, "orders.request");
  const canViewAll = hasPermission(user, "orders.viewAll");

  if (!canRequest && !canViewAll) {
    return (
      <div className="space-y-6">
        <PageHeader title="Order Requests" />
        <EmptyState
          icon={ShieldAlert}
          title="No access"
          description="You don't have permission to view or submit order requests."
        />
      </div>
    );
  }

  // Scope to the current user unless they can view all requests.
  const requests = await prisma.orderRequest.findMany({
    where: canViewAll ? {} : { requestedById: user.id },
    include: requestInclude,
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });

  // Pick-lists for the request form.
  const [items, suppliers] = await Promise.all([
    prisma.item.findMany({
      select: { id: true, name: true, partNumber: true, supplierId: true, purchaseCost: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.supplier.findMany({
      select: { id: true, name: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);

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
        title="Order Requests"
        description={
          canViewAll
            ? "All order requests across the team."
            : "Your order requests and their status."
        }
      />
      <RequestsView
        initial={requests.map(serializeRequest)}
        items={itemOptions}
        suppliers={supplierOptions}
      />
    </div>
  );
}
