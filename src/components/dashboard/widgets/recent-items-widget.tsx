"use client";

import * as React from "react";
import Link from "next/link";
import { PackagePlus } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { WidgetHeader } from "@/components/dashboard/widgets/widget-header";
import type { SimpleItemRow } from "@/components/dashboard/data";

export function RecentItemsWidget({ rows }: { rows: SimpleItemRow[] }) {
  return (
    <div className="flex h-full flex-col">
      <WidgetHeader
        icon={PackagePlus}
        title="Recently added"
        description="The newest items in your inventory."
        link={{ href: "/items", label: "All items" }}
      />
      <div className="p-5 pt-3">
        {rows.length === 0 ? (
          <EmptyState
            icon={PackagePlus}
            title="No items yet"
            description="Items you add will show up here."
            className="border-0 bg-transparent py-8"
          />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                <Link
                  href={`/items?q=${encodeURIComponent(r.name)}`}
                  className="truncate font-medium hover:underline"
                >
                  {r.name}
                </Link>
                <span className="shrink-0 truncate text-xs text-muted-foreground">
                  {r.category || r.location || "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
