import "server-only";
import ExcelJS from "exceljs";
import type { ReorderReport } from "./report";

// ---------------------------------------------------------------------------
// Build an .xlsx workbook for a reorder report.
//
// One sheet, grouped: a title/header block, then each supplier as a sub-header
// row followed by its line items, a supplier subtotal row, and finally a grand
// total row. Columns are sized; header rows are bold.
// ---------------------------------------------------------------------------

function currencyFormat(currency: string): string {
  // Excel number format. Fall back to a generic symbol-less format for unknowns.
  const symbols: Record<string, string> = {
    USD: "$",
    EUR: "€",
    GBP: "£",
    CAD: "$",
    AUD: "$",
    JPY: "¥",
  };
  const sym = symbols[currency] ?? "";
  return `${sym}#,##0.00`;
}

export async function buildReorderXlsx(report: ReorderReport): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "InstaInv";
  wb.created = new Date(report.generatedAt);

  const ws = wb.addWorksheet("Reorder Report", {
    views: [{ state: "frozen", ySplit: 4 }],
  });

  const COLS = 7;
  const numFmt = currencyFormat(report.currency);

  ws.columns = [
    { key: "name", width: 38 },
    { key: "part", width: 18 },
    { key: "current", width: 12 },
    { key: "desired", width: 12 },
    { key: "needed", width: 12 },
    { key: "unitCost", width: 14 },
    { key: "lineTotal", width: 16 },
  ];

  const lastColLetter = "G";

  // --- Title block ---
  const titleRow = ws.addRow(["Reorder Report"]);
  ws.mergeCells(`A${titleRow.number}:${lastColLetter}${titleRow.number}`);
  titleRow.font = { bold: true, size: 16 };
  titleRow.height = 22;

  const genRow = ws.addRow([
    `Generated ${new Date(report.generatedAt).toLocaleString("en-US")}`,
  ]);
  ws.mergeCells(`A${genRow.number}:${lastColLetter}${genRow.number}`);
  genRow.font = { italic: true, color: { argb: "FF6B7280" } };

  const summaryRow = ws.addRow([
    `Suppliers: ${report.totals.supplierCount}   Line items: ${report.totals.lineCount}   Grand total: ${report.grandTotal} ${report.currency}`,
  ]);
  ws.mergeCells(`A${summaryRow.number}:${lastColLetter}${summaryRow.number}`);
  summaryRow.font = { color: { argb: "FF374151" } };

  // --- Column header row ---
  const header = ws.addRow([
    "Item",
    "Part #",
    "Current",
    "Desired",
    "Needed",
    "Unit Cost",
    "Line Total",
  ]);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.alignment = { vertical: "middle" };
  for (let c = 1; c <= COLS; c++) {
    const cell = header.getCell(c);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
    cell.border = { bottom: { style: "thin", color: { argb: "FF111827" } } };
  }

  // --- Supplier groups ---
  for (const group of report.suppliers) {
    const supRow = ws.addRow([group.supplier]);
    ws.mergeCells(`A${supRow.number}:${lastColLetter}${supRow.number}`);
    supRow.font = { bold: true, size: 12 };
    supRow.getCell(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE5E7EB" },
    };

    for (const line of group.lines) {
      const row = ws.addRow([
        line.name,
        line.partNumber ?? "",
        line.current,
        line.desired,
        line.needed,
        Number(line.unitCost),
        Number(line.lineTotal),
      ]);
      row.getCell(3).alignment = { horizontal: "right" };
      row.getCell(4).alignment = { horizontal: "right" };
      row.getCell(5).alignment = { horizontal: "right" };
      row.getCell(6).numFmt = numFmt;
      row.getCell(7).numFmt = numFmt;
    }

    const subtotalRow = ws.addRow([
      `${group.supplier} subtotal`,
      "",
      "",
      "",
      "",
      "",
      Number(group.subtotal),
    ]);
    ws.mergeCells(`A${subtotalRow.number}:F${subtotalRow.number}`);
    subtotalRow.getCell(1).alignment = { horizontal: "right" };
    subtotalRow.font = { bold: true };
    subtotalRow.getCell(7).numFmt = numFmt;
    subtotalRow.getCell(7).font = { bold: true };
    for (let c = 1; c <= COLS; c++) {
      subtotalRow.getCell(c).border = { top: { style: "thin", color: { argb: "FFD1D5DB" } } };
    }

    ws.addRow([]); // spacer
  }

  // --- Grand total ---
  const grandRow = ws.addRow([
    "GRAND TOTAL",
    "",
    "",
    "",
    "",
    "",
    Number(report.grandTotal),
  ]);
  ws.mergeCells(`A${grandRow.number}:F${grandRow.number}`);
  grandRow.getCell(1).alignment = { horizontal: "right" };
  grandRow.font = { bold: true, size: 12 };
  grandRow.getCell(7).numFmt = numFmt;
  for (let c = 1; c <= COLS; c++) {
    const cell = grandRow.getCell(c);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
    cell.border = { top: { style: "double", color: { argb: "FF92400E" } } };
  }

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}
