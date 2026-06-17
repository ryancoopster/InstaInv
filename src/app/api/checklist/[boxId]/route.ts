import { requirePermission } from "@/lib/auth";
import { AuthError } from "@/lib/auth";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import bwipjs from "bwip-js/node";
import { loadChecklistBox, type ChecklistItem } from "../_lib";

export const dynamic = "force-dynamic";
// pdf-lib + bwip-js need the Node runtime (Buffer, no edge).
export const runtime = "nodejs";

// US Letter, portrait, in PDF points (72pt = 1in).
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 40;
const ROW_H = 46;

function sanitize(text: string | null | undefined): string {
  // pdf-lib StandardFonts (WinAnsi) can't encode arbitrary unicode (e.g. "›").
  // Replace the separators we emit and strip anything else non-encodable.
  return (text ?? "")
    .replace(/[›»]/g, ">")
    .replace(/[–—]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\x20-\x7E]/g, "");
}

function truncate(font: PDFFont, text: string, size: number, maxWidth: number): string {
  let t = sanitize(text);
  if (font.widthOfTextAtSize(t, size) <= maxWidth) return t;
  while (t.length > 1 && font.widthOfTextAtSize(t + "...", size) > maxWidth) {
    t = t.slice(0, -1);
  }
  return t + "...";
}

async function barcodePng(code: string): Promise<Uint8Array | null> {
  try {
    const buf = await bwipjs.toBuffer({
      bcid: "code128",
      text: code,
      scale: 2,
      height: 7, // mm
      includetext: false,
      paddingwidth: 0,
      paddingheight: 0,
    });
    return new Uint8Array(buf);
  } catch (err) {
    console.error("[checklist] barcode render failed", err);
    return null;
  }
}

export async function GET(_req: Request, { params }: { params: { boxId: string } }) {
  try {
    await requirePermission("ocr.scan");

    const box = await loadChecklistBox(params.boxId);
    if (!box) {
      return new Response(JSON.stringify({ ok: false, error: "Box not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

    // Pre-render all barcodes once (embed each PNG into the document).
    const barcodeImages = new Map<string, Awaited<ReturnType<typeof pdf.embedPng>>>();
    for (const item of box.items) {
      if (barcodeImages.has(item.code)) continue;
      const png = await barcodePng(item.code);
      if (png) {
        try {
          barcodeImages.set(item.code, await pdf.embedPng(png));
        } catch {
          /* skip a bad image rather than fail the whole sheet */
        }
      }
    }

    let page = pdf.addPage([PAGE_W, PAGE_H]);
    let y = PAGE_H - MARGIN;

    const drawHeader = (p: PDFPage) => {
      p.drawText("Inventory Count Sheet", {
        x: MARGIN,
        y: y - 6,
        size: 18,
        font: fontBold,
        color: rgb(0.1, 0.1, 0.12),
      });
      const meta = `Box: ${sanitize(box.name)}${box.location ? `  •  ${sanitize(box.location)}` : ""}`;
      p.drawText(sanitize(meta).replace("•", "-"), {
        x: MARGIN,
        y: y - 26,
        size: 10,
        font,
        color: rgb(0.35, 0.35, 0.4),
      });
      const generated = `Generated ${new Date(box.generatedAt).toLocaleString("en-US")}`;
      p.drawText(sanitize(generated), {
        x: MARGIN,
        y: y - 40,
        size: 9,
        font,
        color: rgb(0.5, 0.5, 0.55),
      });
      p.drawText("Write the counted quantity in the box on the right. Print clearly.", {
        x: MARGIN,
        y: y - 54,
        size: 9,
        font,
        color: rgb(0.5, 0.5, 0.55),
      });
      y -= 72;
      // Column header rule.
      p.drawLine({
        start: { x: MARGIN, y },
        end: { x: PAGE_W - MARGIN, y },
        thickness: 1,
        color: rgb(0.8, 0.8, 0.84),
      });
      p.drawText("ITEM", { x: MARGIN, y: y - 12, size: 8, font: fontBold, color: rgb(0.4, 0.4, 0.45) });
      p.drawText("CURRENT", {
        x: PAGE_W - MARGIN - 200,
        y: y - 12,
        size: 8,
        font: fontBold,
        color: rgb(0.4, 0.4, 0.45),
      });
      p.drawText("COUNTED", {
        x: PAGE_W - MARGIN - 90,
        y: y - 12,
        size: 8,
        font: fontBold,
        color: rgb(0.4, 0.4, 0.45),
      });
      y -= 22;
    };

    drawHeader(page);

    const drawRow = (item: ChecklistItem) => {
      const rowTop = y;
      const rowBottom = y - ROW_H;
      const contentRight = PAGE_W - MARGIN;
      const writeBoxW = 90;
      const writeBoxX = contentRight - writeBoxW;
      const currentColX = contentRight - 200;

      // Name + identifiers.
      const nameMaxW = currentColX - MARGIN - 12;
      page.drawText(truncate(fontBold, item.name, 11, nameMaxW), {
        x: MARGIN,
        y: rowTop - 12,
        size: 11,
        font: fontBold,
        color: rgb(0.12, 0.12, 0.15),
      });

      const idBits = [
        item.partNumber ? `P/N ${item.partNumber}` : null,
        item.sku ? `SKU ${item.sku}` : null,
        item.location || null,
      ]
        .filter(Boolean)
        .join("   ");
      if (idBits) {
        page.drawText(truncate(font, idBits, 8, nameMaxW), {
          x: MARGIN,
          y: rowTop - 24,
          size: 8,
          font,
          color: rgb(0.45, 0.45, 0.5),
        });
      }

      // Printed code + barcode (matching aid).
      const img = barcodeImages.get(item.code);
      if (img) {
        const bw = 96;
        const bh = (img.height / img.width) * bw;
        page.drawImage(img, {
          x: MARGIN,
          y: rowBottom + 4,
          width: bw,
          height: Math.min(bh, 18),
        });
        page.drawText(item.code, {
          x: MARGIN + bw + 8,
          y: rowBottom + 7,
          size: 8,
          font,
          color: rgb(0.4, 0.4, 0.45),
        });
      } else {
        page.drawText(item.code, {
          x: MARGIN,
          y: rowBottom + 7,
          size: 9,
          font: fontBold,
          color: rgb(0.4, 0.4, 0.45),
        });
      }

      // Current qty.
      page.drawText(`${item.currentQty}${item.unit ? " " + sanitize(item.unit) : ""}`, {
        x: currentColX,
        y: rowTop - 16,
        size: 11,
        font,
        color: rgb(0.2, 0.2, 0.25),
      });

      // Write-in box for the counted value.
      page.drawRectangle({
        x: writeBoxX,
        y: rowBottom + 2,
        width: writeBoxW,
        height: ROW_H - 8,
        borderColor: rgb(0.55, 0.55, 0.6),
        borderWidth: 1.2,
        color: rgb(1, 1, 1),
      });

      // Bottom divider.
      page.drawLine({
        start: { x: MARGIN, y: rowBottom },
        end: { x: contentRight, y: rowBottom },
        thickness: 0.5,
        color: rgb(0.9, 0.9, 0.92),
      });

      y = rowBottom;
    };

    if (box.items.length === 0) {
      page.drawText("This box has no items assigned to its drawers yet.", {
        x: MARGIN,
        y: y - 20,
        size: 11,
        font,
        color: rgb(0.4, 0.4, 0.45),
      });
    }

    for (const item of box.items) {
      if (y - ROW_H < MARGIN + 20) {
        page = pdf.addPage([PAGE_W, PAGE_H]);
        y = PAGE_H - MARGIN;
        drawHeader(page);
      }
      drawRow(item);
    }

    // Footer page numbers.
    const pages = pdf.getPages();
    pages.forEach((p, i) => {
      p.drawText(`Page ${i + 1} of ${pages.length}  -  InstaInv count sheet`, {
        x: MARGIN,
        y: 20,
        size: 8,
        font,
        color: rgb(0.6, 0.6, 0.65),
      });
    });

    const bytes = await pdf.save();
    const safeName = (box.name || "box").replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
    return new Response(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="count-sheet-${safeName}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: err.code === "UNAUTHENTICATED" ? "Not signed in" : "You do not have permission",
        }),
        {
          status: err.code === "UNAUTHENTICATED" ? 401 : 403,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    console.error("[checklist pdf] error", err);
    return new Response(
      JSON.stringify({ ok: false, error: "Failed to generate count sheet" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
