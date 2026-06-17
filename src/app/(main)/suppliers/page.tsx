import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { SuppliersManager } from "@/components/items/suppliers-manager";
import type { SupplierRow } from "@/components/items/types";

export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  try {
    await requirePermission("suppliers.view");
  } catch {
    redirect("/");
  }

  const suppliers = (await prisma.supplier.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { items: true } } },
  })) as unknown as SupplierRow[];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Suppliers"
        description="Vendors you buy from. Link items to suppliers for ordering and reorder reports."
      />
      <SuppliersManager initial={suppliers} />
    </div>
  );
}
