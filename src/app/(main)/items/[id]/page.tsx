import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { ItemForm } from "@/components/items/item-form";
import { itemInclude, serializeItem } from "@/app/api/items/_serialize";
import type { ItemRow, BoxOption, CustomFieldDef } from "@/components/items/types";

export const dynamic = "force-dynamic";

interface PageProps {
  params: { id: string };
}

async function loadOptions() {
  const [categories, suppliers, boxesRaw] = await Promise.all([
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
  return { categories, suppliers, boxes: boxesRaw as BoxOption[] };
}

export default async function ItemDetailPage({ params }: PageProps) {
  const isNew = params.id === "new";

  try {
    await requirePermission(isNew ? "items.create" : "items.view");
  } catch {
    redirect("/");
  }

  const { categories, suppliers, boxes } = await loadOptions();

  if (isNew) {
    return (
      <div className="space-y-6">
        <BackHeader title="New item" />
        <ItemForm categories={categories} suppliers={suppliers} boxes={boxes} />
      </div>
    );
  }

  const itemRaw = await prisma.item.findUnique({
    where: { id: params.id },
    include: itemInclude,
  });
  if (!itemRaw) notFound();

  const item = serializeItem(itemRaw) as unknown as ItemRow;

  // Preload the item's category custom fields so they render without a flash.
  let initialFields: CustomFieldDef[] = [];
  if (item.categoryId) {
    initialFields = (await prisma.customFieldDef.findMany({
      where: { categoryId: item.categoryId },
      orderBy: { sortOrder: "asc" },
    })) as unknown as CustomFieldDef[];
  }

  return (
    <div className="space-y-6">
      <BackHeader title={item.name} description={item.partNumber ? `Part ${item.partNumber}` : undefined} />
      <ItemForm
        item={item}
        categories={categories}
        suppliers={suppliers}
        boxes={boxes}
        initialFields={initialFields}
      />
    </div>
  );
}

function BackHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <PageHeader
      title={title}
      description={description}
      actions={
        <Button asChild variant="outline">
          <Link href="/items">
            <ArrowLeft className="h-4 w-4" />
            Back to items
          </Link>
        </Button>
      }
    />
  );
}
