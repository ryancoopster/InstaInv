"use client";

import * as React from "react";
import Link from "next/link";
import {
  ClipboardCheck,
  ShoppingCart,
  Tag,
  ScanLine,
  Package,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { WidgetHeader } from "@/components/dashboard/widgets/widget-header";
import type { PermissionKey } from "@/lib/permissions";

interface QuickAction {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  accent: string;
  permission?: PermissionKey;
}

const ACTIONS: QuickAction[] = [
  {
    href: "/scan",
    label: "Take inventory",
    description: "Count stock from a checklist.",
    icon: ClipboardCheck,
    accent: "text-primary bg-primary/10",
    permission: "items.adjustQuantity",
  },
  {
    href: "/orders",
    label: "Buy list",
    description: "Review what needs ordering.",
    icon: ShoppingCart,
    accent: "text-success bg-success/10",
    permission: "orders.viewAll",
  },
  {
    href: "/labels",
    label: "Labels",
    description: "Design & print labels.",
    icon: Tag,
    accent: "text-warning bg-warning/10",
    permission: "labels.view",
  },
  {
    href: "/scan",
    label: "Scan checklist",
    description: "OCR a printed count sheet.",
    icon: ScanLine,
    accent: "text-primary bg-primary/10",
    permission: "ocr.scan",
  },
  {
    href: "/items",
    label: "Items",
    description: "Browse the full inventory.",
    icon: Package,
    accent: "text-foreground bg-muted",
    permission: "items.view",
  },
];

export function QuickActionsWidget({
  can,
  editing,
}: {
  can: (key: PermissionKey) => boolean;
  editing: boolean;
}) {
  const actions = ACTIONS.filter((a) => !a.permission || can(a.permission));

  return (
    <div className="flex h-full flex-col">
      <WidgetHeader icon={Zap} title="Quick actions" description="Jump straight to common tasks." />
      <div className="flex-1 p-5 pt-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {actions.map((a) => {
            const Icon = a.icon;
            const body = (
              <div
                className={cn(
                  "flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors",
                  !editing && "hover:border-primary/40 hover:bg-accent/40",
                )}
              >
                <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", a.accent)}>
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{a.label}</p>
                  <p className="truncate text-xs text-muted-foreground">{a.description}</p>
                </div>
              </div>
            );
            return editing ? (
              <div key={`${a.href}-${a.label}`}>{body}</div>
            ) : (
              <Link
                key={`${a.href}-${a.label}`}
                href={a.href}
                className="block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                {body}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
