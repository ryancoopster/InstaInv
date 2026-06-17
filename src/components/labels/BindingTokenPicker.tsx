"use client";

import * as React from "react";
import { Braces } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { bindingPalette } from "@/lib/labels/bindings";
import type { LabelTargetKind } from "@/lib/labels/types";

// Inserts a {{binding}} token. Used both for text content (insert into string)
// and for barcode/qr binding fields (replace the whole binding path).
export function BindingTokenPicker({
  target,
  customKeys = [],
  mode = "insert",
  onPick,
  label = "Insert binding",
}: {
  target: LabelTargetKind;
  customKeys?: string[];
  mode?: "insert" | "replace";
  onPick: (token: string) => void;
  label?: string;
}) {
  const groups = React.useMemo(() => bindingPalette(target, customKeys), [target, customKeys]);

  function tokenValue(raw: string): string {
    if (mode === "replace") {
      // strip braces -> bare path (for binding fields)
      return raw.replace(/^\{\{\s*/, "").replace(/\s*\}\}$/, "");
    }
    return raw;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Button type="button" variant="outline" size="sm" className="gap-1.5">
          <Braces className="h-3.5 w-3.5" />
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-64 overflow-y-auto">
        {groups.map((g, gi) => (
          <React.Fragment key={g.group}>
            {gi > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel>{g.group}</DropdownMenuLabel>
            {g.tokens.map((t) => (
              <DropdownMenuItem key={t.token} onClick={() => onPick(tokenValue(t.token))}>
                <span className="flex flex-col">
                  <span className="text-sm">{t.label}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">{t.token}</span>
                </span>
              </DropdownMenuItem>
            ))}
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
