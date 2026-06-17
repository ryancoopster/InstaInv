import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { BoxGrid } from "@/components/boxes/BoxGrid";
import type { BoxListItem } from "@/components/boxes/types";

export const dynamic = "force-dynamic";

export default async function BoxesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasPermission(user, "boxes.view")) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        You do not have permission to view boxes.
      </div>
    );
  }

  const canManage = hasPermission(user, "boxes.manage");

  const boxes = await prisma.box.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      drawers: {
        select: { id: true, items: { select: { id: true, quantity: true } } },
      },
    },
  });

  const initialBoxes: BoxListItem[] = boxes.map((b) => {
    let itemCount = 0;
    let pieceCount = 0;
    for (const d of b.drawers) {
      itemCount += d.items.length;
      for (const it of d.items) pieceCount += it.quantity;
    }
    return {
      id: b.id,
      name: b.name,
      description: b.description,
      location: b.location,
      imageUrl: b.imageUrl,
      gridRows: b.gridRows,
      gridCols: b.gridCols,
      summary: b.summary,
      sortOrder: b.sortOrder,
      drawerCount: b.drawers.length,
      itemCount,
      pieceCount,
    };
  });

  return <BoxGrid initialBoxes={initialBoxes} canManage={canManage} />;
}
