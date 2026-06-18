/**
 * Import the "Install Work Box Inventory" workbook: one Box per tab, section-header
 * rows become Drawers, and the remaining rows become Items placed in the current
 * drawer (or directly in the box before the first drawer).
 *
 * ADDITIVE + re-runnable: it only clears/rebuilds the 5 boxes named after the tabs;
 * every other box (e.g. the hardware Supply Box) is left untouched. Honors the
 * global case-insensitive unique part-number constraint by nulling out any part
 * number that would collide (logged in the summary).
 *
 *   npx tsx prisma/import-workboxes.ts
 */
import { PrismaClient } from "@prisma/client";
import ExcelJS from "exceljs";

const prisma = new PrismaClient();
const FILE =
  process.env.WORKBOX_XLSX ||
  "/Users/ryancooper/Dropbox/Shows/Sound Associates Inc./Install Work Box Inventory 20260611.xlsx";

function num(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "object") {
    const r = (v as { result?: unknown }).result;
    return typeof r === "number" ? r : 0;
  }
  const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function str(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object") {
    const o = v as { text?: unknown; result?: unknown };
    return String(o.text ?? o.result ?? "").trim();
  }
  return String(v).trim();
}
const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);

const supplierCache = new Map<string, string | null>();
async function findOrCreateSupplier(name: string): Promise<string | null> {
  const n = name.trim();
  if (!n) return null;
  const key = n.toLowerCase();
  if (supplierCache.has(key)) return supplierCache.get(key)!;
  const existing = await prisma.supplier.findFirst({ where: { name: { equals: n, mode: "insensitive" } } });
  const id = existing ? existing.id : (await prisma.supplier.create({ data: { name: n } })).id;
  supplierCache.set(key, id);
  return id;
}

interface ParsedRow {
  item: string;
  note: string;
  mfr: string;
  partNo: string;
  qty: number;
}

async function main() {
  console.log(`Importing workboxes from: ${FILE.split("/").pop()}`);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FILE);

  // Existing part numbers (case-insensitive) so we never violate the unique index.
  const existingPNs = await prisma.item.findMany({
    where: { partNumber: { not: null } },
    select: { partNumber: true },
  });
  const usedPN = new Set(existingPNs.map((p) => p.partNumber!.toLowerCase()).filter((s) => s));

  const summary: { box: string; drawers: number; items: number; pieces: number }[] = [];
  let nulledPNs = 0;

  for (const ws of wb.worksheets) {
    const boxName = ws.name.trim();

    // Parse non-empty data rows (skip the header row).
    const rows: ParsedRow[] = [];
    ws.eachRow({ includeEmpty: false }, (row, rn) => {
      if (rn === 1) return;
      const item = str(row.getCell(2).value);
      if (!item) return;
      const qtyH = num(row.getCell(8).value);
      const qty = qtyH > 0 ? qtyH : num(row.getCell(6).value) + num(row.getCell(7).value);
      rows.push({
        item,
        note: str(row.getCell(3).value),
        mfr: str(row.getCell(4).value),
        partNo: str(row.getCell(5).value),
        qty,
      });
    });

    // Header detection: no part#, no manufacturer, no quantity, AND it looks like a
    // section (drawer/box/case keyword) OR the next data row carries a part#/qty.
    const isHeader = (r: ParsedRow, i: number): boolean => {
      if (r.partNo || r.mfr || r.qty > 0) return false;
      if (/drawer|^\s*box\b|^\s*box\s*\d|\bcase\b|\btray\b|\bshelf\b/i.test(r.item)) return true;
      const next = rows[i + 1];
      return !!next && (!!next.partNo || next.qty > 0);
    };

    // Find-or-create the box; rebuild only this box's drawers + items.
    let box = await prisma.box.findFirst({ where: { name: boxName } });
    if (box) {
      await prisma.item.deleteMany({ where: { boxId: box.id } });
      await prisma.drawer.deleteMany({ where: { boxId: box.id } }); // cascades bins
    } else {
      box = await prisma.box.create({ data: { name: boxName, location: "Install Work Boxes" } });
    }

    let currentDrawerId: string | null = null;
    let drawerOrder = 0;
    let itemSort = 0;
    let items = 0;
    let pieces = 0;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (isHeader(r, i)) {
        const drawer = await prisma.drawer.create({
          data: { boxId: box.id, name: trunc(r.item, 180), gridRow: drawerOrder, gridCol: 0, sortOrder: drawerOrder },
        });
        currentDrawerId = drawer.id;
        drawerOrder++;
        continue;
      }
      let pn: string | null = r.partNo || null;
      if (pn) {
        if (usedPN.has(pn.toLowerCase())) {
          pn = null; // collision — import without a part number
          nulledPNs++;
        } else {
          usedPN.add(pn.toLowerCase());
        }
      }
      const supplierId = await findOrCreateSupplier(r.mfr);
      await prisma.item.create({
        data: {
          name: trunc(r.item, 200),
          partNumber: pn,
          description: r.note || null,
          quantity: Math.round(r.qty),
          supplierId,
          boxId: box.id,
          drawerId: currentDrawerId,
          sortOrder: itemSort++,
        },
      });
      items++;
      pieces += Math.round(r.qty);
    }

    // Size the box front-view grid to fit its drawers.
    await prisma.box.update({ where: { id: box.id }, data: { gridRows: Math.max(1, drawerOrder), gridCols: 1 } });
    summary.push({ box: boxName, drawers: drawerOrder, items, pieces });
  }

  console.log("\nImport complete:");
  for (const s of summary) {
    console.log(`  ${s.box.padEnd(34)} drawers=${String(s.drawers).padStart(3)}  items=${String(s.items).padStart(4)}  pieces=${String(s.pieces).padStart(5)}`);
  }
  if (nulledPNs) console.log(`  (${nulledPNs} part numbers nulled to avoid duplicates)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
