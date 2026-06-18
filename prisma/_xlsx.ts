/**
 * Shared ExcelJS cell-value helpers used by the import-* scripts.
 *
 * These collapse the two previously-divergent parsers (F4) into one canonical
 * set so the importers cannot drift again. Every helper is safe on a RAW
 * `cell.value` (object) AND idempotent on an already-unwrapped primitive, so it
 * works at either layer (import-workboxes calls them on raw cells; import-hardware
 * pre-unwraps in readSheets but the canonical num/str are idempotent either way).
 */
import type ExcelJS from "exceljs";

/**
 * Flatten a raw ExcelJS cell value to a primitive (string | number | boolean | null).
 * Handles hyperlink, rich-text, shared-string text, formula .result, Date, and
 * error cells. A CellErrorValue ({ error: '#REF!' }) flattens to null so callers
 * never surface "[object Object]" or NaN. (F3/F4)
 */
export function unwrap(v: any): any {
  if (v == null) return null;
  if (typeof v === "object") {
    if (v instanceof Date) return v.toISOString();
    if (v.error != null) return null; // CellErrorValue -> empty
    if (v.hyperlink != null) return String(v.text ?? v.hyperlink);
    if (Array.isArray(v.richText)) return v.richText.map((t: any) => t.text ?? "").join("");
    if (v.text != null) return v.text;
    if (v.result != null) return unwrap(v.result); // formula result may itself be an error/date
    return null;
  }
  return v;
}

/**
 * Coerce a cell value to a number. Unwraps first, then parseFloats the result so
 * numeric-string formula results (e.g. "12") coerce correctly; non-numeric and
 * error cells yield 0. (F4)
 */
export function num(v: any): number {
  const u = unwrap(v);
  if (u == null) return 0;
  if (typeof u === "number") return Number.isFinite(u) ? u : 0;
  const n = parseFloat(String(u).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Coerce a cell value to a trimmed string. Unwraps first (so rich-text, hyperlink,
 * and formula-result cells are flattened) and returns "" for null/error cells. (F3/F4)
 */
export function str(v: any): string {
  const u = unwrap(v);
  return u == null ? "" : String(u).trim();
}

/** Extract a cell's hyperlink target, or null if it is not a hyperlink cell. */
export function cellLink(cell: ExcelJS.Cell): string | null {
  const v: any = cell.value;
  return v && typeof v === "object" && v.hyperlink ? v.hyperlink : null;
}
