import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { BoxDetailClient } from "@/components/boxes/BoxDetailClient";
import type { BoxDetail, DrawerSummary, DrawerItem } from "@/components/boxes/types";

export const dynamic = "force-dynamic";

export default async function BoxFrontPage({ params }: { params: { boxId: string } }) {
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

  const [box, allBoxes] = await Promise.all([
    prisma.box.findUnique({
      where: { id: params.boxId },
      include: {
        drawers: {
          orderBy: { sortOrder: "asc" },
          include: {
            bins: { select: { id: true } },
            items: { select: { id: true, quantity: true } },
          },
        },
      },
    }),
    prisma.box.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true } }),
  ]);

  if (!box) notFound();

  // Items assigned to this box but not placed in any drawer.
  const looseRaw = await prisma.item.findMany({
    where: { boxId: params.boxId, drawerId: null },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      partNumber: true,
      quantity: true,
      unit: true,
      imageUrl: true,
      category: { select: { name: true, color: true } },
    },
  });
  const looseItems: DrawerItem[] = looseRaw.map((it) => ({
    id: it.id,
    name: it.name,
    partNumber: it.partNumber,
    quantity: it.quantity,
    unit: it.unit,
    imageUrl: it.imageUrl,
    binId: null,
    sortOrder: 0,
    category: it.category ? { name: it.category.name, color: it.category.color } : null,
  }));

  const drawers: DrawerSummary[] = box.drawers.map((d) => ({
    id: d.id,
    boxId: d.boxId,
    name: d.name,
    label: d.label,
    gridRow: d.gridRow,
    gridCol: d.gridCol,
    rowSpan: d.rowSpan,
    colSpan: d.colSpan,
    binRows: d.binRows,
    binCols: d.binCols,
    color: d.color,
    summary: d.summary,
    sortOrder: d.sortOrder,
    binCount: d.bins.length,
    itemCount: d.items.length,
    pieceCount: d.items.reduce((s, it) => s + it.quantity, 0),
  }));

  const detail: BoxDetail = {
    id: box.id,
    name: box.name,
    description: box.description,
    location: box.location,
    imageUrl: box.imageUrl,
    gridRows: box.gridRows,
    gridCols: box.gridCols,
    summary: box.summary,
    sortOrder: box.sortOrder,
    drawers,
  };

  const idx = allBoxes.findIndex((b) => b.id === box.id);
  const prevBoxId = idx > 0 ? allBoxes[idx - 1].id : null;
  const nextBoxId = idx >= 0 && idx < allBoxes.length - 1 ? allBoxes[idx + 1].id : null;

  return (
    <BoxDetailClient
      box={detail}
      looseItems={looseItems}
      canManage={canManage}
      canReorganize={hasPermission(user, "boxes.reorganize")}
      prevBoxId={prevBoxId}
      nextBoxId={nextBoxId}
    />
  );
}
