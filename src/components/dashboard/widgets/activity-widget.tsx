"use client";

import * as React from "react";
import { formatDistanceToNow } from "date-fns";
import {
  Activity,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  ShoppingCart,
  Package,
  DollarSign,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { WidgetHeader } from "@/components/dashboard/widgets/widget-header";
import type { ActivityRow } from "@/components/dashboard/data";

// Map an action string ("item.update", "order.approve", ...) to an icon + accent.
function actionVisual(action: string): { icon: LucideIcon; accent: string } {
  const verb = action.split(".")[1] ?? action;
  if (/create|add/.test(verb)) return { icon: Plus, accent: "text-success bg-success/10" };
  if (/update|edit|adjust|reorder/.test(verb)) return { icon: Pencil, accent: "text-primary bg-primary/10" };
  if (/delete|remove|reject/.test(verb)) return { icon: Trash2, accent: "text-destructive bg-destructive/10" };
  if (/approve|receive|complete/.test(verb)) return { icon: CheckCircle2, accent: "text-success bg-success/10" };
  if (/order/.test(action)) return { icon: ShoppingCart, accent: "text-primary bg-primary/10" };
  if (/price/.test(action)) return { icon: DollarSign, accent: "text-warning bg-warning/10" };
  if (/item/.test(action)) return { icon: Package, accent: "text-foreground bg-muted" };
  return { icon: Activity, accent: "text-foreground bg-muted" };
}

function humanizeAction(action: string): string {
  return action
    .replace(/[._]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function ActivityWidget({ rows }: { rows: ActivityRow[] }) {
  return (
    <div className="flex h-full flex-col">
      <WidgetHeader icon={Activity} title="Recent activity" description="The latest changes across the app." />
      <div className="flex-1 p-5 pt-3">
        {rows.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="No activity yet"
            description="Actions you take across the app will show up here."
            className="border-0 bg-transparent py-8"
          />
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => {
              const { icon: Icon, accent } = actionVisual(r.action);
              return (
                <li key={r.id} className="flex items-start gap-3">
                  <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full", accent)}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{humanizeAction(r.action)}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {r.entity ? `${r.entity}` : "System"}
                      {r.userName ? ` · ${r.userName}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
