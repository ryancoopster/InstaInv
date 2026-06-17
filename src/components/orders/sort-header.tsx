"use client";

import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export interface SortState {
  key: string | null;
  dir: "asc" | "desc";
}

// A clickable column header that cycles: none -> asc -> desc -> none.
// Clicking a column sort *overrides* the manual drag order at view time.
export function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string;
  sortKey: string;
  sort: SortState;
  onSort: (next: SortState) => void;
  className?: string;
}) {
  const active = sort.key === sortKey;
  const Icon = !active ? ChevronsUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;

  function cycle() {
    if (!active) return onSort({ key: sortKey, dir: "asc" });
    if (sort.dir === "asc") return onSort({ key: sortKey, dir: "desc" });
    return onSort({ key: null, dir: "asc" }); // back to manual order
  }

  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={cycle}
        className={cn(
          "inline-flex items-center gap-1 uppercase tracking-wide transition-colors hover:text-foreground",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
        <Icon className="h-3.5 w-3.5" />
      </button>
    </TableHead>
  );
}
