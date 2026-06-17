"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Boxes, Search, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";

interface Tab {
  href: string;
  label: string;
  icon: React.ElementType;
  // Active when the pathname starts with one of these prefixes.
  match: (pathname: string) => boolean;
}

const TABS: Tab[] = [
  {
    href: "/m",
    label: "Boxes",
    icon: Boxes,
    match: (p) => p === "/m" || p.startsWith("/m/boxes") || p.startsWith("/m/drawers"),
  },
  {
    href: "/m/search",
    label: "Search",
    icon: Search,
    match: (p) => p.startsWith("/m/search"),
  },
  {
    href: "/",
    label: "Desktop",
    icon: Monitor,
    match: () => false,
  },
];

export function MobileTabBar() {
  const pathname = usePathname() || "/m";

  return (
    <nav
      aria-label="Primary"
      className="sticky bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex w-full max-w-md items-stretch">
        {TABS.map((tab) => {
          const active = tab.match(pathname);
          const Icon = tab.icon;
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors",
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon className={cn("h-6 w-6", active && "stroke-[2.5]")} />
                <span>{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
