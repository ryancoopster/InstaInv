"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { resolveBindingString, type EntityData } from "@/lib/labels/bindings";
import { mmToPx, isMatrixSymbology, type LabelElement } from "@/lib/labels/types";
import { layoutText } from "@/lib/labels/layout";
import { qrDataUrl, barcodeDataUrl } from "./codes";

// Interactive SVG canvas. Renders the tape at scale (mm -> px), supports
// click-to-select, drag-to-move, resize handles, snap-to-grid and a live
// binding preview. Pointer math is done in mm so it stays resolution-independent.

const HANDLE = 8; // px
const SNAP_PX = 6; // smart-snap threshold in screen px

type HandleId = "nw" | "ne" | "sw" | "se" | "e" | "w" | "n" | "s";

// Snap one axis: try aligning the box's near/center/far edge to any target line
// within the threshold; returns the adjusted position + the guide line to draw.
function snapAxis(
  pos: number,
  size: number,
  targets: number[],
  thr: number,
): { pos: number; guide: number } | null {
  const offsets = [0, size / 2, size];
  let best: { pos: number; guide: number; delta: number } | null = null;
  for (const off of offsets) {
    const edge = pos + off;
    for (const t of targets) {
      const d = Math.abs(edge - t);
      if (d <= thr && (!best || d < best.delta)) best = { pos: t - off, guide: t, delta: d };
    }
  }
  return best ? { pos: best.pos, guide: best.guide } : null;
}

// Offscreen text measurement for wrapping / auto-fit on the canvas.
let measureCtx: CanvasRenderingContext2D | null = null;
function measureText(text: string, fontPx: number, family: string, bold: boolean, italic: boolean): number {
  if (typeof document === "undefined") return text.length * fontPx * 0.5;
  if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
  if (!measureCtx) return text.length * fontPx * 0.5;
  measureCtx.font = `${italic ? "italic " : ""}${bold ? "bold " : ""}${fontPx}px ${family}`;
  return measureCtx.measureText(text).width;
}

interface DragState {
  mode: "move" | "resize" | "rotate";
  handle?: HandleId;
  startX: number; // pointer mm
  startY: number;
  orig: LabelElement;
}

// Resolve QR / barcode images for the live preview, keyed by element + value.
function useCodeImages(elements: LabelElement[], entity: EntityData | null, preview: boolean) {
  const [images, setImages] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const next: Record<string, string> = {};
      for (const el of elements) {
        if (el.type !== "qrcode" && el.type !== "barcode") continue;
        const raw = `{{${el.binding || ""}}}`;
        const value = preview && entity ? resolveBindingString(raw, entity) : el.binding || "";
        try {
          if (el.type === "qrcode") {
            next[el.id] = await qrDataUrl(value || " ", 256);
          } else {
            next[el.id] = await barcodeDataUrl(value || "0", el.symbology || "code128", 400, 140);
          }
        } catch {
          /* leave undefined -> placeholder */
        }
      }
      if (!cancelled) setImages(next);
    })();
    return () => {
      cancelled = true;
    };
    // re-run when bindings / values / preview entity change
  }, [
    elements
      .filter((e) => e.type === "qrcode" || e.type === "barcode")
      .map((e) => `${e.id}:${e.binding}:${e.symbology}`)
      .join("|"),
    entity,
    preview,
  ]);

  return images;
}

export function LabelCanvas({
  elements,
  widthMm,
  heightMm,
  background,
  zoom,
  gridMm,
  snap,
  showGrid,
  selectedId,
  entity,
  preview,
  onSelect,
  onBeginEdit,
  onChange,
  onCommit,
}: {
  elements: LabelElement[];
  widthMm: number;
  heightMm: number;
  background: string;
  zoom: number; // px per mm
  gridMm: number;
  snap: boolean;
  showGrid: boolean;
  selectedId: string | null;
  entity: EntityData | null;
  preview: boolean;
  onSelect: (id: string | null) => void;
  onBeginEdit?: () => void;
  onChange: (id: string, patch: Partial<LabelElement>) => void;
  onCommit?: () => void;
}) {
  const svgRef = React.useRef<SVGSVGElement>(null);
  const dragRef = React.useRef<DragState | null>(null);
  const codeImages = useCodeImages(elements, entity, preview);
  const elementsRef = React.useRef(elements);
  React.useEffect(() => {
    elementsRef.current = elements;
  }, [elements]);
  // Latest parent callbacks behind refs so the memoised children's drag handler
  // (beginDrag) stays referentially stable even when the parent re-creates these
  // callbacks each render (E-6).
  const onSelectRef = React.useRef(onSelect);
  const onBeginEditRef = React.useRef(onBeginEdit);
  React.useEffect(() => {
    onSelectRef.current = onSelect;
    onBeginEditRef.current = onBeginEdit;
  });
  const [guides, setGuides] = React.useState<{ vx: number[]; hy: number[] }>({ vx: [], hy: [] });

  const Wpx = widthMm * zoom;
  const Hpx = heightMm * zoom;

  function snapMm(v: number): number {
    if (!snap || gridMm <= 0) return Math.round(v * 100) / 100;
    return Math.round(v / gridMm) * gridMm;
  }

  function pointerMm(e: React.PointerEvent | PointerEvent): { x: number; y: number } {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;
    return { x, y };
  }

  // E-6: stable across renders (only re-created on zoom change) so the memoised
  // ElementShape children aren't invalidated every drag frame by fresh handlers.
  const beginDrag = React.useCallback(
    (e: React.PointerEvent, el: LabelElement, mode: "move" | "resize" | "rotate", handle?: HandleId) => {
      e.stopPropagation();
      e.preventDefault();
      (e.target as Element).setPointerCapture?.(e.pointerId);
      const { x, y } = pointerMm(e);
      dragRef.current = { mode, handle, startX: x, startY: y, orig: { ...el } };
      onSelectRef.current(el.id);
      onBeginEditRef.current?.();
    },
    // pointerMm reads svgRef + zoom; only zoom changes the math.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [zoom],
  );

  React.useEffect(() => {
    function onMove(e: PointerEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      const { x, y } = pointerMm(e);
      const dx = x - drag.startX;
      const dy = y - drag.startY;
      const o = drag.orig;

      if (drag.mode === "rotate") {
        const cxmm = o.x + o.w / 2;
        const cymm = o.y + o.h / 2;
        let ang = (Math.atan2(x - cxmm, -(y - cymm)) * 180) / Math.PI;
        ang = e.shiftKey ? Math.round(ang / 15) * 15 : Math.round(ang);
        onChange(o.id, { rotation: ((ang % 360) + 360) % 360 });
        return;
      }

      if (drag.mode === "move") {
        const rawX = clamp(o.x + dx, 0, widthMm - o.w);
        const rawY = clamp(o.y + dy, 0, heightMm - o.h);
        let nx = snapMm(rawX);
        let ny = snapMm(rawY);
        const vx: number[] = [];
        const hy: number[] = [];
        if (snap) {
          const thr = SNAP_PX / zoom;
          const others = elementsRef.current.filter((e) => e.id !== o.id && !e.hidden);
          const xT = [0, widthMm / 2, widthMm, ...others.flatMap((e) => [e.x, e.x + e.w / 2, e.x + e.w])];
          const yT = [0, heightMm / 2, heightMm, ...others.flatMap((e) => [e.y, e.y + e.h / 2, e.y + e.h])];
          const sx = snapAxis(rawX, o.w, xT, thr);
          const sy = snapAxis(rawY, o.h, yT, thr);
          if (sx) {
            nx = clamp(sx.pos, 0, widthMm - o.w);
            vx.push(sx.guide);
          }
          if (sy) {
            ny = clamp(sy.pos, 0, heightMm - o.h);
            hy.push(sy.guide);
          }
        }
        setGuides({ vx, hy });
        onChange(o.id, { x: nx, y: ny });
        return;
      }

      // resize
      const h = drag.handle!;
      // E-2: the handles live inside the rotated group, so the visual east handle
      // is not along the screen x-axis once the element is rotated. Transform the
      // raw screen delta into the element's local (unrotated) frame before driving
      // w/h, then map the resulting top-left shift back to world coords so the
      // opposite edge/corner stays visually pinned (rotation pivots about center).
      const rot = o.rotation || 0;
      const rad = (rot * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      // world delta -> local delta: rotate by -rotation.
      const dlx = dx * cos + dy * sin;
      const dly = -dx * sin + dy * cos;

      // Work in the element's local frame (top-left at 0,0, size o.w x o.h).
      let lx = 0;
      let ly = 0;
      let nw = o.w;
      let nh = o.h;
      if (h.includes("e")) nw = snapMm(o.w + dlx);
      if (h.includes("s")) nh = snapMm(o.h + dly);
      if (h.includes("w")) {
        lx = snapMm(dlx);
        nw = o.w - lx;
      }
      if (h.includes("n")) {
        ly = snapMm(dly);
        nh = o.h - ly;
      }
      // Floor to min size, then re-anchor the moving edge from the FIXED opposite
      // edge so W/N resizes don't slide past where they should stop (E-8).
      nw = Math.max(2, nw);
      nh = Math.max(2, nh);
      if (h.includes("w")) lx = o.w - nw; // pin the east (right) edge
      if (h.includes("n")) ly = o.h - nh; // pin the south (bottom) edge

      if (rot) {
        // Map the local top-left shift (lx,ly) back to world coords. The element
        // rotates about its center; keep the original center fixed for the pinned
        // edges by rotating the local top-left position about the (unchanged)
        // original center, then deriving the new top-left from the new center.
        const oCx = o.x + o.w / 2;
        const oCy = o.y + o.h / 2;
        // New top-left in local space relative to the original top-left.
        // Local center of the *new* box, expressed relative to the original
        // top-left, is (lx + nw/2, ly + nh/2); the original center sits at
        // (o.w/2, o.h/2). The delta between them, rotated into world space, moves
        // the center.
        const dcx = lx + nw / 2 - o.w / 2;
        const dcy = ly + nh / 2 - o.h / 2;
        const wdcx = dcx * cos - dcy * sin;
        const wdcy = dcx * sin + dcy * cos;
        const newCx = oCx + wdcx;
        const newCy = oCy + wdcy;
        let nx = newCx - nw / 2;
        let ny = newCy - nh / 2;
        // For rotated elements the AABB clamp below would distort geometry, so
        // only round and skip the axis-aligned bounds clamps.
        nx = Math.round(nx * 100) / 100;
        ny = Math.round(ny * 100) / 100;
        onChange(o.id, { x: nx, y: ny, w: nw, h: nh });
        return;
      }

      // Axis-aligned (rotation 0): apply the local shift directly to world x/y.
      let nx = o.x + lx;
      let ny = o.y + ly;
      nx = clamp(nx, 0, widthMm - 2);
      ny = clamp(ny, 0, heightMm - 2);
      if (nx + nw > widthMm) nw = widthMm - nx;
      if (ny + nh > heightMm) nh = heightMm - ny;
      onChange(o.id, { x: nx, y: ny, w: nw, h: nh });
    }
    function onUp() {
      if (dragRef.current) {
        dragRef.current = null;
        setGuides({ vx: [], hy: [] });
        onCommit?.();
      }
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widthMm, heightMm, zoom, snap, gridMm]);

  const gridLines: React.ReactNode[] = [];
  if (showGrid && gridMm > 0) {
    for (let mx = gridMm; mx < widthMm; mx += gridMm) {
      gridLines.push(<line key={`gx${mx}`} x1={mx * zoom} y1={0} x2={mx * zoom} y2={Hpx} stroke="currentColor" strokeWidth={0.5} className="text-border" />);
    }
    for (let my = gridMm; my < heightMm; my += gridMm) {
      gridLines.push(<line key={`gy${my}`} x1={0} y1={my * zoom} x2={Wpx} y2={my * zoom} stroke="currentColor" strokeWidth={0.5} className="text-border" />);
    }
  }

  return (
    <svg
      ref={svgRef}
      width={Wpx}
      height={Hpx}
      viewBox={`0 0 ${Wpx} ${Hpx}`}
      className="touch-none rounded-sm shadow-md ring-1 ring-border"
      onPointerDown={() => onSelect(null)}
      style={{ background }}
    >
      <rect x={0} y={0} width={Wpx} height={Hpx} fill={background} />
      {gridLines}

      {elements.map((el) => {
        if (el.hidden) return null;
        return (
          <ElementShape
            key={el.id}
            el={el}
            zoom={zoom}
            entity={entity}
            preview={preview}
            codeImage={codeImages[el.id]}
            selected={el.id === selectedId}
            beginDrag={beginDrag}
          />
        );
      })}

      {/* Smart-snap alignment guides */}
      {guides.vx.map((gx, i) => (
        <line key={`gv${i}`} x1={gx * zoom} y1={0} x2={gx * zoom} y2={Hpx} stroke="#ec4899" strokeWidth={1} strokeDasharray="4 3" pointerEvents="none" />
      ))}
      {guides.hy.map((gy, i) => (
        <line key={`gh${i}`} x1={0} y1={gy * zoom} x2={Wpx} y2={gy * zoom} stroke="#ec4899" strokeWidth={1} strokeDasharray="4 3" pointerEvents="none" />
      ))}
    </svg>
  );
}

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

// E-6: memoised so siblings whose `el` reference is unchanged by patchLive's
// elements.map skip re-render during a drag — only the dragged element updates.
const ElementShape = React.memo(function ElementShape({
  el,
  zoom,
  entity,
  preview,
  codeImage,
  selected,
  beginDrag,
}: {
  el: LabelElement;
  zoom: number;
  entity: EntityData | null;
  preview: boolean;
  codeImage?: string;
  selected: boolean;
  beginDrag: (e: React.PointerEvent, el: LabelElement, mode: "move" | "resize" | "rotate", handle?: HandleId) => void;
}) {
  // Handlers built from the stable beginDrag + this element; recreated each
  // render but not compared by React.memo (only the props above are).
  const onPointerDownMove = (e: React.PointerEvent) => beginDrag(e, el, "move");
  const onPointerDownResize = (e: React.PointerEvent, handle: HandleId) => beginDrag(e, el, "resize", handle);
  const onPointerDownRotate = (e: React.PointerEvent) => beginDrag(e, el, "rotate");
  const x = el.x * zoom;
  const y = el.y * zoom;
  const w = el.w * zoom;
  const h = el.h * zoom;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const transform = el.rotation ? `rotate(${el.rotation} ${cx} ${cy})` : undefined;

  // E-6: memoise the text line-layout so the measureText-based wrapping / auto-fit
  // only recomputes when a relevant input changes — not on every drag frame where
  // only x/y move (which leave wrapping unchanged). Keyed on the text value, box
  // size in px, font + style, wrap/auto-fit/lineHeight/valign and zoom.
  const resolvedText = el.type === "text" ? (preview && entity ? resolveBindingString(el.text || "", entity) : el.text || "") : "";
  const family = el.fontFamily || "Helvetica, Arial, sans-serif";
  const startFontPx = ((el.fontSize ?? 10) / 72) * 25.4 * zoom; // pt -> mm -> px
  const lsPx = ((el.letterSpacing ?? 0) / 72) * 25.4 * zoom;
  const textLayout = React.useMemo(
    () =>
      layoutText(
        resolvedText,
        {
          width: w,
          height: h,
          fontSize: startFontPx,
          wrap: el.wrap !== false,
          autoFit: !!el.autoFit,
          lineHeightMult: el.lineHeight ?? 1.18,
          valign: el.valign,
          minFontSize: 4,
          shrinkStep: 1,
          letterSpacing: lsPx,
        },
        (text, size) => measureText(text, size, family, !!el.bold, !!el.italic),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resolvedText, w, h, startFontPx, lsPx, family, el.bold, el.italic, el.wrap, el.autoFit, el.lineHeight, el.valign],
  );

  let body: React.ReactNode = null;
  switch (el.type) {
    case "rect":
      body = <rect x={x} y={y} width={w} height={h} fill={el.fill && el.fill !== "none" ? el.fill : "transparent"} stroke={el.stroke || "#000000"} strokeWidth={(el.strokeWidth ?? 0.3) * zoom} />;
      break;
    case "ellipse":
      body = <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} fill={el.fill && el.fill !== "none" ? el.fill : "transparent"} stroke={el.stroke || "#000000"} strokeWidth={(el.strokeWidth ?? 0.3) * zoom} />;
      break;
    case "line":
      body = <line x1={x} y1={y + h / 2} x2={x + w} y2={y + h / 2} stroke={el.stroke || "#000000"} strokeWidth={(el.strokeWidth ?? 0.3) * zoom} />;
      break;
    case "arrow": {
      const sw = (el.strokeWidth ?? 0.4) * zoom;
      const ay = y + h / 2;
      const head = Math.min(w * 0.4, Math.max(6, sw * 4));
      const stroke = el.stroke || "#000000";
      body = (
        <g>
          <line x1={x} y1={ay} x2={x + w - head} y2={ay} stroke={stroke} strokeWidth={sw} />
          <polygon points={`${x + w},${ay} ${x + w - head},${ay - head * 0.6} ${x + w - head},${ay + head * 0.6}`} fill={stroke} />
        </g>
      );
      break;
    }
    case "image":
      body = el.src ? (
        <image x={x} y={y} width={w} height={h} href={el.src} preserveAspectRatio="xMidYMid meet" />
      ) : (
        <Placeholder x={x} y={y} w={w} h={h} label="Image" />
      );
      break;
    case "qrcode": {
      // E-10: draw the placeholder square (Math.min(w,h)) so the footprint
      // matches the resolved QR image and doesn't shift when it loads.
      const qrSide = Math.min(w, h);
      body = codeImage ? (
        <image x={x} y={y} width={qrSide} height={qrSide} href={codeImage} />
      ) : (
        <Placeholder x={x} y={y} w={qrSide} h={qrSide} label="QR" />
      );
      break;
    }
    case "barcode": {
      // E-5: render a 2D matrix symbology square (like the QR element) so the
      // preview matches the PDF and the code isn't stretched out of scannability;
      // 1D linear codes still fill the full box.
      const matrix = isMatrixSymbology(el.symbology);
      const bw = matrix ? Math.min(w, h) : w;
      const bh = matrix ? Math.min(w, h) : h;
      body = codeImage ? (
        <image x={x} y={y} width={bw} height={bh} href={codeImage} preserveAspectRatio={matrix ? "xMidYMid meet" : "none"} />
      ) : (
        <Placeholder x={x} y={y} w={bw} h={bh} label="Barcode" />
      );
      break;
    }
    case "text":
    default: {
      // E-4 + E-6: layout comes from the shared, memoised helper above.
      const lt = textLayout;
      const align = el.align || "left";
      const anchor = align === "center" ? "middle" : align === "right" ? "end" : "start";
      const tx = align === "center" ? cx : align === "right" ? x + w : x;
      const lines = lt.lines.length ? lt.lines : [" "];
      body = (
        <text
          fontSize={lt.fontSize}
          fontFamily={family}
          fontWeight={el.bold ? "bold" : "normal"}
          fontStyle={el.italic ? "italic" : "normal"}
          fill={el.color || "#000000"}
          textAnchor={anchor}
          textDecoration={el.underline ? "underline" : undefined}
          letterSpacing={lsPx ? lsPx : undefined}
          style={{ userSelect: "none" }}
        >
          {lines.map((ln, i) => (
            <tspan key={i} x={tx} y={y + lt.top + lt.fontSize * 0.82 + i * lt.lineHeight}>
              {ln || " "}
            </tspan>
          ))}
        </text>
      );
      break;
    }
  }

  const handles: HandleId[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
  const handlePos: Record<HandleId, { hx: number; hy: number; cursor: string }> = {
    nw: { hx: x, hy: y, cursor: "nwse-resize" },
    n: { hx: cx, hy: y, cursor: "ns-resize" },
    ne: { hx: x + w, hy: y, cursor: "nesw-resize" },
    e: { hx: x + w, hy: cy, cursor: "ew-resize" },
    se: { hx: x + w, hy: y + h, cursor: "nwse-resize" },
    s: { hx: cx, hy: y + h, cursor: "ns-resize" },
    sw: { hx: x, hy: y + h, cursor: "nesw-resize" },
    w: { hx: x, hy: cy, cursor: "ew-resize" },
  };

  return (
    <g transform={transform}>
      {body}
      {/* Transparent hit area painted ON TOP of the body: SVG hit-testing follows
          paint order, so this guarantees a click anywhere in the element's box
          selects/moves it instead of being swallowed by the body shape (which
          would bubble to the canvas background and deselect). */}
      <rect
        x={x}
        y={y}
        width={Math.max(w, 1)}
        height={Math.max(h, el.type === "line" ? 6 : 1)}
        fill="transparent"
        style={{ cursor: "move" }}
        onPointerDown={onPointerDownMove}
      />
      {selected && (
        <>
          <rect x={x} y={y} width={w} height={h} fill="none" stroke="#2563eb" strokeWidth={1} strokeDasharray="3 2" pointerEvents="none" />
          {/* Rotate handle above the top-center */}
          <line x1={cx} y1={y} x2={cx} y2={y - 16} stroke="#2563eb" strokeWidth={1} pointerEvents="none" />
          <circle
            cx={cx}
            cy={y - 16}
            r={5}
            fill="#ffffff"
            stroke="#2563eb"
            strokeWidth={1}
            style={{ cursor: "grab" }}
            onPointerDown={onPointerDownRotate}
          />
          {handles.map((hid) => {
            const p = handlePos[hid];
            return (
              <rect
                key={hid}
                x={p.hx - HANDLE / 2}
                y={p.hy - HANDLE / 2}
                width={HANDLE}
                height={HANDLE}
                fill="#ffffff"
                stroke="#2563eb"
                strokeWidth={1}
                style={{ cursor: p.cursor }}
                onPointerDown={(e) => onPointerDownResize(e, hid)}
              />
            );
          })}
        </>
      )}
    </g>
  );
});

function Placeholder({ x, y, w, h, label }: { x: number; y: number; w: number; h: number; label: string }) {
  return (
    <g pointerEvents="none">
      <rect x={x} y={y} width={w} height={h} fill="#f1f5f9" stroke="#94a3b8" strokeWidth={1} strokeDasharray="4 3" />
      <text x={x + w / 2} y={y + h / 2} fontSize={Math.max(8, Math.min(w, h) / 5)} fill="#475569" textAnchor="middle" dominantBaseline="middle">
        {label}
      </text>
    </g>
  );
}
