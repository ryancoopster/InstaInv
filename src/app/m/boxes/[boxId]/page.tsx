import { redirect, notFound } from "next/navigation";
import type { Metadata } from "next";
import { Layers, Package } from "lucide-react";
import { getSessionUser, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { MobileListRow } from "@/components/mobile/mobile-list-row";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { boxId: string };
}): Promise<Metadata> {
  const box = await prisma.box.findUnique({
    where: { id: params.boxId },
    select: { name: true },
  });
  return { title: box?.name ?? "Box" };
}

export default async function MobileBoxPage({
  params,
}: {
  params: { boxId: string };
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!(await can("boxes.view"))) {
    return (
      <EmptyState
        icon={Layers}
        title="No access to boxes"
        description="Your account can't view boxes."
      />
    );
  }

  const box = await prisma.box.findUnique({
    where: { id: params.boxId },
    select: {
      id: true,
      name: true,
      location: true,
      drawers: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          name: true,
          label: true,
          color: true,
          summary: true,
          _count: { select: { items: true } },
        },
      },
    },
  });

  if (!box) notFound();

  return (
    <div className="space-y-4">
      <header className="px-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Box
        </p>
        <h1 className="text-xl font-bold tracking-tight">{box.name}</h1>
        {box.location && (
          <p className="text-sm text-muted-foreground">{box.location}</p>
        )}
      </header>

      {box.drawers.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No drawers"
          description="This box has no drawers yet."
        />
      ) : (
        <ul className="space-y-2.5">
          {box.drawers.map((drawer) => (
            <li key={drawer.id}>
              <MobileListRow
                href={`/m/drawers/${drawer.id}`}
                title={drawer.name}
                subtitle={drawer.summary || undefined}
                leading={
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-lg text-sm font-bold"
                    style={
                      drawer.color
                        ? { backgroundColor: drawer.color, color: "#fff" }
                        : undefined
                    }
                  >
                    {drawer.color ? (
                      drawer.label || drawer.name.slice(0, 2).toUpperCase()
                    ) : (
                      <div className="flex h-full w-full items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        {drawer.label ? (
                          <span>{drawer.label}</span>
                        ) : (
                          <Layers className="h-6 w-6" />
                        )}
                      </div>
                    )}
                  </div>
                }
                trailing={
                  <span className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
                    <Package className="h-4 w-4" />
                    {drawer._count.items}
                  </span>
                }
              />
            </li>
          ))}
        </ul>
      )}

      <div className="px-1 pt-1">
        <Badge variant="outline">
          {box.drawers.length} drawer{box.drawers.length === 1 ? "" : "s"}
        </Badge>
      </div>
    </div>
  );
}
