import { redirect } from "next/navigation";
import { getSessionUser, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { EmptyState } from "@/components/ui/empty-state";
import { Lock } from "lucide-react";
import { LabelsGrid } from "@/components/labels/LabelsGrid";
import type { LabelTemplateDTO } from "@/components/labels/types";

export const dynamic = "force-dynamic";

export default async function LabelsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  if (!(await can("labels.view"))) {
    return (
      <EmptyState
        icon={Lock}
        title="No access to labels"
        description="You don't have permission to view label templates. Ask an administrator for the 'View labels' permission."
      />
    );
  }

  const rows = await prisma.labelTemplate.findMany({
    orderBy: [{ target: "asc" }, { sortOrder: "asc" }],
  });

  // Float fields serialize fine; content is JSON. Cast to the client DTO shape.
  const templates: LabelTemplateDTO[] = rows.map((t) => ({
    id: t.id,
    name: t.name,
    target: t.target,
    widthMm: t.widthMm,
    heightMm: t.heightMm,
    tapeName: t.tapeName,
    orientation: t.orientation,
    content: (t.content as any) ?? {},
    isDefault: t.isDefault,
    sortOrder: t.sortOrder,
  }));

  return <LabelsGrid initialTemplates={templates} />;
}
