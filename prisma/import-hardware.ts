/**
 * One-off importer for the "Consumable_Hardware Ordering.xlsx" workbook.
 *
 *   IMPORT_XLSX="/path/to/file.xlsx" npx tsx prisma/import-hardware.ts
 *
 * Clears existing inventory/catalog/order data (KEEPS users, roles, label
 * templates, settings) then imports:
 *   - "Consumable_Hardware Ordering" + "SUPPLY BOX" sheets -> McMaster hardware items
 *   - "Consumables" sheet -> consumable items with their own suppliers
 *
 * Mapping decisions (easily changed here):
 *   - purchaseCost = per-piece = COST / PACK QTY
 *   - desiredQuantity = TOTAL PC QTY (or PACK QTY * ORDER QTY); current quantity = 0
 *   - items are placed in a "Supply Box" with one drawer per category
 */
import { PrismaClient, Prisma } from "@prisma/client";
import ExcelJS from "exceljs";
import path from "path";

const prisma = new PrismaClient();

const XLSX_PATH =
  process.env.IMPORT_XLSX ||
  "/Users/ryancooper/Dropbox/Refrence Material/Hardware/Consumable_Hardware Ordering.xlsx";

// ---- xlsx helpers ---------------------------------------------------------
function unwrap(v: any): any {
  if (v == null) return null;
  if (typeof v === "object") {
    if (v.hyperlink != null) return String(v.text ?? v.hyperlink);
    if (v.text != null) return v.text;
    if (v.result != null) return v.result;
    if (v.richText) return v.richText.map((t: any) => t.text).join("");
    if (v instanceof Date) return v.toISOString();
    return null;
  }
  return v;
}
function cellLink(cell: ExcelJS.Cell): string | null {
  const v: any = cell.value;
  return v && typeof v === "object" && v.hyperlink ? v.hyperlink : null;
}

type Row = Record<string, any>;

async function readSheets(file: string): Promise<Record<string, Row[]>> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const out: Record<string, Row[]> = {};
  wb.eachSheet((ws) => {
    const lastCol = Math.min(ws.columnCount, 25);
    const headers: string[] = [];
    const hr = ws.getRow(1);
    for (let c = 1; c <= lastCol; c++) headers[c] = String(unwrap(hr.getCell(c).value) ?? "").trim();
    const rows: Row[] = [];
    let emptyStreak = 0;
    for (let r = 2; r <= Math.min(ws.actualRowCount, 2000); r++) {
      const row = ws.getRow(r);
      const obj: Row = {};
      for (let c = 1; c <= lastCol; c++) {
        const h = headers[c];
        if (!h) continue;
        let val = unwrap(row.getCell(c).value);
        const link = cellLink(row.getCell(c));
        if (link && /url/i.test(h)) val = link;
        if (val !== null && String(val).trim() !== "") obj[h] = val;
        else if (link) obj[h] = link;
      }
      const substantive = Object.entries(obj).filter(
        ([k, v]) => !/^sort ?order$/i.test(k) && !(/url/i.test(k) && /mcmaster\.com\/?$/i.test(String(v))),
      ).length;
      if (substantive === 0) {
        if (++emptyStreak > 40) break;
        continue;
      }
      emptyStreak = 0;
      rows.push(obj);
    }
    out[ws.name] = rows;
  });
  return out;
}

// ---- value helpers --------------------------------------------------------
const str = (v: any) => (v == null ? "" : String(v).trim());
const num = (v: any) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const titleCase = (s: string) =>
  s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\s+/g, " ").trim();

function perPiece(cost: any, pack: any): string {
  const c = num(cost);
  const p = num(pack) || 1;
  return (p > 0 ? c / p : c).toFixed(4);
}

function mcmasterUrl(raw: any, part: string): string {
  const u = str(raw);
  const m = u.match(/mcmaster\.com\/?(.*)$/i);
  let p = m && m[1] ? m[1] : "";
  if (!p) p = part;
  p = p.replace(/^\/+/, "").replace(/\/+$/, "").trim();
  return p ? `https://www.mcmaster.com/${p}/` : "https://www.mcmaster.com";
}

const SUPPLIER_SITES: Record<string, string> = {
  "McMaster-Carr": "https://www.mcmaster.com",
  "Tape Planet": "https://www.tapeplanet.com",
  "Online Labels": "https://www.onlinelabels.com",
  Amazon: "https://www.amazon.com",
  Mouser: "https://www.mouser.com",
};
function normSupplier(s: any): string | null {
  const t = str(s);
  if (!t) return null;
  if (/tape\s*plan+et/i.test(t)) return "Tape Planet";
  return t;
}
function parserFor(name: string): string {
  if (/mcmaster/i.test(name)) return "mcmaster";
  if (/mouser/i.test(name)) return "mouser";
  return "generic";
}

// Hardware custom fields (shared by every hardware-ish category).
const HARDWARE_FIELDS = [
  { name: "Type", key: "type", showOnLabel: true },
  { name: "Size", key: "size", showOnLabel: true },
  { name: "Head", key: "head", showOnLabel: false },
  { name: "Length", key: "length", showOnLabel: true },
  { name: "Material", key: "material", showOnLabel: true },
  { name: "Coating / Color", key: "coating", showOnLabel: true },
  { name: "Threading", key: "threading", showOnLabel: false },
  { name: "Pack Qty", key: "pack_qty", showOnLabel: false, type: "NUMBER" as const },
];
const CONSUMABLE_FIELDS = [
  { name: "Type", key: "sub_type", showOnLabel: true },
  { name: "Supply", key: "supply", showOnLabel: false },
  { name: "Manufacturer", key: "manufacturer", showOnLabel: true },
];

async function main() {
  console.log(`Importing from: ${path.basename(XLSX_PATH)}`);
  const sheets = await readSheets(XLSX_PATH);
  const hw = [...(sheets["Consumable_Hardware Ordering"] || []), ...(sheets["SUPPLY BOX"] || [])];
  const consumables = sheets["Consumables"] || [];
  console.log(`Parsed: ${hw.length} hardware rows, ${consumables.length} consumable rows`);

  // ---- 1. CLEAR existing inventory data (keep users, roles, labels, settings) ----
  console.log("Clearing existing inventory/catalog/order data…");
  await prisma.priceHistory.deleteMany();
  await prisma.orderRequest.deleteMany();
  await prisma.item.deleteMany();
  await prisma.customFieldDef.deleteMany();
  await prisma.bin.deleteMany();
  await prisma.drawer.deleteMany();
  await prisma.box.deleteMany();
  await prisma.category.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.activityLog.deleteMany();

  // ---- 2. Suppliers -------------------------------------------------------
  const supplierIds = new Map<string, string>();
  async function ensureSupplier(name: string): Promise<string> {
    if (supplierIds.has(name)) return supplierIds.get(name)!;
    const website = SUPPLIER_SITES[name] || null;
    const s = await prisma.supplier.create({
      data: {
        name,
        website,
        priceFetchEnabled: true,
        priceParser: parserFor(name),
        sortOrder: supplierIds.size,
      },
    });
    supplierIds.set(name, s.id);
    return s.id;
  }
  const mcmasterId = await ensureSupplier("McMaster-Carr");

  // ---- 3. Categories + custom fields -------------------------------------
  const categoryIds = new Map<string, string>();
  async function ensureCategory(rawName: string, kind: "hardware" | "consumable"): Promise<string> {
    const name = titleCase(rawName) || "Uncategorized";
    if (categoryIds.has(name)) return categoryIds.get(name)!;
    const cat = await prisma.category.create({
      data: { name, sortOrder: categoryIds.size, color: kind === "consumable" ? "#0ea5e9" : "#64748b" },
    });
    categoryIds.set(name, cat.id);
    const fields = kind === "consumable" ? CONSUMABLE_FIELDS : HARDWARE_FIELDS;
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i] as any;
      await prisma.customFieldDef.create({
        data: {
          categoryId: cat.id,
          name: f.name,
          key: f.key,
          type: f.type ?? "TEXT",
          showOnLabel: !!f.showOnLabel,
          sortOrder: i,
        },
      });
    }
    return cat.id;
  }

  // ---- 4. Supply Box with one drawer per category ------------------------
  // Pre-create categories so we can lay out drawers in a stable order.
  const hwCats = Array.from(new Set(hw.map((r) => str(r.CATEGORY) || "Hardware").map(titleCase)));
  const allCats = [...hwCats, "Consumables"];
  for (const c of hwCats) await ensureCategory(c, "hardware");
  await ensureCategory("Consumables", "consumable");

  const box = await prisma.box.create({
    data: {
      name: "Supply Box",
      description: "Imported from Consumable_Hardware Ordering.xlsx",
      location: "Shop",
      gridRows: allCats.length,
      gridCols: 1,
      sortOrder: 0,
    },
  });
  const drawerByCat = new Map<string, string>();
  for (let i = 0; i < allCats.length; i++) {
    const catName = allCats[i];
    const d = await prisma.drawer.create({
      data: {
        boxId: box.id,
        name: catName,
        label: catName.split(/\s+/).map((w) => w[0]).join("").slice(0, 3).toUpperCase(),
        gridRow: i,
        gridCol: 0,
        binRows: 2,
        binCols: 4,
        sortOrder: i,
      },
    });
    drawerByCat.set(catName, d.id);
  }

  // ---- 5. Items -----------------------------------------------------------
  let made = 0;
  // Hardware
  for (let i = 0; i < hw.length; i++) {
    const r = hw[i];
    const catName = titleCase(str(r.CATEGORY) || "Hardware");
    const categoryId = await ensureCategory(catName, "hardware");
    const part = str(r["PART #"] || r["McMaster #"]);
    const type = str(r.TYPE);
    const size = str(r.SIZE);
    const length = str(r.LENGTH);
    const packQty = num(r["PACK QTY"] ?? r["MC Qty"]);
    const orderQty = num(r["ORDER QTY"]);
    const totalPc = num(r["TOTAL  PC QTY"] ?? r["TOTAL PC QTY"]) || packQty * orderQty;
    const name = [type, size, length].map(str).filter(Boolean).join(" ") || type || part || "Item";
    const descBits = [
      str(r.HEAD) && `Head: ${str(r.HEAD)}`,
      str(r.MATERIAL) && `Material: ${str(r.MATERIAL)}`,
      str(r["COATING/COLOR"]) && `Coating: ${str(r["COATING/COLOR"])}`,
      str(r.THREADING) && `Threading: ${str(r.THREADING)}`,
      packQty && `Pack of ${packQty}`,
    ].filter(Boolean);

    await prisma.item.create({
      data: {
        name,
        description: descBits.join(" · ") || null,
        partNumber: part || null,
        purchaseCost: new Prisma.Decimal(perPiece(r.COST, packQty)),
        unit: "ea",
        quantity: 0,
        desiredQuantity: Math.round(totalPc),
        minQuantity: 0,
        supplierId: mcmasterId,
        supplierLink: mcmasterUrl(r.URL ?? r["McMaster URL"], part),
        categoryId,
        drawerId: drawerByCat.get(catName) ?? null,
        customValues: {
          type,
          size,
          head: str(r.HEAD),
          length,
          material: str(r.MATERIAL),
          coating: str(r["COATING/COLOR"]),
          threading: str(r.THREADING),
          pack_qty: packQty || null,
        },
        sortOrder: num(r["Sort Order"]) || i,
      },
    });
    made++;
  }

  // Consumables
  const consCatId = await ensureCategory("Consumables", "consumable");
  const consDrawerId = drawerByCat.get("Consumables") ?? null;
  for (let i = 0; i < consumables.length; i++) {
    const r = consumables[i];
    const supName = normSupplier(r.Supplier);
    const supplierId = supName ? await ensureSupplier(supName) : null;
    const name = str(r.Supply) || str(r.Type) || "Consumable";
    await prisma.item.create({
      data: {
        name,
        description: str(r.Type) || null,
        partNumber: str(r["Part #"]) || null,
        purchaseCost: new Prisma.Decimal(0),
        unit: "ea",
        quantity: 0,
        desiredQuantity: Math.round(num(r.Order) || num(r.Qty) || 0),
        minQuantity: 0,
        supplierId,
        supplierLink: str(r.URL) || null,
        categoryId: consCatId,
        drawerId: consDrawerId,
        customValues: {
          sub_type: str(r.Type),
          supply: str(r.Supply),
          manufacturer: str(r.Manufacturer),
        },
        sortOrder: i,
      },
    });
    made++;
  }

  // ---- 6. Refresh box/drawer summaries -----------------------------------
  const counts = {
    suppliers: await prisma.supplier.count(),
    categories: await prisma.category.count(),
    items: await prisma.item.count(),
    drawers: await prisma.drawer.count(),
  };
  console.log(`Imported ${made} items.`, counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
