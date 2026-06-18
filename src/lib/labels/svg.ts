// Pure SVG string generator for a label. Used as a lightweight, dependency-free
// representation (e.g. for a server-side static preview, or reuse by the client).
//
// NOTE: QR/barcode are emitted as labelled placeholders here because encoding
// them requires the qrcode/bwip-js packages (used by the real PDF renderer and
// by the live client canvas, which generates data-URL images on the fly). This
// keeps svg.ts free of any heavy/Node-only dependency.
//
// Text uses the shared line-layout from layout.ts so multi-line / wrapped /
// auto-fit / vertical-aligned text matches the editor and the printed PDF
// (E-4). Because svg.ts has no real font metrics it measures widths with a
// cheap average-glyph estimate, so wrapping is approximate but multi-line.

import type { EntityData } from "./bindings";
import { resolveBindingString } from "./bindings";
import type { LabelContent, LabelElement } from "./types";
import { mmToPx } from "./types";
import { layoutText } from "./layout";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fontFamily(el: LabelElement): string {
  return el.fontFamily || "Helvetica, Arial, sans-serif";
}

/**
 * Render the content to an SVG string sized in pixels at the given dpi.
 * `bind` controls whether {{tokens}} are resolved (preview) or shown raw (design).
 */
export function renderLabelSvg(
  content: LabelContent,
  widthMm: number,
  heightMm: number,
  entity: EntityData | null,
): string {
  const dpi = content.dpi || 300;
  const W = mmToPx(widthMm, dpi);
  const H = mmToPx(heightMm, dpi);
  const px = (mm: number) => mmToPx(mm, dpi);

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
  );
  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="${esc(content.background || "#ffffff")}"/>`);

  for (const el of content.elements) {
    if (el.hidden) continue;
    parts.push(renderElementSvg(el, entity, px));
  }

  parts.push("</svg>");
  return parts.join("");
}

function renderElementSvg(
  el: LabelElement,
  entity: EntityData | null,
  px: (mm: number) => number,
): string {
  const x = px(el.x);
  const y = px(el.y);
  const w = px(el.w);
  const h = px(el.h);
  const cx = x + w / 2;
  const cy = y + h / 2;
  const transform = el.rotation ? ` transform="rotate(${el.rotation} ${cx} ${cy})"` : "";

  switch (el.type) {
    case "rect":
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${esc(el.fill || "none")}" stroke="${esc(el.stroke || "#000000")}" stroke-width="${px(el.strokeWidth ?? 0.3)}"${transform}/>`;
    case "ellipse":
      return `<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}" fill="${esc(el.fill || "none")}" stroke="${esc(el.stroke || "#000000")}" stroke-width="${px(el.strokeWidth ?? 0.3)}"${transform}/>`;
    case "line":
      return `<line x1="${x}" y1="${y + h / 2}" x2="${x + w}" y2="${y + h / 2}" stroke="${esc(el.stroke || "#000000")}" stroke-width="${px(el.strokeWidth ?? 0.3)}"${transform}/>`;
    case "arrow": {
      const stroke = esc(el.stroke || "#000000");
      const sw = px(el.strokeWidth ?? 0.4);
      const cyv = y + h / 2;
      const head = Math.min(w * 0.4, Math.max(6, sw * 4));
      return (
        `<g${transform}>` +
        `<line x1="${x}" y1="${cyv}" x2="${x + w - head}" y2="${cyv}" stroke="${stroke}" stroke-width="${sw}"/>` +
        `<polygon points="${x + w},${cyv} ${x + w - head},${cyv - head * 0.6} ${x + w - head},${cyv + head * 0.6}" fill="${stroke}"/>` +
        `</g>`
      );
    }
    case "image":
      return el.src
        ? `<image x="${x}" y="${y}" width="${w}" height="${h}" href="${esc(el.src)}" preserveAspectRatio="xMidYMid meet"${transform}/>`
        : placeholder(x, y, w, h, "Image", transform);
    case "qrcode": {
      const v = entity ? resolveBindingString(`{{${el.binding || ""}}}`, entity) : el.binding || "";
      return placeholder(x, y, w, h, `QR: ${v || el.binding || "—"}`, transform);
    }
    case "barcode": {
      const v = entity ? resolveBindingString(`{{${el.binding || ""}}}`, entity) : el.binding || "";
      return placeholder(x, y, w, h, `▮▮▮ ${v || el.binding || "—"}`, transform);
    }
    case "text":
    default: {
      const raw = el.text || "";
      const text = entity ? resolveBindingString(raw, entity) : raw;
      const fs = px((el.fontSize ?? 10) / 2.83465); // fontSize is in pt; pt->mm then mm->px
      const align = el.align || "left";
      const anchor = align === "center" ? "middle" : align === "right" ? "end" : "start";
      const tx = align === "center" ? cx : align === "right" ? x + w : x;
      const weight = el.bold ? "bold" : "normal";
      const style = el.italic ? "italic" : "normal";
      const color = el.color || "#000000";
      const deco = el.underline ? ` text-decoration="underline"` : "";
      const lsPx = el.letterSpacing ? px(el.letterSpacing / 2.83465) : 0;
      const ls = lsPx ? ` letter-spacing="${lsPx}"` : "";
      const lhMult = el.lineHeight ?? 1.18;

      // E-4: wrap / auto-fit / valign via the shared layout. svg.ts lacks real
      // font metrics, so estimate glyph width as ~0.55em (matches a typical
      // sans-serif average) — approximate but enough for multi-line layout.
      const measure = (s: string, size: number) => s.length * size * 0.55 + Math.max(0, s.length - 1) * lsPx;
      const lt = layoutText(
        text,
        {
          width: w,
          height: h,
          fontSize: fs,
          wrap: el.wrap !== false,
          autoFit: !!el.autoFit,
          lineHeightMult: lhMult,
          valign: el.valign,
          minFontSize: 4,
          shrinkStep: 1,
        },
        measure,
      );
      const lines = lt.lines.length ? lt.lines : [""];
      const tspans = lines
        .map((ln, i) => `<tspan x="${tx}" y="${y + lt.top + lt.fontSize * 0.82 + i * lt.lineHeight}">${esc(ln || " ")}</tspan>`)
        .join("");
      return `<text font-family="${esc(fontFamily(el))}" font-size="${lt.fontSize}" font-weight="${weight}" font-style="${style}" fill="${esc(color)}" text-anchor="${anchor}"${deco}${ls}${transform}>${tspans}</text>`;
    }
  }
}

function placeholder(x: number, y: number, w: number, h: number, label: string, transform: string): string {
  return (
    `<g${transform}>` +
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#f1f5f9" stroke="#94a3b8" stroke-width="1" stroke-dasharray="4 3"/>` +
    `<text x="${x + w / 2}" y="${y + h / 2}" font-family="Helvetica, Arial, sans-serif" font-size="${Math.max(8, Math.min(w, h) / 6)}" fill="#475569" text-anchor="middle" dominant-baseline="middle">${esc(label)}</text>` +
    `</g>`
  );
}
