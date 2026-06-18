"use client";

// Client-side QR / barcode image generation for the live designer canvas.
// Produces PNG data URLs we can drop straight into an <image> inside the SVG
// canvas. The authoritative print output is still produced server-side in
// src/lib/labels/render.ts; this only powers the on-screen preview.

import QRCode from "qrcode";

// E-10: bound the module-level image caches so a long editing session that
// cycles through many distinct values (live-typed bindings, resizes) can't grow
// them without limit. Insertion-order FIFO eviction via Map ordering.
const CACHE_MAX = 200;
function cachePut(cache: Map<string, string>, key: string, url: string): void {
  cache.set(key, url);
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

const qrCache = new Map<string, string>();
const barcodeCache = new Map<string, string>();

export async function qrDataUrl(value: string, sizePx = 256): Promise<string> {
  const key = `${sizePx}::${value}`;
  const hit = qrCache.get(key);
  if (hit) return hit;
  const url = await QRCode.toDataURL(value || " ", {
    margin: 0,
    width: sizePx,
    errorCorrectionLevel: "M",
  });
  cachePut(qrCache, key, url);
  return url;
}

export async function barcodeDataUrl(
  value: string,
  symbology = "code128",
  widthPx = 400,
  heightPx = 120,
): Promise<string> {
  const key = `${symbology}::${widthPx}x${heightPx}::${value}`;
  const hit = barcodeCache.get(key);
  if (hit) return hit;

  // Lazy import the browser build so the barcode engine only loads when needed.
  const bwip = (await import("bwip-js/browser")).default as any;
  const canvas = document.createElement("canvas");
  bwip.toCanvas(canvas, {
    bcid: symbology || "code128",
    text: value || "0",
    scale: 3,
    height: Math.max(6, Math.round((heightPx / Math.max(widthPx, 1)) * 24)),
    includetext: false,
    paddingwidth: 0,
    paddingheight: 0,
  });
  const url = canvas.toDataURL("image/png");
  cachePut(barcodeCache, key, url);
  return url;
}
