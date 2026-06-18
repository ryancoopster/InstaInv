"use client";

import * as React from "react";
import { Type, QrCode, Barcode, Image as ImageIcon, Square, Minus, Circle, MoveRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ElementType } from "@/lib/labels/types";

const ITEMS: { type: ElementType; label: string; icon: React.ElementType }[] = [
  { type: "text", label: "Text", icon: Type },
  { type: "qrcode", label: "QR code", icon: QrCode },
  { type: "barcode", label: "Barcode", icon: Barcode },
  { type: "image", label: "Image", icon: ImageIcon },
  { type: "rect", label: "Rectangle", icon: Square },
  { type: "ellipse", label: "Ellipse", icon: Circle },
  { type: "line", label: "Line", icon: Minus },
  { type: "arrow", label: "Arrow", icon: MoveRight },
];

export function ElementPalette({ onAdd, disabled }: { onAdd: (type: ElementType) => void; disabled?: boolean }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {ITEMS.map((it) => {
        const Icon = it.icon;
        return (
          <Button
            key={it.type}
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => onAdd(it.type)}
            className="flex h-auto flex-col gap-1 py-2"
            title={`Add ${it.label}`}
          >
            <Icon className="h-4 w-4" />
            <span className="text-[11px]">{it.label}</span>
          </Button>
        );
      })}
    </div>
  );
}
