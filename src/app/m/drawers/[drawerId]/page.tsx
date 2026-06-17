import { redirect, notFound } from "next/navigation";
import type { Metadata } from "next";
import { Package } from "lucide-react";
import { getSessionUser, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { EmptyState } from "@/components/ui/empty-state";
import { InventoryStepper } from "@/components/mobile/inventory-stepper";
import type { MobileItem } from "@/components/mobile/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { drawerId: string };
}): Promise<Metadata> {
  const drawer = await prisma.drawer.findUnique({
    where: { id: params.drawerId },
    select: { name: true },
  });
  return { title: drawer?.name ?? "Drawer" };
}

export default async function MobileDrawerPage({
  params,
  searchParams,
}: {
  params: { drawerId: string };
  searchParams: { item?: string };
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!(await can("boxes.view"))) {
    return (
      <EmptyState
        icon={Package}
        title="No access"
        description="Your account can't view this drawer."
      />
    );
  }

  const drawer = await prisma.drawer.findUnique({
    where: { id: params.drawerId },
    select: {
      id: true,
      name: true,
      box: { select: { name: true } },
      items: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          name: true,
          description: true,
          partNumber: true,
          sku: true,
          unit: true,
          quantity: true,
          desiredQuantity: true,
          minQuantity: true,
          imageUrl: true,
          bin: { select: { name: true } },
        },
      },
    },
  });

  if (!drawer) notFound();

  // Serialize to the client-safe shape (no Decimal fields here, but keep the
  // boundary explicit so adding cost later stays a string conversion).
  const items: MobileItem[] = drawer.items.map((i) => ({
    id: i.id,
    name: i.name,
    description: i.description,
    partNumber: i.partNumber,
    sku: i.sku,
    unit: i.unit,
    quantity: i.quantity,
    desiredQuantity: i.desiredQuantity,
    minQuantity: i.minQuantity,
    imageUrl: i.imageUrl,
    binName: i.bin?.name ?? null,
  }));

  return (
    <InventoryStepper
      drawerName={drawer.name}
      boxName={drawer.box?.name ?? null}
      items={items}
      initialItemId={searchParams.item}
    />
  );
}
