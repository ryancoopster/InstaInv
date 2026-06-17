import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { ReorderReport, ReportSupplierGroup } from "./report";

// ---------------------------------------------------------------------------
// Build a multi-page PDF for a reorder report using pdf-lib.
//
// Lays out an A4 portrait page with a title, generated date, per-supplier
// tables (drawn with drawText + drawLine), supplier subtotals and a grand
// total. Automatically paginates when the cursor runs off the page.
// ---------------------------------------------------------------------------

// A4 portrait, 72dpi points.
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;

// Column layout (x offsets from left margin) and widths.
const COLS = {
  name: { x: 0, w: 200, align: "left" as const },
  part: { x: 200, w: 90, align: "left" as const },
  current: { x: 290, w: 50, align: "right" as const },
  desired: { x: 340, w: 50, align: "right" as const },
  needed: { x: 390, w: 45, align: "right" as const },
  unitCost: { x: 435, w: 60, align: "right" as const },
  lineTotal: { x: 495, w: 64, align: "right" as const },
};

const INK = rgb(0.07, 0.09, 0.15);
const MUTED = rgb(0.42, 0.45, 0.5);
const RULE = rgb(0.82, 0.84, 0.86);
const HEADER_BG = rgb(0.12, 0.16, 0.22);
const GROUP_BG = rgb(0.9, 0.91, 0.93);
const TOTAL_BG = rgb(0.996, 0.953, 0.78);

function currencySymbol(currency: string): string {
  const symbols: Record<string, string> = {
    USD: "$",
    EUR: "EUR ",
    GBP: "GBP ",
    CAD: "CA$",
    AUD: "AU$",
    JPY: "JP¥",
  };
  // pdf-lib StandardFonts (WinAnsi) can't encode many currency glyphs, so keep
  // it to ASCII-safe representations except the very common ones.
  return symbols[currency] ?? `${currency} `;
}

interface Ctx {
  pdf: PDFDocument;
  page: PDFPage;
  font: PDFFont;
  bold: PDFFont;
  y: number;
  currency: string;
  pageNo: number;
}

function newPage(ctx: Ctx): void {
  ctx.page = ctx.pdf.addPage([PAGE_W, PAGE_H]);
  ctx.pageNo += 1;
  ctx.y = PAGE_H - MARGIN;
  drawColumnHeader(ctx);
}

function ensureSpace(ctx: Ctx, needed: number): void {
  if (ctx.y - needed < MARGIN + 24) {
    newPage(ctx);
  }
}

/** Replace characters the StandardFont can't encode so drawText never throws. */
function safe(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[^\x00-\xFF]/g, "?");
}

function fmtMoney(ctx: Ctx, value: string | number): string {
  const n = typeof value === "string" ? Number(value) : value;
  const formatted = (Number.isFinite(n) ? n : 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return safe(`${currencySymbol(ctx.currency)}${formatted}`);
}

function drawText(
  ctx: Ctx,
  text: string,
  x: number,
  size: number,
  opts: { font?: PDFFont; color?: ReturnType<typeof rgb>; align?: "left" | "right"; width?: number } = {},
): void {
  const font = opts.font ?? ctx.font;
  const color = opts.color ?? INK;
  const value = safe(text);
  let drawX = MARGIN + x;
  if (opts.align === "right" && opts.width != null) {
    const textWidth = font.widthOfTextAtSize(value, size);
    drawX = MARGIN + x + opts.width - textWidth;
  }
  ctx.page.drawText(value, { x: drawX, y: ctx.y, size, font, color });
}

/** Truncate a string to fit a column width at the given font size. */
function fit(font: PDFFont, text: string, size: number, maxWidth: number): string {
  const value = safe(text);
  if (font.widthOfTextAtSize(value, size) <= maxWidth) return value;
  let lo = 0;
  let hi = value.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate = value.slice(0, mid) + "...";
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return value.slice(0, lo) + "...";
}

function hr(ctx: Ctx, color = RULE, thickness = 0.75): void {
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: MARGIN + CONTENT_W, y: ctx.y },
    thickness,
    color,
  });
}

function drawColumnHeader(ctx: Ctx): void {
  const rowH = 18;
  ctx.page.drawRectangle({
    x: MARGIN,
    y: ctx.y - rowH + 4,
    width: CONTENT_W,
    height: rowH,
    color: HEADER_BG,
  });
  const baseY = ctx.y;
  ctx.y = baseY - rowH + 9;
  const white = rgb(1, 1, 1);
  drawText(ctx, "ITEM", COLS.name.x + 4, 8, { font: ctx.bold, color: white });
  drawText(ctx, "PART #", COLS.part.x, 8, { font: ctx.bold, color: white });
  drawText(ctx, "CUR", COLS.current.x, 8, { font: ctx.bold, color: white, align: "right", width: COLS.current.w });
  drawText(ctx, "DES", COLS.desired.x, 8, { font: ctx.bold, color: white, align: "right", width: COLS.desired.w });
  drawText(ctx, "NEED", COLS.needed.x, 8, { font: ctx.bold, color: white, align: "right", width: COLS.needed.w });
  drawText(ctx, "UNIT", COLS.unitCost.x, 8, { font: ctx.bold, color: white, align: "right", width: COLS.unitCost.w });
  drawText(ctx, "TOTAL", COLS.lineTotal.x, 8, { font: ctx.bold, color: white, align: "right", width: COLS.lineTotal.w });
  ctx.y = baseY - rowH - 4;
}

function drawSupplierGroup(ctx: Ctx, group: ReportSupplierGroup): void {
  ensureSpace(ctx, 60);

  // Group banner.
  const bannerH = 20;
  ctx.page.drawRectangle({
    x: MARGIN,
    y: ctx.y - bannerH + 5,
    width: CONTENT_W,
    height: bannerH,
    color: GROUP_BG,
  });
  const bannerBaseY = ctx.y;
  ctx.y = bannerBaseY - bannerH + 10;
  drawText(ctx, group.supplier, COLS.name.x + 4, 11, { font: ctx.bold });
  drawText(
    ctx,
    `${group.lines.length} line${group.lines.length === 1 ? "" : "s"}`,
    COLS.lineTotal.x - 60,
    9,
    { font: ctx.font, color: MUTED, align: "right", width: COLS.lineTotal.w + 60 },
  );
  ctx.y = bannerBaseY - bannerH - 2;

  // Line rows.
  const rowH = 16;
  for (const line of group.lines) {
    ensureSpace(ctx, rowH + 4);
    // If a new page was started, the column header already redrew; nudge down.
    drawText(ctx, fit(ctx.font, line.name, 9, COLS.name.w - 6), COLS.name.x + 4, 9);
    drawText(ctx, fit(ctx.font, line.partNumber ?? "-", 8, COLS.part.w - 4), COLS.part.x, 8, { color: MUTED });
    drawText(ctx, String(line.current), COLS.current.x, 9, { align: "right", width: COLS.current.w });
    drawText(ctx, String(line.desired), COLS.desired.x, 9, { align: "right", width: COLS.desired.w, color: MUTED });
    drawText(ctx, String(line.needed), COLS.needed.x, 9, { align: "right", width: COLS.needed.w, font: ctx.bold });
    drawText(ctx, fmtMoney(ctx, line.unitCost), COLS.unitCost.x, 9, { align: "right", width: COLS.unitCost.w });
    drawText(ctx, fmtMoney(ctx, line.lineTotal), COLS.lineTotal.x, 9, { align: "right", width: COLS.lineTotal.w });
    ctx.y -= rowH;
    // Light row separator.
    ctx.page.drawLine({
      start: { x: MARGIN, y: ctx.y + 5 },
      end: { x: MARGIN + CONTENT_W, y: ctx.y + 5 },
      thickness: 0.4,
      color: rgb(0.92, 0.93, 0.94),
    });
  }

  // Subtotal.
  ensureSpace(ctx, rowH + 6);
  ctx.y -= 2;
  hr(ctx, RULE, 0.75);
  ctx.y -= rowH - 2;
  drawText(ctx, `${group.supplier} subtotal`, COLS.unitCost.x - 120, 9, {
    font: ctx.bold,
    align: "right",
    width: 120 + COLS.unitCost.w,
  });
  drawText(ctx, fmtMoney(ctx, group.subtotal), COLS.lineTotal.x, 9, {
    font: ctx.bold,
    align: "right",
    width: COLS.lineTotal.w,
  });
  ctx.y -= rowH + 6;
}

export async function buildReorderPdf(report: ReorderReport): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setTitle("Reorder Report");
  pdf.setProducer("InstaInv");
  pdf.setCreator("InstaInv");

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const page = pdf.addPage([PAGE_W, PAGE_H]);
  const ctx: Ctx = {
    pdf,
    page,
    font,
    bold,
    y: PAGE_H - MARGIN,
    currency: report.currency,
    pageNo: 1,
  };

  // --- Title block ---
  drawText(ctx, "Reorder Report", 0, 22, { font: bold });
  ctx.y -= 22;
  drawText(ctx, `Generated ${new Date(report.generatedAt).toLocaleString("en-US")}`, 0, 9, { color: MUTED });
  ctx.y -= 14;
  drawText(
    ctx,
    `Suppliers: ${report.totals.supplierCount}    Line items: ${report.totals.lineCount}    Grand total: ${fmtMoney(ctx, report.grandTotal)} ${report.currency}`,
    0,
    10,
    { color: INK },
  );
  ctx.y -= 14;
  hr(ctx, INK, 1);
  ctx.y -= 18;

  if (report.suppliers.length === 0) {
    drawText(ctx, "Nothing to reorder. Everything is at or above its desired level.", 0, 11, { color: MUTED });
  } else {
    drawColumnHeader(ctx);
    for (const group of report.suppliers) {
      drawSupplierGroup(ctx, group);
    }

    // --- Grand total band ---
    ensureSpace(ctx, 40);
    const bandH = 26;
    ctx.page.drawRectangle({
      x: MARGIN,
      y: ctx.y - bandH + 6,
      width: CONTENT_W,
      height: bandH,
      color: TOTAL_BG,
    });
    const bandBaseY = ctx.y;
    ctx.page.drawLine({
      start: { x: MARGIN, y: bandBaseY + 6 },
      end: { x: MARGIN + CONTENT_W, y: bandBaseY + 6 },
      thickness: 1.25,
      color: rgb(0.57, 0.25, 0.05),
    });
    ctx.y = bandBaseY - bandH + 14;
    drawText(ctx, "GRAND TOTAL", COLS.unitCost.x - 140, 13, {
      font: bold,
      align: "right",
      width: 140 + COLS.unitCost.w,
    });
    drawText(ctx, fmtMoney(ctx, report.grandTotal), COLS.lineTotal.x, 13, {
      font: bold,
      align: "right",
      width: COLS.lineTotal.w,
    });
    ctx.y = bandBaseY - bandH;
  }

  // --- Page footers ---
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    p.drawText(safe(`InstaInv  •  page ${i + 1} of ${pages.length}`), {
      x: MARGIN,
      y: MARGIN - 24,
      size: 8,
      font,
      color: MUTED,
    });
  });

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}
