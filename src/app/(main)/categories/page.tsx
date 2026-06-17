import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { CategoriesManager } from "@/components/items/categories-manager";
import type { CategoryRow } from "@/components/items/types";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  try {
    await requirePermission("categories.view");
  } catch {
    redirect("/");
  }

  const categories = (await prisma.category.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      parent: { select: { id: true, name: true } },
      _count: { select: { items: true, customFields: true } },
    },
  })) as unknown as CategoryRow[];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Categories"
        description="Organize items into categories and define the custom fields each category adds to its items."
      />
      <CategoriesManager initial={categories} />
    </div>
  );
}
