"use client";

import * as React from "react";
import Link from "next/link";
import {
  Package,
  Boxes,
  Truck,
  FolderTree,
  AlertTriangle,
  ClipboardList,
  DollarSign,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { KpiDatum } from "@/components/dashboard/data";

const ICONS: Record<string, LucideIcon> = {
  Package,
  Boxes,
  Truck,
  FolderTree,
  AlertTriangle,
  ClipboardList,
  DollarSign,
};

// KPI stat cards. `editing` disables the inner links so dragging the widget
// doesn't accidentally navigate.
export function KpisWidget({ data, editing }: { data: KpiDatum[]; editing: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 xl:grid-cols-4">
      {data.map((s) => {
        const Icon = ICONS[s.icon] ?? Package;
        const body = (
          <div
            className={cn(
              "flex h-full items-start justify-between gap-3 rounded-lg border border-border bg-card p-4 transition-colors",
              s.href && !editing && "hover:border-primary/40",
            )}
          >
            <div className="min-w-0 space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {s.label}
              </p>
              <p className="truncate text-2xl font-semibold tracking-tight">{s.value}</p>
              {s.sub && <p className="truncate text-xs text-muted-foreground">{s.sub}</p>}
            </div>
            <span
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                s.accent,
              )}
            >
              <Icon className="h-5 w-5" />
            </span>
          </div>
        );
        return s.href && !editing ? (
          <Link
            key={s.key}
            href={s.href}
            className="block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {body}
          </Link>
        ) : (
          <div key={s.key}>{body}</div>
        );
      })}
    </div>
  );
}
