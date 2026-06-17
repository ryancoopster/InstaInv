import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { DrawerDetailClient } from "@/components/boxes/DrawerDetailClient";
import type { BinDetail, DrawerDetail, DrawerItem } from "@/components/boxes/types";

export const dynamic = "force-dynamic";

export default async function DrawerPage({
  params,
}: {
  params: { boxId: string; drawerId: string };
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasPermission(user, "boxes.view")) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        You do not have permission to view drawers.
      </div>
    );
  }

  const canManage = hasPermission(user, "boxes.manage");
  const canReorganize = hasPermission(user, "boxes.reorganize");
  const canAdjust = hasPermission(user, "items.adjustQuantity");

  const [drawer, siblings] = await Promise.all([
    prisma.drawer.findUnique({
      where: { id: params.drawerId },
      include: {
        box: { select: { id: true, name: true, gridRows: true, gridCols: true } },
        bins: { orderBy: { sortOrder: "asc" } },
        items: {
          orderBy: { sortOrder: "asc" },
          select: {
            id: true,
            name: true,
            quantity: true,
            unit: true,
            imageUrl: true,
            binId: true,
            sortOrder: true,
            category: { select: { name: true, color: true } },
          },
        },
      },
    }),
    prisma.drawer.findMany({
      where: { boxId: params.boxId },
      orderBy: { sortOrder: "asc" },
      select: { id: true },
    }),
  ]);

  if (!drawer || drawer.boxId !== params.boxId) notFound();

  const bins: BinDetail[] = drawer.bins.map((b) => ({
    id: b.id,
    drawerId: b.drawerId,
    name: b.name,
    gridRow: b.gridRow,
    gridCol: b.gridCol,
    rowSpan: b.rowSpan,
    colSpan: b.colSpan,
    color: b.color,
    sortOrder: b.sortOrder,
  }));

  const items: DrawerItem[] = drawer.items.map((it) => ({
    id: it.id,
    name: it.name,
    quantity: it.quantity,
    unit: it.unit,
    imageUrl: it.imageUrl,
    binId: it.binId,
    sortOrder: it.sortOrder,
    category: it.category ? { name: it.category.name, color: it.category.color } : null,
  }));

  const detail: DrawerDetail = {
    id: drawer.id,
    boxId: drawer.boxId,
    box: drawer.box,
    name: drawer.name,
    label: drawer.label,
    gridRow: drawer.gridRow,
    gridCol: drawer.gridCol,
    rowSpan: drawer.rowSpan,
    colSpan: drawer.colSpan,
    binRows: drawer.binRows,
    binCols: drawer.binCols,
    color: drawer.color,
    summary: drawer.summary,
    sortOrder: drawer.sortOrder,
    bins,
    items,
  };

  const idx = siblings.findIndex((d) => d.id === drawer.id);
  const prevDrawerId = idx > 0 ? siblings[idx - 1].id : null;
  const nextDrawerId = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1].id : null;

  return (
    <DrawerDetailClient
      drawer={detail}
      canManage={canManage}
      canReorganize={canReorganize}
      canAdjust={canAdjust}
      prevDrawerId={prevDrawerId}
      nextDrawerId={nextDrawerId}
    />
  );
}
