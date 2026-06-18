import Image from "next/image";
import { redirect } from "next/navigation";
import { Boxes, Package } from "lucide-react";
import { getSessionUser, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { MobileListRow } from "@/components/mobile/mobile-list-row";

export const dynamic = "force-dynamic";

export default async function MobileHomePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!(await can("boxes.view"))) {
    return (
      <EmptyState
        icon={Boxes}
        title="No access to boxes"
        description="Your account can't view boxes. Ask an admin for the Boxes permission."
      />
    );
  }

  const boxes = await prisma.box.findMany({
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      location: true,
      summary: true,
      imageUrl: true,
      _count: { select: { drawers: true } },
    },
  });

  // Item totals per box for a quick at-a-glance count. DM-2: group by the
  // denormalized boxId so items that live in a box but not yet in a drawer are
  // included (grouping by drawerId alone undercounts them, mismatching the box page).
  const itemCounts = await prisma.item.groupBy({
    by: ["boxId"],
    _count: { _all: true },
    where: { boxId: { not: null } },
  });
  const boxItemCount = new Map<string, number>();
  for (const row of itemCounts) {
    if (!row.boxId) continue;
    boxItemCount.set(row.boxId, row._count._all);
  }

  return (
    <div className="space-y-4">
      <header className="px-1">
        <h1 className="text-xl font-bold tracking-tight">Take inventory</h1>
        <p className="text-sm text-muted-foreground">Choose a box to begin.</p>
      </header>

      {boxes.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="No boxes yet"
          description="Boxes you create on the desktop will show up here."
        />
      ) : (
        <ul className="space-y-2.5">
          {boxes.map((box) => {
            const items = boxItemCount.get(box.id) ?? 0;
            return (
              <li key={box.id}>
                <MobileListRow
                  href={`/m/boxes/${box.id}`}
                  title={box.name}
                  subtitle={box.summary || box.location || undefined}
                  leading={
                    box.imageUrl ? (
                      <div className="relative h-12 w-12 overflow-hidden rounded-lg border border-border bg-muted">
                        <Image
                          src={box.imageUrl}
                          alt=""
                          fill
                          sizes="48px"
                          className="object-cover"
                        />
                      </div>
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <Boxes className="h-6 w-6" />
                      </div>
                    )
                  }
                  trailing={
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant="secondary">
                        {box._count.drawers} drawer
                        {box._count.drawers === 1 ? "" : "s"}
                      </Badge>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Package className="h-3.5 w-3.5" />
                        {items}
                      </span>
                    </div>
                  }
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
