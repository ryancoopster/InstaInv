import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface MobileListRowProps {
  href: string;
  title: string;
  subtitle?: string | null;
  // Small piece of metadata shown on the right (e.g. an item count badge).
  trailing?: React.ReactNode;
  // Optional leading visual (image / colored swatch / icon).
  leading?: React.ReactNode;
  className?: string;
}

// A big, one-handed-friendly tappable row used by the box and drawer choosers.
export function MobileListRow({
  href,
  title,
  subtitle,
  trailing,
  leading,
  className,
}: MobileListRowProps) {
  return (
    <Link
      href={href}
      className={cn(
        "flex min-h-[4.5rem] items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-sm transition-colors active:bg-accent",
        className,
      )}
    >
      {leading && <div className="shrink-0">{leading}</div>}
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-semibold leading-tight text-foreground">
          {title}
        </p>
        {subtitle && (
          <p className="mt-0.5 line-clamp-2 text-sm leading-snug text-muted-foreground">
            {subtitle}
          </p>
        )}
      </div>
      {trailing && <div className="shrink-0">{trailing}</div>}
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
    </Link>
  );
}
