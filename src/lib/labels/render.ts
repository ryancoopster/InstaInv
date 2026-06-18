import "server-only";
import { promises as fs } from "fs";
import path from "path";
import QRCode from "qrcode";
// Use the Node build explicitly so the right toBuffer() typings resolve under
// moduleResolution:"bundler" (the "." export resolves the browser build first).
import bwipjs from "bwip-js/node";
import { PDFDocument, StandardFonts, rgb, degrees, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import type { EntityData } from "./bindings";
import { resolveBindingString } from "./bindings";
import { mmToPt, normalizeContent, isMatrixSymbology, type LabelContent, type LabelElement } from "./types";
import { layoutText, UNDERLINE_OFFSET_RATIO, UNDERLINE_THICKNESS_RATIO } from "./layout";

// E-1: pdf-lib's rotate option pivots about the draw anchor (bottom-left corner
// for rect/image, the per-line baseline-left for text), but the canvas + SVG
// preview pivot about the element CENTER. Pre-rotating the anchor about the
// center by the same angle turns the corner-pivot into a center-pivot so the
// printed output matches WYSIWYG. (a is the PDF angle in radians = -rotation.)
function rotateAbout(
  ax: number,
  ay: number,
  cx: number,
  cy: number,
  rotationDeg: number,
): { x: number; y: number } {
  if (!rotationDeg) return { x: ax, y: ay };
  const a = (-rotationDeg * Math.PI) / 180; // matches degrees(-el.rotation)
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const dx = ax - cx;
  const dy = ay - cy;
  return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
}

// Server-side label renderer: template content + resolved entity -> PDF Buffer,
// drawn at the exact tape size (mm -> points). Re-exports the binding helper so
// callers can `import { resolveBindings } from "@/lib/labels/render"`.

export { resolveBindingString as resolveBindings } from "./bindings";
export { renderLabelSvg } from "./svg";

export interface RenderInput {
  content: LabelContent | unknown; // raw JSON from LabelTemplate.content is fine
  widthMm: number;
  heightMm: number;
  entity: EntityData | null;
}

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------

function hexToRgb(hex: string | undefined, fallback: [number, number, number] = [0, 0, 0]) {
  if (!hex) return rgb(...fallback);
  const m = hex.replace("#", "").trim();
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  const int = parseInt(full, 16);
  if (Number.isNaN(int) || full.length !== 6) return rgb(...fallback);
  return rgb(((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255);
}

// ---------------------------------------------------------------------------
// Font selection (Standard 14 fonts cover our needs without bundling files).
// ---------------------------------------------------------------------------

interface FontSet {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  boldItalic: PDFFont;
}

function pickFont(fonts: FontSet, bold?: boolean, italic?: boolean): PDFFont {
  if (bold && italic) return fonts.boldItalic;
  if (bold) return fonts.bold;
  if (italic) return fonts.italic;
  return fonts.regular;
}

// ---------------------------------------------------------------------------
// Image generation for QR / barcode / uploads
// ---------------------------------------------------------------------------

async function qrPng(value: string, sizePx: number): Promise<Buffer> {
  return QRCode.toBuffer(value || " ", {
    type: "png",
    margin: 0,
    width: Math.max(64, Math.round(sizePx)),
    errorCorrectionLevel: "M",
  });
}

async function barcodePng(value: string, symbology: string, widthPx: number, heightPx: number): Promise<Buffer> {
  // bwip-js draws at scale*module-width; we let it size naturally then pdf-lib
  // scales into the target box, so the geometry stays crisp.
  const bcid = (symbology || "code128").toLowerCase();
  return bwipjs.toBuffer({
    bcid: bcid === "code128" || bcid === "" ? "code128" : bcid,
    text: value || "0",
    scale: 3,
    height: Math.max(6, Math.round((heightPx / Math.max(widthPx, 1)) * 24)),
    includetext: false,
    paddingwidth: 0,
    paddingheight: 0,
  });
}

async function loadUploadBytes(src: string): Promise<Buffer | null> {
  try {
    // SSRF hardening: do NOT fetch arbitrary remote URLs server-side. Label
    // images are local uploads or inline data: URIs; remote http(s) sources are
    // intentionally unsupported so a crafted src can't probe internal hosts.
    if (src.startsWith("data:")) {
      const base64 = src.split(",")[1] || "";
      return Buffer.from(base64, "base64");
    }
    if (/^https?:\/\//i.test(src)) {
      return null;
    }
    // local public path only, e.g. /uploads/foo.png — confined to public/uploads.
    const cleaned = src.replace(/^\//, "");
    const uploadsRoot = path.resolve("public", "uploads");
    const resolved = path.resolve("public", cleaned);
    if (resolved !== uploadsRoot && !resolved.startsWith(uploadsRoot + path.sep)) {
      return null;
    }
    return await fs.readFile(resolved);
  } catch {
    return null;
  }
}

async function embedImageAuto(pdf: PDFDocument, bytes: Buffer, hintSrc?: string): Promise<PDFImage | null> {
  const isPng = bytes.length > 4 && bytes[0] === 0x89 && bytes[1] === 0x50;
  const looksJpg = (hintSrc && /\.jpe?g$/i.test(hintSrc)) || (bytes.length > 2 && bytes[0] === 0xff && bytes[1] === 0xd8);
  try {
    if (isPng) return await pdf.embedPng(bytes);
    if (looksJpg) return await pdf.embedJpg(bytes);
    // fall back: try png then jpg
    try {
      return await pdf.embedPng(bytes);
    } catch {
      return await pdf.embedJpg(bytes);
    }
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Element drawing. Coordinates: content is top-left mm; PDF origin is bottom-left.
// We convert mm->pt and flip Y.
// ---------------------------------------------------------------------------

function drawWrappedText(
  page: PDFPage,
  el: LabelElement,
  value: string,
  font: PDFFont,
  pageHeightPt: number,
) {
  const xPt = mmToPt(el.x);
  const yTopPt = mmToPt(el.y);
  const wPt = mmToPt(el.w);
  const hPt = mmToPt(el.h);
  const color = hexToRgb(el.color, [0, 0, 0]);
  const align = el.align || "left";
  const wrap = el.wrap !== false;
  const lhMult = el.lineHeight ?? 1.18;
  // E-12: tracking is authored in pt; honour it in the PDF the same way the
  // canvas/SVG do (today it was silently dropped from the print output).
  const letterSpacingPt = el.letterSpacing ?? 0;

  // E-4: share wrap / auto-fit / valign with the canvas + SVG via layout.ts.
  // safeWidth measures plain glyph runs; layoutText adds the tracking gaps.
  const lt = layoutText(
    value,
    {
      width: wPt,
      height: hPt,
      fontSize: el.fontSize ?? 10,
      wrap,
      autoFit: !!el.autoFit,
      lineHeightMult: lhMult,
      valign: el.valign,
      letterSpacing: letterSpacingPt,
    },
    (text, size) => safeWidth(font, text, size),
  );
  const sizePt = lt.fontSize;
  const lines = lt.lines;
  const lineHeight = lt.lineHeight;

  // Block center in PDF (bottom-left origin) coordinates, for the rotation pivot.
  const cx = xPt + wPt / 2;
  const cy = pageHeightPt - (yTopPt + hPt / 2);

  // Width of a line including inter-glyph tracking, for alignment + underline.
  const trackedWidth = (line: string) =>
    safeWidth(font, line, sizePt) + Math.max(0, line.length - 1) * letterSpacingPt;

  let cursorTop = yTopPt + lt.top;
  for (const line of lines) {
    const baseline = cursorTop + sizePt;
    const lineWidth = trackedWidth(line);
    let drawX = xPt;
    if (align === "center") drawX = xPt + (wPt - lineWidth) / 2;
    else if (align === "right") drawX = xPt + (wPt - lineWidth);
    const drawY = pageHeightPt - baseline;
    // E-1: rotate this line's baseline-left anchor about the block center so the
    // whole multi-line block rotates as a unit (pdf-lib otherwise pivots each
    // line about its own baseline-left).
    const anchor = rotateAbout(drawX, drawY, cx, cy, el.rotation ?? 0);

    if (letterSpacingPt) {
      // pdf-lib's drawText has no character-spacing option, so place glyphs one
      // at a time, advancing the (unrotated) x by glyph width + tracking, then
      // rotate each glyph anchor about the block center.
      let glyphX = drawX;
      for (const ch of line) {
        const gAnchor = rotateAbout(glyphX, drawY, cx, cy, el.rotation ?? 0);
        page.drawText(ch, {
          x: gAnchor.x,
          y: gAnchor.y,
          size: sizePt,
          font,
          color,
          rotate: el.rotation ? degrees(-el.rotation) : undefined,
        });
        glyphX += safeWidth(font, ch, sizePt) + letterSpacingPt;
      }
    } else {
      page.drawText(line, {
        x: anchor.x,
        y: anchor.y,
        size: sizePt,
        font,
        color,
        rotate: el.rotation ? degrees(-el.rotation) : undefined,
      });
    }

    if (el.underline && line) {
      // E-12: underline geometry from shared ratios so it matches the preview.
      const uyTop = drawY - sizePt * UNDERLINE_OFFSET_RATIO;
      const uStart = rotateAbout(drawX, uyTop, cx, cy, el.rotation ?? 0);
      const uEnd = rotateAbout(drawX + lineWidth, uyTop, cx, cy, el.rotation ?? 0);
      page.drawLine({
        start: { x: uStart.x, y: uStart.y },
        end: { x: uEnd.x, y: uEnd.y },
        thickness: Math.max(0.5, sizePt * UNDERLINE_THICKNESS_RATIO),
        color,
      });
    }
    cursorTop += lineHeight;
  }
}

function safeWidth(font: PDFFont, text: string, size: number): number {
  try {
    return font.widthOfTextAtSize(text, size);
  } catch {
    // WinAnsi can't encode some glyphs (e.g. Ω); approximate.
    return text.length * size * 0.5;
  }
}

function sanitizeForWinAnsi(text: string): string {
  // Standard fonts use WinAnsi; replace characters it can't encode so drawText
  // never throws. Keep it simple and readable.
  return text.replace(/[^\x00-\xFF]/g, (ch) => {
    const map: Record<string, string> = { "Ω": "ohm", "µ": "u", "±": "+/-", "×": "x", "–": "-", "—": "-", "’": "'", "“": '"', "”": '"' };
    return map[ch] ?? "?";
  });
}

// ---------------------------------------------------------------------------
// Main entry: render to a PDF Buffer.
// ---------------------------------------------------------------------------

export async function renderLabelPdf(input: RenderInput): Promise<Buffer> {
  const content = normalizeContent(input.content);
  const widthPt = mmToPt(input.widthMm);
  const heightPt = mmToPt(input.heightMm);

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([widthPt, heightPt]);

  const fonts: FontSet = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
    boldItalic: await pdf.embedFont(StandardFonts.HelveticaBoldOblique),
  };

  // Background
  page.drawRectangle({
    x: 0,
    y: 0,
    width: widthPt,
    height: heightPt,
    color: hexToRgb(content.background || "#ffffff", [1, 1, 1]),
  });

  const entity = input.entity;

  for (const el of content.elements) {
    if (el.hidden) continue;
    const xPt = mmToPt(el.x);
    const yTopPt = mmToPt(el.y);
    const wPt = mmToPt(el.w);
    const hPt = mmToPt(el.h);
    const yBottom = heightPt - (yTopPt + hPt); // pdf-lib y of the box's bottom edge
    // E-1: element center in PDF coords — the pivot the canvas/SVG rotate about.
    const cxPt = xPt + wPt / 2;
    const cyPt = heightPt - (yTopPt + hPt / 2);

    switch (el.type) {
      case "rect": {
        // E-1: pdf-lib pivots a rectangle about its bottom-left anchor; pre-rotate
        // that anchor about the center so it matches the center-pivot preview.
        const a = rotateAbout(xPt, yBottom, cxPt, cyPt, el.rotation ?? 0);
        page.drawRectangle({
          x: a.x,
          y: a.y,
          width: wPt,
          height: hPt,
          color: el.fill && el.fill !== "none" ? hexToRgb(el.fill) : undefined,
          borderColor: hexToRgb(el.stroke || "#000000"),
          borderWidth: mmToPt(el.strokeWidth ?? 0.3),
          rotate: el.rotation ? degrees(-el.rotation) : undefined,
        });
        break;
      }
      case "ellipse": {
        page.drawEllipse({
          x: xPt + wPt / 2,
          y: heightPt - (yTopPt + hPt / 2),
          xScale: wPt / 2,
          yScale: hPt / 2,
          color: el.fill && el.fill !== "none" ? hexToRgb(el.fill) : undefined,
          borderColor: hexToRgb(el.stroke || "#000000"),
          borderWidth: mmToPt(el.strokeWidth ?? 0.3),
          rotate: el.rotation ? degrees(-el.rotation) : undefined,
        });
        break;
      }
      case "line": {
        const midY = heightPt - (yTopPt + hPt / 2);
        page.drawLine({
          start: { x: xPt, y: midY },
          end: { x: xPt + wPt, y: midY },
          thickness: mmToPt(el.strokeWidth ?? 0.3),
          color: hexToRgb(el.stroke || "#000000"),
        });
        break;
      }
      case "arrow": {
        const sw = mmToPt(el.strokeWidth ?? 0.4);
        const color = hexToRgb(el.stroke || "#000000");
        const ay = heightPt - (yTopPt + hPt / 2);
        const head = Math.min(wPt * 0.4, Math.max(mmToPt(2), sw * 4));
        const tipX = xPt + wPt;
        page.drawLine({ start: { x: xPt, y: ay }, end: { x: tipX - head, y: ay }, thickness: sw, color });
        page.drawLine({ start: { x: tipX, y: ay }, end: { x: tipX - head, y: ay + head * 0.6 }, thickness: sw, color });
        page.drawLine({ start: { x: tipX, y: ay }, end: { x: tipX - head, y: ay - head * 0.6 }, thickness: sw, color });
        break;
      }
      case "qrcode": {
        const value = entity ? resolveBindingString(`{{${el.binding || ""}}}`, entity) : el.binding || "";
        const side = Math.min(wPt, hPt);
        const png = await qrPng(value, side * 4);
        const img = await pdf.embedPng(png);
        // E-1: rotate the square's bottom-left anchor about the element center.
        const qrBottom = heightPt - (yTopPt + side);
        const a = rotateAbout(xPt, qrBottom, cxPt, cyPt, el.rotation ?? 0);
        page.drawImage(img, {
          x: a.x,
          y: a.y,
          width: side,
          height: side,
          rotate: el.rotation ? degrees(-el.rotation) : undefined,
        });
        break;
      }
      case "barcode": {
        const value = entity ? resolveBindingString(`{{${el.binding || ""}}}`, entity) : el.binding || "";
        // E-5: 2D matrix codes must stay square; only 1D linear codes fill the
        // full (possibly wide) box. Otherwise a stretched matrix may not scan.
        const matrix = isMatrixSymbology(el.symbology);
        const bw = matrix ? Math.min(wPt, hPt) : wPt;
        const bh = matrix ? Math.min(wPt, hPt) : hPt;
        const drawBottom = matrix ? heightPt - (yTopPt + bh) : yBottom;
        try {
          const png = await barcodePng(value, el.symbology || "code128", bw, bh);
          const img = await pdf.embedPng(png);
          // E-1: pre-rotate the bottom-left anchor about the element center.
          const a = rotateAbout(xPt, drawBottom, cxPt, cyPt, el.rotation ?? 0);
          page.drawImage(img, {
            x: a.x,
            y: a.y,
            width: bw,
            height: bh,
            rotate: el.rotation ? degrees(-el.rotation) : undefined,
          });
        } catch {
          // Unencodable value — draw a thin box so the slot is visible.
          const a = rotateAbout(xPt, drawBottom, cxPt, cyPt, el.rotation ?? 0);
          page.drawRectangle({ x: a.x, y: a.y, width: bw, height: bh, borderColor: hexToRgb("#000000"), borderWidth: 0.5, rotate: el.rotation ? degrees(-el.rotation) : undefined });
        }
        break;
      }
      case "image": {
        if (!el.src) break;
        const bytes = await loadUploadBytes(el.src);
        if (!bytes) break;
        const img = await embedImageAuto(pdf, bytes, el.src);
        if (!img) break;
        // E-1: pre-rotate the bottom-left anchor about the element center.
        const a = rotateAbout(xPt, yBottom, cxPt, cyPt, el.rotation ?? 0);
        page.drawImage(img, {
          x: a.x,
          y: a.y,
          width: wPt,
          height: hPt,
          rotate: el.rotation ? degrees(-el.rotation) : undefined,
        });
        break;
      }
      case "text":
      default: {
        const raw = el.text || "";
        const resolved = entity ? resolveBindingString(raw, entity) : raw;
        const value = sanitizeForWinAnsi(resolved);
        const font = pickFont(fonts, el.bold, el.italic);
        drawWrappedText(page, el, value, font, heightPt);
        break;
      }
    }
  }

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

// ---------------------------------------------------------------------------
// Merge several single-label PDFs into one multi-page document (one label per
// page). Used by the bulk "Print labels" flow so a whole selection comes back
// as a single printable PDF.
// ---------------------------------------------------------------------------

export async function mergeLabelPdfs(buffers: Buffer[]): Promise<Buffer> {
  if (buffers.length === 0) throw new Error("No labels to merge");
  if (buffers.length === 1) return buffers[0];

  const out = await PDFDocument.create();
  for (const buf of buffers) {
    const src = await PDFDocument.load(buf);
    const pages = await out.copyPages(src, src.getPageIndices());
    for (const page of pages) out.addPage(page);
  }
  return Buffer.from(await out.save());
}
