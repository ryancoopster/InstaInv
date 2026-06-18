import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { PrintLabelsClient } from "@/components/print-labels/print-labels-client";

export const dynamic = "force-dynamic";

export default async function PrintLabelsPage() {
  try {
    await requirePermission("labels.print");
  } catch {
    redirect("/");
  }

  const [categories, suppliers, boxes] = await Promise.all([
    prisma.category.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    prisma.supplier.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    prisma.box.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Print Labels"
        description="Filter and bulk-select items, then print or download their labels as a single PDF — one label per item."
      />
      <PrintLabelsClient categories={categories} suppliers={suppliers} boxes={boxes} />
    </div>
  );
}
