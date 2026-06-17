"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// Shared header for widget bodies: icon + title + optional description, with an
// optional "see more" link on the right. Kept lightweight so it works inside
// the WidgetFrame card without doubling up on padding.
export function WidgetHeader({
  icon: Icon,
  title,
  description,
  iconClassName,
  link,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  iconClassName?: string;
  link?: { href: string; label: string };
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-2 px-5 pt-5", className)}>
      <div className="min-w-0 space-y-1">
        <h3 className="flex items-center gap-2 font-semibold leading-none tracking-tight">
          {Icon && <Icon className={cn("h-4 w-4 text-muted-foreground", iconClassName)} />}
          {title}
        </h3>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {link && (
        <Button asChild variant="ghost" size="sm" className="-mr-2 shrink-0">
          <Link href={link.href}>
            {link.label}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      )}
    </div>
  );
}
