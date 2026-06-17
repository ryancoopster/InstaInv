"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { ChevronLeft, Boxes } from "lucide-react";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { Button } from "@/components/ui/button";

export function MobileTopBar() {
  const router = useRouter();
  const pathname = usePathname() || "/m";
  // The home of the mobile area is /m — no back affordance there.
  const showBack = pathname !== "/m";

  return (
    <header
      className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-card/95 px-2 backdrop-blur supports-[backdrop-filter]:bg-card/80"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      {showBack ? (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Go back"
          onClick={() => router.back()}
          className="h-10 w-10"
        >
          <ChevronLeft className="h-6 w-6" />
        </Button>
      ) : (
        <div className="w-10" aria-hidden />
      )}

      <Link
        href="/m"
        className="flex flex-1 items-center justify-center gap-2 text-base font-semibold tracking-tight text-foreground"
      >
        <Boxes className="h-5 w-5 text-primary" />
        <span>InstaInv</span>
      </Link>

      <ThemeToggle />
    </header>
  );
}
