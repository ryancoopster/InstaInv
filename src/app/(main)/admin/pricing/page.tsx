import { can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPricingSettings } from "@/lib/pricing";
import { PageHeader } from "@/components/ui/page-header";
import { Forbidden } from "@/components/shell/forbidden";
import {
  PricingAdmin,
  type PricingItemRow,
  type PricingSupplierRow,
} from "@/components/pricing/pricing-admin";
import type { PriceFetchStatus } from "@/lib/pricing/types";

export const dynamic = "force-dynamic";

export default async function PricingAdminPage() {
  if (!(await can("pricing.manage"))) {
    return <Forbidden permission="pricing.manage" />;
  }

  const [settings, suppliersRaw, itemsRaw] = await Promise.all([
    getPricingSettings(),
    prisma.supplier.findMany({
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        priceFetchEnabled: true,
        priceParser: true,
        website: true,
      },
    }),
    prisma.item.findMany({
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        partNumber: true,
        supplierLink: true,
        purchaseCost: true,
        lastFetchedPrice: true,
        priceUpdatedAt: true,
        priceFetchStatus: true,
        supplier: { select: { name: true } },
      },
    }),
  ]);

  const suppliers: PricingSupplierRow[] = suppliersRaw;

  const items: PricingItemRow[] = itemsRaw.map((it) => ({
    id: it.id,
    name: it.name,
    partNumber: it.partNumber,
    supplier: it.supplier ? { name: it.supplier.name } : null,
    supplierLink: it.supplierLink,
    purchaseCost: it.purchaseCost.toString(),
    lastFetchedPrice: it.lastFetchedPrice ? it.lastFetchedPrice.toString() : null,
    priceUpdatedAt: it.priceUpdatedAt ? it.priceUpdatedAt.toISOString() : null,
    priceFetchStatus: (it.priceFetchStatus as PriceFetchStatus | null) ?? null,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pricing"
        description="Fetch live prices from supplier links and configure automatic refreshing."
      />
      <PricingAdmin settings={settings} items={items} suppliers={suppliers} />
    </div>
  );
}
