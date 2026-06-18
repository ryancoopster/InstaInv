// Shared text line-layout for label renderers. Pure data — safe to import from
// both client components (LabelCanvas) and server render code (render.ts, svg.ts)
// so wrapping / auto-fit / vertical-align stay identical across the live canvas,
// the printed PDF and the static SVG preview.
//
// E-4: previously each renderer carried a near-duplicate copy of this logic and
// svg.ts had none (single-line), so multi-line templates rendered differently in
// the preview thumbnail than in the editor and PDF. This centralises the maths.

import type { LabelElement } from "./types";

/** Underline geometry as proportions of the font size, shared by all renderers
 *  so the hand-drawn PDF rule matches the browser's font decoration (E-12). */
export const UNDERLINE_OFFSET_RATIO = 0.12; // below the baseline
export const UNDERLINE_THICKNESS_RATIO = 0.06;

export interface LineLayout {
  /** wrapped lines at the resolved font size */
  lines: string[];
  /** resolved font size after any auto-fit shrink (same unit as the input fontSize) */
  fontSize: number;
  /** distance between line baselines (fontSize * lineHeight multiple) */
  lineHeight: number;
  /** total block height (lines.length * lineHeight) */
  totalHeight: number;
  /** vertical offset of the block's top from the box top (valign) */
  top: number;
}

/** A function that measures the rendered width of `text` at `size` in the
 *  caller's coordinate space (pt for PDF/SVG, px for the canvas). */
export type MeasureFn = (text: string, size: number) => number;

export interface LayoutOptions {
  /** box width in the same unit as the measure fn + font size */
  width: number;
  /** box height in the same unit */
  height: number;
  /** starting font size */
  fontSize: number;
  wrap: boolean;
  autoFit: boolean;
  lineHeightMult: number;
  valign?: LabelElement["valign"];
  /** smallest font auto-fit will shrink to */
  minFontSize?: number;
  /** auto-fit shrink step */
  shrinkStep?: number;
  /** extra width added per inter-character gap (letter spacing / tracking) */
  letterSpacing?: number;
}

/** Word-wrap a value into lines that fit `width`, splitting on existing newlines
 *  first. Mirrors the previous per-renderer logic exactly. */
function wrapLines(value: string, width: number, wrap: boolean, measure: MeasureFn, size: number): string[] {
  const paragraphs = value.split(/\r?\n/);
  if (!wrap) return paragraphs;
  const out: string[] = [];
  for (const para of paragraphs) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const trial = line ? `${line} ${word}` : word;
      if (measure(trial, size) > width && line) {
        out.push(line);
        line = word;
      } else {
        line = trial;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

/**
 * Compute wrapped lines, auto-fit font size and vertical-align offset for a text
 * box. `measure` reports widths in the caller's unit; `width`/`height`/`fontSize`
 * must be in that same unit. The returned `fontSize`/`lineHeight`/`top` are also
 * in that unit so each renderer just positions baselines from them.
 */
export function layoutText(value: string, opts: LayoutOptions, measure: MeasureFn): LineLayout {
  const minFont = opts.minFontSize ?? 3;
  const step = opts.shrinkStep ?? 0.5;
  const ls = opts.letterSpacing ?? 0;

  // Include letter-spacing in the measured width so wrap / auto-fit / alignment
  // account for tracking (E-12): width of n glyphs gains (n-1) gaps.
  const measureTracked: MeasureFn = ls
    ? (text, size) => measure(text, size) + Math.max(0, text.length - 1) * ls
    : measure;

  let sizeOut = opts.fontSize;
  let lines = wrapLines(value, opts.width, opts.wrap, measureTracked, sizeOut);
  if (opts.autoFit) {
    while (sizeOut > minFont) {
      lines = wrapLines(value, opts.width, opts.wrap, measureTracked, sizeOut);
      const totalH = lines.length * sizeOut * opts.lineHeightMult;
      const widest = Math.max(0, ...lines.map((l) => measureTracked(l, sizeOut)));
      if (totalH <= opts.height && (opts.wrap || widest <= opts.width)) break;
      sizeOut -= step;
    }
  }

  const lineHeight = sizeOut * opts.lineHeightMult;
  const totalHeight = lines.length * lineHeight;
  let top = 0;
  if (opts.valign === "middle") top = (opts.height - totalHeight) / 2;
  else if (opts.valign === "bottom") top = opts.height - totalHeight;

  return { lines, fontSize: sizeOut, lineHeight, totalHeight, top };
}
