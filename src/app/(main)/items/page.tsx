import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { ItemTable } from "@/components/items/item-table";
import { itemInclude, serializeItem } from "@/app/api/items/_serialize";
import type { ItemRow, BoxOption } from "@/components/items/types";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: {
    q?: string;
    categoryId?: string;
    supplierId?: string;
  };
}

export default async function ItemsPage({ searchParams }: PageProps) {
  try {
    await requirePermission("items.view");
  } catch {
    redirect("/");
  }

  const q = searchParams.q?.trim() || "";
  const categoryId = searchParams.categoryId || "";
  const supplierId = searchParams.supplierId || "";

  const where: Prisma.ItemWhereInput = {
    ...(categoryId ? { categoryId } : {}),
    ...(supplierId ? { supplierId } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { partNumber: { contains: q, mode: "insensitive" } },
            { sku: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [itemsRaw, categories, suppliers, boxesRaw] = await Promise.all([
    prisma.item.findMany({ where, include: itemInclude, orderBy: { sortOrder: "asc" } }),
    prisma.category.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    prisma.supplier.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    prisma.box.findMany({
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        drawers: {
          orderBy: { sortOrder: "asc" },
          select: {
            id: true,
            name: true,
            label: true,
            bins: { orderBy: { sortOrder: "asc" }, select: { id: true, name: true } },
          },
        },
      },
    }),
  ]);

  const items = itemsRaw.map(serializeItem) as unknown as ItemRow[];
  const boxes = boxesRaw as BoxOption[];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Items"
        description="Your full inventory. Search, filter, reorder and adjust on-hand quantities."
      />
      <ItemTable
        initialItems={items}
        categories={categories}
        suppliers={suppliers}
        boxes={boxes}
        initialQuery={q}
        initialCategoryId={categoryId}
        initialSupplierId={supplierId}
      />
    </div>
  );
}
