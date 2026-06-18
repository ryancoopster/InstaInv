import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { serializePurchase } from "@/lib/purchases";
import { PurchasesTable } from "@/components/purchases/purchases-table";

export const dynamic = "force-dynamic";

export default async function PurchasesPage() {
  try {
    await requirePermission("orders.viewAll");
  } catch {
    redirect("/");
  }

  const rows = await prisma.purchase.findMany({
    orderBy: { purchasedAt: "desc" },
    take: 500,
    include: { purchasedBy: { select: { name: true } } },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Purchases"
        description="Every item marked as bought from the buy list — newest first."
      />
      <PurchasesTable purchases={rows.map(serializePurchase)} />
    </div>
  );
}
