import { ScanLine, ShieldAlert } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ScanWorkspace } from "@/components/scan/ScanWorkspace";
import type { BoxOption } from "@/components/scan/types";

export const dynamic = "force-dynamic";

export default async function ScanPage() {
  const user = await getSessionUser();

  if (!hasPermission(user, "ocr.scan")) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Scan & checklists"
          description="Printable count sheets and OCR-assisted inventory taking."
        />
        <EmptyState
          icon={ShieldAlert}
          title="No access"
          description="You need the “Scan checklists” permission to print and read count sheets. Ask an administrator to grant it."
        />
      </div>
    );
  }

  // Load boxes with their item counts (items reachable via a drawer in the box).
  const boxes = await prisma.box.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      location: true,
      drawers: { select: { _count: { select: { items: true } } } },
    },
  });

  const boxOptions: BoxOption[] = boxes.map((b) => ({
    id: b.id,
    name: b.name,
    location: b.location,
    itemCount: b.drawers.reduce((sum, d) => sum + d._count.items, 0),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Scan & checklists"
        description="Print a count sheet for a box, walk the box writing counts by hand, then scan the sheet back to update quantities."
      />

      {boxOptions.length === 0 ? (
        <EmptyState
          icon={ScanLine}
          title="No boxes yet"
          description="Create a box with drawers and assign items to it, then return here to print and scan count sheets."
        />
      ) : (
        <ScanWorkspace boxes={boxOptions} />
      )}
    </div>
  );
}
