// Shared label-content types. Pure data — safe to import from both client
// components and server render code (no "server-only" here).
//
// The shape mirrors CONTRACT.md "Label content model" exactly and is what we
// persist into LabelTemplate.content (JSON).

export type LabelTargetKind = "ITEM" | "BIN" | "DRAWER" | "BOX" | "GENERIC";

export type ElementType =
  | "text"
  | "qrcode"
  | "barcode"
  | "image"
  | "rect"
  | "line"
  | "ellipse"
  | "arrow";

export type TextAlign = "left" | "center" | "right";
export type VerticalAlign = "top" | "middle" | "bottom";

export interface LabelElement {
  id: string;
  type: ElementType;
  /** millimetres on the tape */
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  hidden?: boolean;

  // text
  text?: string; // supports {{binding}} tokens
  fontSize?: number; // points
  fontFamily?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  align?: TextAlign;
  valign?: VerticalAlign;
  color?: string;
  lineHeight?: number; // multiple of font size (default 1.18)
  letterSpacing?: number; // pt tracking
  wrap?: boolean; // word-wrap to the box width
  autoFit?: boolean; // shrink font to fit the box

  // barcode / qrcode
  binding?: string; // a binding token path, e.g. "item.url"
  symbology?: string; // e.g. "code128"

  // image
  src?: string; // public URL/path

  // rect / line
  stroke?: string;
  fill?: string;
  strokeWidth?: number; // millimetres
}

export interface LabelContent {
  dpi: number;
  background: string; // hex
  elements: LabelElement[];
}

export const DEFAULT_CONTENT: LabelContent = {
  dpi: 300,
  background: "#ffffff",
  elements: [],
};

/** Normalise a raw JSON `content` value (possibly `{}`) into a full LabelContent. */
export function normalizeContent(raw: unknown): LabelContent {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Partial<LabelContent>;
  return {
    dpi: typeof obj.dpi === "number" && obj.dpi > 0 ? obj.dpi : 300,
    background: typeof obj.background === "string" ? obj.background : "#ffffff",
    elements: Array.isArray(obj.elements) ? (obj.elements as LabelElement[]) : [],
  };
}

// ---------------------------------------------------------------------------
// Tape / media presets (common Brother media + TZe continuous tape).
// ---------------------------------------------------------------------------

export interface TapePreset {
  id: string;
  name: string; // human label shown in the picker
  tapeName: string; // stored on LabelTemplate.tapeName
  widthMm: number; // printable length on the tape (long edge for die-cut)
  heightMm: number; // printable height (short edge — tape width)
  orientation: "landscape" | "portrait";
  group: "Brother DK (die-cut)" | "Brother DK (continuous)" | "Brother TZe (continuous)";
  continuous?: boolean;
}

// widthMm = along the print/feed direction, heightMm = tape width.
export const TAPE_PRESETS: TapePreset[] = [
  {
    id: "dk-1201",
    name: "DK-1201 — 29 × 90 mm address",
    tapeName: "Brother DK-1201 29x90",
    widthMm: 90,
    heightMm: 29,
    orientation: "landscape",
    group: "Brother DK (die-cut)",
  },
  {
    id: "dk-1209",
    name: "DK-1209 — 29 × 62 mm small address",
    tapeName: "Brother DK-1209 29x62",
    widthMm: 62,
    heightMm: 29,
    orientation: "landscape",
    group: "Brother DK (die-cut)",
  },
  {
    id: "dk-1204",
    name: "DK-1204 — 17 × 54 mm multipurpose",
    tapeName: "Brother DK-1204 17x54",
    widthMm: 54,
    heightMm: 17,
    orientation: "landscape",
    group: "Brother DK (die-cut)",
  },
  {
    id: "dk-1202",
    name: "DK-1202 — 62 × 100 mm shipping",
    tapeName: "Brother DK-1202 62x100",
    widthMm: 100,
    heightMm: 62,
    orientation: "landscape",
    group: "Brother DK (die-cut)",
  },
  {
    id: "dk-1208",
    name: "DK-1208 — 38 × 90 mm large address",
    tapeName: "Brother DK-1208 38x90",
    widthMm: 90,
    heightMm: 38,
    orientation: "landscape",
    group: "Brother DK (die-cut)",
  },
  {
    id: "dk-22205",
    name: "DK-22205 — 62 mm continuous",
    tapeName: "Brother DK-22205 62mm continuous",
    widthMm: 100,
    heightMm: 62,
    orientation: "landscape",
    group: "Brother DK (continuous)",
    continuous: true,
  },
  {
    id: "dk-22210",
    name: "DK-22210 — 29 mm continuous",
    tapeName: "Brother DK-22210 29mm continuous",
    widthMm: 90,
    heightMm: 29,
    orientation: "landscape",
    group: "Brother DK (continuous)",
    continuous: true,
  },
  {
    id: "tze-12",
    name: "TZe 12 mm continuous",
    tapeName: "Brother TZe 12mm continuous",
    widthMm: 70,
    heightMm: 12,
    orientation: "landscape",
    group: "Brother TZe (continuous)",
    continuous: true,
  },
  {
    id: "tze-24",
    name: "TZe 24 mm continuous",
    tapeName: "Brother TZe 24mm continuous",
    widthMm: 90,
    heightMm: 24,
    orientation: "landscape",
    group: "Brother TZe (continuous)",
    continuous: true,
  },
  {
    id: "tze-36",
    name: "TZe 36 mm continuous",
    tapeName: "Brother TZe 36mm continuous",
    widthMm: 100,
    heightMm: 36,
    orientation: "landscape",
    group: "Brother TZe (continuous)",
    continuous: true,
  },
];

export function tapePresetById(id: string): TapePreset | undefined {
  return TAPE_PRESETS.find((t) => t.id === id);
}

// ---------------------------------------------------------------------------
// Symbology classification (E-5).
// ---------------------------------------------------------------------------

/** 1D linear symbologies offered on the `barcode` element. */
export const LINEAR_SYMBOLOGIES = ["code128", "code39", "ean13", "upca", "itf"] as const;

/** 2D matrix symbologies. These must be drawn in a SQUARE box (like the qrcode
 *  element) — stretching them non-uniformly into a wide barcode box can make
 *  them unscannable. New designs route these through the qrcode element; this
 *  set lets the renderers keep existing data square as a fallback. */
export const MATRIX_SYMBOLOGIES = ["qrcode", "datamatrix", "pdf417", "azteccode"] as const;

/** True when a symbology is a 2D matrix code that needs square geometry. */
export function isMatrixSymbology(symbology: string | undefined | null): boolean {
  if (!symbology) return false;
  return (MATRIX_SYMBOLOGIES as readonly string[]).includes(symbology.toLowerCase());
}

// ---------------------------------------------------------------------------
// Unit conversion helpers (shared by canvas + render).
// ---------------------------------------------------------------------------

export const MM_PER_INCH = 25.4;
export const POINTS_PER_INCH = 72;

/** millimetres -> PDF points */
export function mmToPt(mm: number): number {
  return (mm / MM_PER_INCH) * POINTS_PER_INCH;
}

/** millimetres -> raster pixels at a given dpi */
export function mmToPx(mm: number, dpi: number): number {
  return (mm / MM_PER_INCH) * dpi;
}
