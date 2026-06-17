import "server-only";

// Server-only helpers for the scan / checklist module:
//  - building the data model for the printable count sheet
//  - heuristically matching OCR text lines back to items and extracting the
//    handwritten "counted" number.
//
// Handwriting OCR is intrinsically unreliable, so everything here is best-effort
// and always surfaced to the user for review before anything is applied.

import { prisma } from "@/lib/prisma";

export interface ChecklistItem {
  id: string;
  name: string;
  partNumber: string | null;
  sku: string | null;
  barcode: string | null;
  unit: string | null;
  currentQty: number;
  location: string;
  // Short human/machine code printed + barcoded on the sheet to aid matching.
  code: string;
}

export interface ChecklistBox {
  id: string;
  name: string;
  description: string | null;
  location: string | null;
  generatedAt: string;
  items: ChecklistItem[];
}

// A compact, scan-friendly code printed under each row and encoded as Code128.
// We use the last 6 chars of the cuid, upper-cased and prefixed, so it is short
// enough to read back reliably yet still effectively unique within one sheet.
export function itemCode(itemId: string): string {
  return "I-" + itemId.slice(-6).toUpperCase();
}

function locationString(item: {
  drawer: { name: string; label: string | null; box: { name: string } } | null;
  bin: { name: string | null } | null;
}): string {
  const parts = [
    item.drawer?.box?.name,
    item.drawer?.label ? `${item.drawer.name} (${item.drawer.label})` : item.drawer?.name,
    item.bin?.name,
  ].filter(Boolean);
  return parts.join(" › ");
}

// Load a box + all of its items (across drawers/bins) into the checklist shape.
// Items not yet assigned to a drawer/bin are excluded — the sheet is per-box.
export async function loadChecklistBox(boxId: string): Promise<ChecklistBox | null> {
  const box = await prisma.box.findUnique({
    where: { id: boxId },
    select: { id: true, name: true, description: true, location: true },
  });
  if (!box) return null;

  const items = await prisma.item.findMany({
    where: { drawer: { boxId } },
    select: {
      id: true,
      name: true,
      partNumber: true,
      sku: true,
      barcode: true,
      unit: true,
      quantity: true,
      sortOrder: true,
      drawer: {
        select: {
          name: true,
          label: true,
          sortOrder: true,
          box: { select: { name: true } },
        },
      },
      bin: { select: { name: true, sortOrder: true } },
    },
    orderBy: [{ drawer: { sortOrder: "asc" } }, { sortOrder: "asc" }, { name: "asc" }],
  });

  const checklistItems: ChecklistItem[] = items.map((it) => ({
    id: it.id,
    name: it.name,
    partNumber: it.partNumber,
    sku: it.sku,
    barcode: it.barcode,
    unit: it.unit,
    currentQty: it.quantity,
    location: locationString(it),
    code: itemCode(it.id),
  }));

  return {
    id: box.id,
    name: box.name,
    description: box.description,
    location: box.location,
    generatedAt: new Date().toISOString(),
    items: checklistItems,
  };
}

// ---------------------------------------------------------------------------
// OCR -> item matching
// ---------------------------------------------------------------------------

export interface ParsedRow {
  itemId: string;
  name: string;
  currentQty: number;
  parsedQty: number | null;
  unit: string | null;
  // 0..1 — how confident we are about the *item match* (not the number).
  confidence: number;
  // How the match was made, for transparency in the review UI.
  matchedBy: "code" | "partNumber" | "sku" | "barcode" | "name" | "none";
  // The raw OCR line we matched against (if any), for review.
  sourceLine: string | null;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// Cheap token-overlap similarity in [0,1]. Good enough for short item names and
// keeps us free of extra dependencies.
function similarity(a: string, b: string): number {
  const an = normalize(a);
  const bn = normalize(b);
  if (!an || !bn) return 0;
  if (an === bn) return 1;
  const at = new Set(an.split(" ").filter(Boolean));
  const bt = new Set(bn.split(" ").filter(Boolean));
  if (at.size === 0 || bt.size === 0) return 0;
  let shared = 0;
  for (const t of at) if (bt.has(t)) shared++;
  const union = new Set([...at, ...bt]).size;
  const jaccard = shared / union;
  // Bonus if one fully contains the other (handles OCR truncation).
  const contains = an.includes(bn) || bn.includes(an) ? 0.2 : 0;
  return Math.min(1, jaccard + contains);
}

// Pull the most plausible handwritten quantity out of a line. Heuristics:
//  - Prefer a number near the end of the line (the "counted" column is on the right).
//  - Ignore the printed current-qty if it is the *first* number and a later one exists.
//  - Tolerate common OCR digit confusions (O->0, l/I->1, S->5, B->8).
export function extractQuantity(line: string): number | null {
  const cleaned = line
    .replace(/[oO](?=\d)|(?<=\d)[oO]/g, "0")
    .replace(/[lI](?=\d)|(?<=\d)[lI]/g, "1")
    .replace(/[sS](?=\d)|(?<=\d)[sS]/g, "5")
    .replace(/[bB](?=\d)|(?<=\d)[bB]/g, "8");
  const matches = cleaned.match(/-?\d+(?:\.\d+)?/g);
  if (!matches || matches.length === 0) return null;
  // Right-most number is most likely the write-in count.
  const candidate = matches[matches.length - 1];
  const n = Number(candidate);
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000) return null;
  return Math.round(n);
}

// Try to find a printed item code ("I-AB12CD") inside a line.
const CODE_RE = /\bI[-\s]?([A-Z0-9]{6})\b/i;

export function findCode(line: string): string | null {
  const m = line.match(CODE_RE);
  if (!m) return null;
  return "I-" + m[1].toUpperCase();
}

// Match a set of OCR text lines to the items of a box, returning one proposed
// row per item (items with no detected line still appear, with parsedQty=null).
export async function matchLinesToItems(
  boxId: string,
  rawText: string,
): Promise<ParsedRow[]> {
  const box = await loadChecklistBox(boxId);
  if (!box) return [];

  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // Index items for fast exact lookups.
  const byCode = new Map<string, ChecklistItem>();
  const byPart = new Map<string, ChecklistItem>();
  const bySku = new Map<string, ChecklistItem>();
  const byBarcode = new Map<string, ChecklistItem>();
  for (const it of box.items) {
    byCode.set(it.code, it);
    if (it.partNumber) byPart.set(normalize(it.partNumber), it);
    if (it.sku) bySku.set(normalize(it.sku), it);
    if (it.barcode) byBarcode.set(normalize(it.barcode), it);
  }

  // For each item, find its best matching line.
  const usedLines = new Set<number>();
  const result: ParsedRow[] = [];

  // Pass 1: strong matches (code / part / sku / barcode) — anchor these first.
  type Hit = { lineIndex: number; line: string; confidence: number; matchedBy: ParsedRow["matchedBy"] };
  const itemHit = new Map<string, Hit>();

  lines.forEach((line, idx) => {
    const norm = normalize(line);

    const code = findCode(line);
    if (code && byCode.has(code)) {
      record(byCode.get(code)!.id, { lineIndex: idx, line, confidence: 0.98, matchedBy: "code" });
      return;
    }
    // Token-wise exact identifier hits.
    const tokens = norm.split(" ").filter(Boolean);
    for (const tok of tokens) {
      if (byPart.has(tok)) {
        record(byPart.get(tok)!.id, { lineIndex: idx, line, confidence: 0.9, matchedBy: "partNumber" });
        return;
      }
      if (byBarcode.has(tok)) {
        record(byBarcode.get(tok)!.id, { lineIndex: idx, line, confidence: 0.9, matchedBy: "barcode" });
        return;
      }
      if (bySku.has(tok)) {
        record(bySku.get(tok)!.id, { lineIndex: idx, line, confidence: 0.85, matchedBy: "sku" });
        return;
      }
    }
  });

  function record(itemId: string, hit: Hit) {
    const prev = itemHit.get(itemId);
    if (!prev || hit.confidence > prev.confidence) itemHit.set(itemId, hit);
  }

  // Pass 2: fuzzy name match for items still unmatched, over remaining lines.
  for (const [, hit] of itemHit) usedLines.add(hit.lineIndex);

  for (const it of box.items) {
    if (itemHit.has(it.id)) continue;
    let best: Hit | null = null;
    lines.forEach((line, idx) => {
      if (usedLines.has(idx)) return;
      const score = similarity(it.name, line);
      if (score >= 0.34 && (!best || score > best.confidence)) {
        best = { lineIndex: idx, line, confidence: score, matchedBy: "name" };
      }
    });
    if (best) {
      // Cast through unknown: TS narrows `best` to never inside the closure above.
      const hit = best as Hit;
      itemHit.set(it.id, hit);
      usedLines.add(hit.lineIndex);
    }
  }

  // Build output rows for every item.
  for (const it of box.items) {
    const hit = itemHit.get(it.id);
    result.push({
      itemId: it.id,
      name: it.name,
      currentQty: it.currentQty,
      unit: it.unit,
      parsedQty: hit ? extractQuantity(hit.line) : null,
      confidence: hit ? hit.confidence : 0,
      matchedBy: hit ? hit.matchedBy : "none",
      sourceLine: hit ? hit.line : null,
    });
  }

  // Surface most-confident matches first so the reviewer hits the clear wins early.
  result.sort((a, b) => b.confidence - a.confidence);
  return result;
}
