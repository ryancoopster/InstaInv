// Starter content for newly-created templates, per target. Gives the user a
// sensible non-blank canvas to start from (mirrors the seeded templates' style).

import type { LabelContent, LabelTargetKind } from "./types";

export function defaultContentFor(target: LabelTargetKind, widthMm: number, heightMm: number): LabelContent {
  const base: LabelContent = { dpi: 300, background: "#ffffff", elements: [] };

  switch (target) {
    case "ITEM":
      base.elements = [
        { id: "qr", type: "qrcode", x: 2, y: 2, w: Math.min(heightMm - 8, 24), h: Math.min(heightMm - 8, 24), binding: "item.url" },
        { id: "name", type: "text", x: Math.min(heightMm - 4, 28), y: 3, w: widthMm - Math.min(heightMm - 4, 28) - 2, h: 9, text: "{{item.name}}", fontSize: 11, bold: true, align: "left" },
        { id: "pn", type: "text", x: Math.min(heightMm - 4, 28), y: 13, w: widthMm - Math.min(heightMm - 4, 28) - 2, h: 6, text: "{{item.partNumber}}", fontSize: 9, align: "left" },
        { id: "cat", type: "text", x: Math.min(heightMm - 4, 28), y: 20, w: widthMm - Math.min(heightMm - 4, 28) - 2, h: 5, text: "{{item.category.name}}", fontSize: 7, align: "left", color: "#475569" },
      ];
      break;
    case "DRAWER":
      base.elements = [
        { id: "label", type: "text", x: 2, y: 2, w: 20, h: heightMm - 4, text: "{{drawer.label}}", fontSize: 24, bold: true, align: "center" },
        { id: "name", type: "text", x: 24, y: 4, w: widthMm - 26, h: 9, text: "{{drawer.name}}", fontSize: 12, bold: true },
        { id: "summary", type: "text", x: 24, y: 14, w: widthMm - 26, h: heightMm - 16, text: "{{drawer.summary}}", fontSize: 7 },
      ];
      break;
    case "BOX":
      base.elements = [
        { id: "name", type: "text", x: 3, y: 3, w: widthMm - 6, h: 10, text: "{{box.name}}", fontSize: 16, bold: true },
        { id: "loc", type: "text", x: 3, y: 14, w: widthMm - 6, h: 6, text: "{{box.location}}", fontSize: 9, color: "#475569" },
        { id: "summary", type: "text", x: 3, y: 21, w: widthMm - 6, h: heightMm - 23, text: "{{box.summary}}", fontSize: 7 },
      ];
      break;
    case "BIN":
      base.elements = [
        { id: "name", type: "text", x: 3, y: 3, w: widthMm - 6, h: heightMm - 12, text: "{{bin.name}}", fontSize: 12, bold: true, align: "center" },
        { id: "drawer", type: "text", x: 3, y: heightMm - 8, w: widthMm - 6, h: 5, text: "{{drawer.label}}", fontSize: 7, align: "center", color: "#475569" },
      ];
      break;
    case "GENERIC":
    default:
      base.elements = [
        { id: "t1", type: "text", x: 3, y: 3, w: widthMm - 6, h: 8, text: "Label", fontSize: 14, bold: true },
      ];
      break;
  }
  return base;
}
