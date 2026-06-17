import { redirect, notFound } from "next/navigation";
import { getSessionUser, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { EmptyState } from "@/components/ui/empty-state";
import { Lock } from "lucide-react";
import { LabelDesigner } from "@/components/labels/LabelDesigner";
import type { LabelTemplateDTO } from "@/components/labels/types";

export const dynamic = "force-dynamic";

export default async function LabelDesignerPage({ params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  if (!(await can("labels.view"))) {
    return (
      <EmptyState
        icon={Lock}
        title="No access to labels"
        description="You don't have permission to view label templates."
      />
    );
  }

  const tpl = await prisma.labelTemplate.findUnique({ where: { id: params.id } });
  if (!tpl) notFound();

  // Offer category custom-field keys for the {{item.custom.<key>}} picker.
  let customKeys: string[] = [];
  if (tpl.target === "ITEM") {
    const defs = await prisma.customFieldDef.findMany({ select: { key: true }, distinct: ["key"], take: 100 });
    customKeys = Array.from(new Set(defs.map((d) => d.key)));
  }

  const dto: LabelTemplateDTO = {
    id: tpl.id,
    name: tpl.name,
    target: tpl.target,
    widthMm: tpl.widthMm,
    heightMm: tpl.heightMm,
    tapeName: tpl.tapeName,
    orientation: tpl.orientation,
    content: (tpl.content as any) ?? {},
    isDefault: tpl.isDefault,
    sortOrder: tpl.sortOrder,
  };

  return <LabelDesigner template={dto} customKeys={customKeys} />;
}
