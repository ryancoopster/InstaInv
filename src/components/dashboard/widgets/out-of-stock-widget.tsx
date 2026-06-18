"use client";

import * as React from "react";
import Link from "next/link";
import { PackageX } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { WidgetHeader } from "@/components/dashboard/widgets/widget-header";
import type { SimpleItemRow } from "@/components/dashboard/data";

export function OutOfStockWidget({ rows, count }: { rows: SimpleItemRow[]; count: number }) {
  return (
    <div className="flex h-full flex-col">
      <WidgetHeader
        icon={PackageX}
        iconClassName="text-destructive"
        title="Out of stock"
        description={count > 0 ? `${count} item${count === 1 ? "" : "s"} at zero on hand` : undefined}
        link={count > rows.length ? { href: "/items", label: "All items" } : undefined}
      />
      <div className="p-5 pt-3">
        {rows.length === 0 ? (
          <EmptyState
            icon={PackageX}
            title="Nothing out of stock"
            description="No items are at zero quantity."
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
                  {r.location || r.category || "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
