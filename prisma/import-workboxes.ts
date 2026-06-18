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
import { PrismaClient, Prisma } from "@prisma/client";
import ExcelJS from "exceljs";
// F3/F4: shared xlsx cell-value helpers. The canonical num/str unwrap raw cell
// values internally (handling rich-text, hyperlink, formula-result and error
// cells), so the previous local str() that silently dropped rich-text NAME cells
// is gone.
import { num, str } from "./_xlsx";

const prisma = new PrismaClient();
const FILE =
  process.env.WORKBOX_XLSX ||
  "/Users/ryancooper/Dropbox/Shows/Sound Associates Inc./Install Work Box Inventory 20260611.xlsx";

// Marker stamped on (and matched for) importer-owned boxes so a re-run can only
// ever rebuild boxes this script created. (DM-5/F5)
const IMPORT_LOCATION = "Install Work Boxes";

const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);

const supplierCache = new Map<string, string | null>();
// Accepts a tx client so the lazy find-or-create participates in the per-box
// transaction (F7). The cache is keyed case-insensitively and only stores ids
// after a successful create, so a rolled-back box leaves no dangling cache entry
// pointing at a row that no longer exists.
async function findOrCreateSupplier(
  db: Prisma.TransactionClient,
  name: string,
): Promise<string | null> {
  const n = name.trim();
  if (!n) return null;
  const key = n.toLowerCase();
  if (supplierCache.has(key)) return supplierCache.get(key)!;
  const existing = await db.supplier.findFirst({ where: { name: { equals: n, mode: "insensitive" } } });
  const id = existing ? existing.id : (await db.supplier.create({ data: { name: n } })).id;
  supplierCache.set(key, id);
  return id;
}

interface ParsedRow {
  item: string;
  note: string;
  mfr: string;
  partNo: string;
  qty: number;
  rowNum: number; // source worksheet row, for auditable header/item logging (F6)
  bold: boolean; // structural cue: name cell is bold (F6)
  merged: boolean; // structural cue: name cell is part of a merged range (F6)
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
      const nameCell = row.getCell(2);
      const item = str(nameCell.value);
      if (!item) {
        // F6: a totally blank name cell is a legitimate spacer; but a non-empty
        // cell that str() couldn't parse to text would be silently dropped. Surface
        // that so undercounts don't pass unnoticed.
        if (nameCell.value != null) {
          console.warn(
            `  [${boxName}] row ${rn}: name cell present but unparseable (${typeof nameCell.value}) — skipped`,
          );
        }
        return;
      }
      const qtyH = num(row.getCell(8).value);
      // F6: treat the Total column as authoritative only when it is truly populated
      // and positive; a blank/zero/non-positive Total falls back to Needed + Spare
      // so a present-but-nonpositive Total can't mask real component quantities.
      const qty = qtyH > 0 ? qtyH : num(row.getCell(6).value) + num(row.getCell(7).value);
      rows.push({
        item,
        note: str(row.getCell(3).value),
        mfr: str(row.getCell(4).value),
        partNo: str(row.getCell(5).value),
        qty,
        rowNum: rn,
        bold: !!nameCell.font?.bold,
        merged: !!nameCell.isMerged,
      });
    });

    // Header detection (F6): keep the keyword path, but make the content fallback
    // safer and auditable. A row is only treated as a section header when it has no
    // item-like signal (no part#, mfr, or qty) AND either:
    //   - its name matches a section keyword, OR
    //   - it carries a positive STRUCTURAL cue (bold or merged name cell), OR
    //   - it is followed by a real data row AND bounded by a structural cue
    //     (bold/merged here, or the surrounding rows look like a section boundary).
    // Every decision is logged with the rule that fired so a human can diff the
    // import against the workbook.
    const isHeader = (r: ParsedRow, i: number): { header: boolean; rule: string } => {
      if (r.partNo || r.mfr || r.qty > 0) return { header: false, rule: "has-item-signal" };
      if (/drawer|^\s*box\b|^\s*box\s*\d|\bcase\b|\btray\b|\bshelf\b/i.test(r.item)) {
        return { header: true, rule: "keyword" };
      }
      if (r.bold || r.merged) return { header: true, rule: r.bold ? "bold" : "merged" };
      // Content-only fallback: require a following data row AND a structural boundary
      // (the previous row was itself a header/blank, i.e. this row starts a section).
      const next = rows[i + 1];
      const prev = rows[i - 1];
      const followedByData = !!next && (!!next.partNo || next.qty > 0);
      const startsSection = !prev || (!prev.partNo && !prev.mfr && prev.qty <= 0);
      if (followedByData && startsSection) {
        return { header: true, rule: "content-fallback" };
      }
      // Ambiguous: a no-part-number row that doesn't clearly start a section. Keep it
      // as an item (so its note/description isn't dropped) but log it for review.
      return { header: false, rule: "ambiguous-kept-as-item" };
    };

    // DM-5/F5: scope the existing-box lookup to the importer's own namespace
    // (name AND location = IMPORT_LOCATION), mirroring the create path, so a re-run
    // can only ever rebuild boxes THIS importer owns — never a user-created box that
    // happens to share a tab name. Box.name is not unique, so abort clearly if the
    // scoped lookup is still ambiguous rather than destroying an arbitrary match.
    const matches = await prisma.box.findMany({
      where: { name: boxName, location: IMPORT_LOCATION },
    });
    if (matches.length > 1) {
      throw new Error(
        `Ambiguous box: ${matches.length} boxes named "${boxName}" with location "${IMPORT_LOCATION}" — ` +
          `aborting to avoid destroying the wrong box. Resolve the duplicates and re-run.`,
      );
    }
    const existing = matches[0] ?? null;

    // F7: wrap this box's delete-then-rebuild in its own interactive transaction so
    // a mid-tab failure rolls back to that box's prior contents and leaves the other
    // tabs (already committed) untouched.
    const result = await prisma.$transaction(
      async (tx) => {
        // Find-or-create the box; rebuild only this box's drawers + items.
        const box = existing
          ? existing
          : await tx.box.create({ data: { name: boxName, location: IMPORT_LOCATION } });
        if (existing) {
          await tx.item.deleteMany({ where: { boxId: box.id } });
          await tx.drawer.deleteMany({ where: { boxId: box.id } }); // cascades bins
        }

        let currentDrawerId: string | null = null;
        let drawerOrder = 0;
        let itemSort = 0;
        let items = 0;
        let pieces = 0;

        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          const decision = isHeader(r, i);
          // F6: audit every classification so borderline rows can be diffed.
          console.log(
            `  [${boxName}] row ${r.rowNum} ${decision.header ? "DRAWER" : "item  "} ` +
              `(${decision.rule}): ${r.item}`,
          );
          if (decision.header) {
            const drawer = await tx.drawer.create({
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
          const supplierId = await findOrCreateSupplier(tx, r.mfr);
          await tx.item.create({
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
        await tx.box.update({ where: { id: box.id }, data: { gridRows: Math.max(1, drawerOrder), gridCols: 1 } });
        return { drawers: drawerOrder, items, pieces };
      },
      { maxWait: 15_000, timeout: 120_000 },
    );

    summary.push({ box: boxName, ...result });
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
