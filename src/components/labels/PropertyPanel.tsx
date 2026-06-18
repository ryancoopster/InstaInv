"use client";

import * as React from "react";
import {
  Upload,
  Loader2,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { toast } from "@/components/ui/toast";
import { BindingTokenPicker } from "./BindingTokenPicker";
import type { LabelElement } from "@/lib/labels/types";
import type { LabelTargetKind } from "@/lib/labels/types";

const FONT_FAMILIES = ["Helvetica, Arial, sans-serif", "Georgia, 'Times New Roman', serif", "'Courier New', monospace"];
const SYMBOLOGIES = ["code128", "code39", "ean13", "upca", "qrcode", "datamatrix", "pdf417"];

function NumField({
  label,
  value,
  onChange,
  step = 0.5,
  min,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        step={step}
        min={min}
        value={value ?? 0}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-8"
      />
    </div>
  );
}

export function PropertyPanel({
  element,
  target,
  customKeys,
  widthMm,
  heightMm,
  onChange,
  onCommit,
}: {
  element: LabelElement | null;
  target: LabelTargetKind;
  customKeys: string[];
  widthMm: number;
  heightMm: number;
  onChange: (patch: Partial<LabelElement>) => void;
  onCommit: () => void;
}) {
  const [uploading, setUploading] = React.useState(false);
  const textRef = React.useRef<HTMLTextAreaElement>(null);

  if (!element) {
    return (
      <div className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
        Select an element to edit its properties.
      </div>
    );
  }

  const el = element;
  const set = (patch: Partial<LabelElement>) => onChange(patch);

  function insertToken(token: string) {
    const ta = textRef.current;
    const current = el.text || "";
    if (ta && document.activeElement === ta) {
      const start = ta.selectionStart ?? current.length;
      const end = ta.selectionEnd ?? current.length;
      const next = current.slice(0, start) + token + current.slice(end);
      set({ text: next });
      requestAnimationFrame(() => {
        ta.focus();
        const pos = start + token.length;
        ta.setSelectionRange(pos, pos);
      });
    } else {
      set({ text: current + token });
    }
    onCommit();
  }

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await api.post<{ url: string }>("/api/uploads", form);
      set({ src: res.url });
      onCommit();
      toast.success("Image uploaded");
    } catch (err: any) {
      toast.error({ title: "Upload failed", description: err?.message });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Geometry — common to all types */}
      <section className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Position & size (mm)</h4>
        <div className="grid grid-cols-2 gap-2">
          <NumField label="X" value={el.x} onChange={(v) => set({ x: v })} />
          <NumField label="Y" value={el.y} onChange={(v) => set({ y: v })} />
          <NumField label="Width" value={el.w} onChange={(v) => set({ w: Math.max(1, v) })} min={1} />
          <NumField label="Height" value={el.h} onChange={(v) => set({ h: Math.max(1, v) })} min={1} />
        </div>
        <NumField label="Rotation (°)" value={el.rotation ?? 0} onChange={(v) => set({ rotation: v })} step={1} />
        <div className="space-y-1">
          <Label className="text-xs">Align to label</Label>
          <div className="flex items-center gap-0.5">
            <AlignBtn title="Left" icon={AlignStartVertical} onClick={() => { set({ x: 0 }); onCommit(); }} />
            <AlignBtn title="Center" icon={AlignCenterVertical} onClick={() => { set({ x: Math.round((widthMm - el.w) / 2 * 100) / 100 }); onCommit(); }} />
            <AlignBtn title="Right" icon={AlignEndVertical} onClick={() => { set({ x: Math.round((widthMm - el.w) * 100) / 100 }); onCommit(); }} />
            <div className="mx-1 h-5 w-px bg-border" />
            <AlignBtn title="Top" icon={AlignStartHorizontal} onClick={() => { set({ y: 0 }); onCommit(); }} />
            <AlignBtn title="Middle" icon={AlignCenterHorizontal} onClick={() => { set({ y: Math.round((heightMm - el.h) / 2 * 100) / 100 }); onCommit(); }} />
            <AlignBtn title="Bottom" icon={AlignEndHorizontal} onClick={() => { set({ y: Math.round((heightMm - el.h) * 100) / 100 }); onCommit(); }} />
          </div>
        </div>
      </section>

      {/* Text */}
      {el.type === "text" && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Text</h4>
            <BindingTokenPicker target={target} customKeys={customKeys} mode="insert" onPick={insertToken} label="Token" />
          </div>
          <Textarea
            ref={textRef}
            value={el.text || ""}
            onChange={(e) => set({ text: e.target.value })}
            onBlur={onCommit}
            rows={3}
            placeholder="Type text or insert a {{binding}}"
            className="font-mono text-xs"
          />
          <div className="grid grid-cols-2 gap-2">
            <NumField label="Font size (pt)" value={el.fontSize ?? 10} onChange={(v) => set({ fontSize: Math.max(1, v) })} step={1} min={1} />
            <div className="space-y-1">
              <Label className="text-xs">Align</Label>
              <Select className="h-8" value={el.align || "left"} onChange={(e) => set({ align: e.target.value as any })}>
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Font</Label>
            <Select className="h-8" value={el.fontFamily || FONT_FAMILIES[0]} onChange={(e) => set({ fontFamily: e.target.value })}>
              {FONT_FAMILIES.map((f) => (
                <option key={f} value={f}>
                  {f.split(",")[0].replace(/['"]/g, "")}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={!!el.bold} onCheckedChange={(v) => { set({ bold: v }); onCommit(); }} /> Bold
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={!!el.italic} onCheckedChange={(v) => { set({ italic: v }); onCommit(); }} /> Italic
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={!!el.underline} onCheckedChange={(v) => { set({ underline: v }); onCommit(); }} /> Underline
            </label>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Vertical align</Label>
            <Select className="h-8" value={el.valign || "top"} onChange={(e) => { set({ valign: e.target.value as any }); onCommit(); }}>
              <option value="top">Top</option>
              <option value="middle">Middle</option>
              <option value="bottom">Bottom</option>
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={el.wrap !== false} onCheckedChange={(v) => { set({ wrap: v }); onCommit(); }} /> Wrap
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={!!el.autoFit} onCheckedChange={(v) => { set({ autoFit: v }); onCommit(); }} /> Auto-fit
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <NumField label="Line height" value={el.lineHeight ?? 1.18} onChange={(v) => set({ lineHeight: Math.max(0.5, v) })} step={0.05} min={0.5} />
            <NumField label="Tracking (pt)" value={el.letterSpacing ?? 0} onChange={(v) => set({ letterSpacing: v })} step={0.5} />
          </div>
          <ColorField label="Color" value={el.color || "#000000"} onChange={(v) => set({ color: v })} onCommit={onCommit} />
        </section>
      )}

      {/* QR / barcode */}
      {(el.type === "qrcode" || el.type === "barcode") && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Data binding</h4>
            <BindingTokenPicker target={target} customKeys={customKeys} mode="replace" onPick={(t) => { set({ binding: t }); onCommit(); }} label="Pick" />
          </div>
          <Input
            value={el.binding || ""}
            onChange={(e) => set({ binding: e.target.value })}
            onBlur={onCommit}
            placeholder="e.g. item.url"
            className="h-8 font-mono text-xs"
          />
          {el.type === "barcode" && (
            <div className="space-y-1">
              <Label className="text-xs">Symbology</Label>
              <Select className="h-8" value={el.symbology || "code128"} onChange={(e) => { set({ symbology: e.target.value }); onCommit(); }}>
                {SYMBOLOGIES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </section>
      )}

      {/* Image */}
      {el.type === "image" && (
        <section className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Image</h4>
          {el.src && (
            <div className="overflow-hidden rounded-md border border-border bg-white p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={el.src} alt="" className="mx-auto max-h-24 object-contain" />
            </div>
          )}
          <label>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f);
                e.target.value = "";
              }}
            />
            <Button type="button" variant="outline" size="sm" className="w-full" asChild>
              <span>
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {uploading ? "Uploading…" : "Upload image"}
              </span>
            </Button>
          </label>
          <div className="space-y-1">
            <Label className="text-xs">Or image URL</Label>
            <Input value={el.src || ""} onChange={(e) => set({ src: e.target.value })} onBlur={onCommit} placeholder="/uploads/...png" className="h-8 text-xs" />
          </div>
        </section>
      )}

      {/* Rect / ellipse / line / arrow */}
      {(el.type === "rect" || el.type === "ellipse" || el.type === "line" || el.type === "arrow") && (
        <section className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Stroke & fill</h4>
          <ColorField label="Stroke" value={el.stroke || "#000000"} onChange={(v) => set({ stroke: v })} onCommit={onCommit} />
          {(el.type === "rect" || el.type === "ellipse") && (
            <div className="space-y-1">
              <Label className="text-xs">Fill</Label>
              <div className="flex items-center gap-2">
                <Select
                  className="h-8"
                  value={el.fill && el.fill !== "none" ? "color" : "none"}
                  onChange={(e) => { set({ fill: e.target.value === "none" ? "none" : "#000000" }); onCommit(); }}
                >
                  <option value="none">No fill</option>
                  <option value="color">Solid color</option>
                </Select>
                {el.fill && el.fill !== "none" && (
                  <input
                    type="color"
                    value={el.fill}
                    onChange={(e) => set({ fill: e.target.value })}
                    onBlur={onCommit}
                    className="h-8 w-10 cursor-pointer rounded border border-input bg-background"
                  />
                )}
              </div>
            </div>
          )}
          <NumField label="Stroke width (mm)" value={el.strokeWidth ?? 0.3} onChange={(v) => set({ strokeWidth: Math.max(0, v) })} step={0.1} min={0} />
        </section>
      )}
    </div>
  );
}

function AlignBtn({
  title,
  icon: Icon,
  onClick,
}: {
  title: string;
  icon: React.ElementType;
  onClick: () => void;
}) {
  return (
    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title={`Align ${title}`} onClick={onClick}>
      <Icon className="h-3.5 w-3.5" />
    </Button>
  );
}

function ColorField({
  label,
  value,
  onChange,
  onCommit,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onCommit}
          className="h-8 w-10 cursor-pointer rounded border border-input bg-background"
        />
        <Input value={value} onChange={(e) => onChange(e.target.value)} onBlur={onCommit} className="h-8 font-mono text-xs" />
      </div>
    </div>
  );
}
