"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { resolveBindingString, type EntityData } from "@/lib/labels/bindings";
import { mmToPx, type LabelElement } from "@/lib/labels/types";
import { qrDataUrl, barcodeDataUrl } from "./codes";

// Interactive SVG canvas. Renders the tape at scale (mm -> px), supports
// click-to-select, drag-to-move, resize handles, snap-to-grid and a live
// binding preview. Pointer math is done in mm so it stays resolution-independent.

const HANDLE = 8; // px

type HandleId = "nw" | "ne" | "sw" | "se" | "e" | "w" | "n" | "s";

interface DragState {
  mode: "move" | "resize";
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

  function beginDrag(e: React.PointerEvent, el: LabelElement, mode: "move" | "resize", handle?: HandleId) {
    e.stopPropagation();
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const { x, y } = pointerMm(e);
    dragRef.current = { mode, handle, startX: x, startY: y, orig: { ...el } };
    onSelect(el.id);
    onBeginEdit?.();
  }

  React.useEffect(() => {
    function onMove(e: PointerEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      const { x, y } = pointerMm(e);
      const dx = x - drag.startX;
      const dy = y - drag.startY;
      const o = drag.orig;

      if (drag.mode === "move") {
        const nx = clamp(snapMm(o.x + dx), 0, widthMm - o.w);
        const ny = clamp(snapMm(o.y + dy), 0, heightMm - o.h);
        onChange(o.id, { x: nx, y: ny });
        return;
      }

      // resize
      let { x: nx, y: ny, w: nw, h: nh } = o;
      const h = drag.handle!;
      if (h.includes("e")) nw = snapMm(o.w + dx);
      if (h.includes("s")) nh = snapMm(o.h + dy);
      if (h.includes("w")) {
        nx = snapMm(o.x + dx);
        nw = o.w + (o.x - nx);
      }
      if (h.includes("n")) {
        ny = snapMm(o.y + dy);
        nh = o.h + (o.y - ny);
      }
      nw = Math.max(2, nw);
      nh = Math.max(2, nh);
      nx = clamp(nx, 0, widthMm - 2);
      ny = clamp(ny, 0, heightMm - 2);
      if (nx + nw > widthMm) nw = widthMm - nx;
      if (ny + nh > heightMm) nh = heightMm - ny;
      onChange(o.id, { x: nx, y: ny, w: nw, h: nh });
    }
    function onUp() {
      if (dragRef.current) {
        dragRef.current = null;
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
            onPointerDownMove={(e) => beginDrag(e, el, "move")}
            onPointerDownResize={(e, handle) => beginDrag(e, el, "resize", handle)}
          />
        );
      })}
    </svg>
  );
}

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

function ElementShape({
  el,
  zoom,
  entity,
  preview,
  codeImage,
  selected,
  onPointerDownMove,
  onPointerDownResize,
}: {
  el: LabelElement;
  zoom: number;
  entity: EntityData | null;
  preview: boolean;
  codeImage?: string;
  selected: boolean;
  onPointerDownMove: (e: React.PointerEvent) => void;
  onPointerDownResize: (e: React.PointerEvent, handle: HandleId) => void;
}) {
  const x = el.x * zoom;
  const y = el.y * zoom;
  const w = el.w * zoom;
  const h = el.h * zoom;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const transform = el.rotation ? `rotate(${el.rotation} ${cx} ${cy})` : undefined;

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
    case "qrcode":
      body = codeImage ? (
        <image x={x} y={y} width={Math.min(w, h)} height={Math.min(w, h)} href={codeImage} />
      ) : (
        <Placeholder x={x} y={y} w={w} h={h} label="QR" />
      );
      break;
    case "barcode":
      body = codeImage ? (
        <image x={x} y={y} width={w} height={h} href={codeImage} preserveAspectRatio="none" />
      ) : (
        <Placeholder x={x} y={y} w={w} h={h} label="Barcode" />
      );
      break;
    case "text":
    default: {
      const raw = el.text || "";
      const value = preview && entity ? resolveBindingString(raw, entity) : raw;
      const fontPx = ((el.fontSize ?? 10) / 72) * 25.4 * zoom; // pt -> mm -> px at this zoom
      const align = el.align || "left";
      const anchor = align === "center" ? "middle" : align === "right" ? "end" : "start";
      const tx = align === "center" ? cx : align === "right" ? x + w : x;
      body = (
        <text
          x={tx}
          y={y + Math.min(h, fontPx * 1.2) * 0.5 + fontPx * 0.32}
          fontSize={fontPx}
          fontFamily={el.fontFamily || "Helvetica, Arial, sans-serif"}
          fontWeight={el.bold ? "bold" : "normal"}
          fontStyle={el.italic ? "italic" : "normal"}
          fill={el.color || "#000000"}
          textAnchor={anchor}
          style={{ userSelect: "none" }}
        >
          {value || " "}
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
}

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
