// Shared client-side types for the scan module. Mirrors the server shapes in
// src/app/api/checklist/_lib.ts and src/app/api/ocr/route.ts without importing
// server-only code into client components.

export interface BoxOption {
  id: string;
  name: string;
  location: string | null;
  itemCount: number;
}

export interface ParsedRow {
  itemId: string;
  name: string;
  currentQty: number;
  parsedQty: number | null;
  unit: string | null;
  confidence: number;
  matchedBy: "code" | "partNumber" | "sku" | "barcode" | "name" | "none";
  sourceLine: string | null;
}

export interface ParseResponse {
  boxId: string;
  rows: ParsedRow[];
}

export interface OcrLine {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

export interface OcrResult {
  text: string;
  confidence: number;
  lang: string;
  lines: OcrLine[];
  words: { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }[];
}

export interface ApplyResult {
  applied: number;
  skipped: string[];
  total: number;
}
