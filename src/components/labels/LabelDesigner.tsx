"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Save,
  ZoomIn,
  ZoomOut,
  Grid3x3,
  Magnet,
  Eye,
  EyeOff,
  Printer,
  Download,
  ArrowLeft,
  Trash2,
  Loader2,
  Undo2,
  Redo2,
  BringToFront,
  SendToBack,
  ChevronUp,
  ChevronDown,
  Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { usePermissions } from "@/components/shell/permission-context";
import { cn, cuidish, clamp } from "@/lib/utils";
import {
  normalizeContent,
  type ElementType,
  type LabelContent,
  type LabelElement,
  type LabelTargetKind,
} from "@/lib/labels/types";
import type { EntityData } from "@/lib/labels/bindings";
import { sampleEntity } from "@/lib/labels/bindings";
import { LabelCanvas } from "./LabelCanvas";
import { ElementPalette } from "./ElementPalette";
import { PropertyPanel } from "./PropertyPanel";
import { LayerList } from "./LayerList";
import type { LabelTemplateDTO } from "./types";

function newElement(type: ElementType, widthMm: number, heightMm: number): LabelElement {
  const id = cuidish();
  const base = { id, type, x: 2, y: 2, w: Math.min(20, widthMm - 4), h: Math.min(10, heightMm - 4) };
  switch (type) {
    case "text":
      return { ...base, w: Math.min(30, widthMm - 4), h: 8, text: "Text", fontSize: 10, align: "left", color: "#000000" };
    case "qrcode":
      return { ...base, w: Math.min(heightMm - 4, 22), h: Math.min(heightMm - 4, 22), binding: "item.url" };
    case "barcode":
      return { ...base, w: Math.min(40, widthMm - 4), h: 10, binding: "item.partNumber", symbology: "code128" };
    case "image":
      return { ...base, w: 18, h: 18 };
    case "rect":
      return { ...base, w: Math.min(20, widthMm - 4), h: 10, stroke: "#000000", fill: "none", strokeWidth: 0.3 };
    case "ellipse":
      return { ...base, w: Math.min(20, widthMm - 4), h: Math.min(20, heightMm - 4), stroke: "#000000", fill: "none", strokeWidth: 0.3 };
    case "line":
      return { ...base, w: Math.min(30, widthMm - 4), h: 2, stroke: "#000000", strokeWidth: 0.3 };
    case "arrow":
      return { ...base, w: Math.min(30, widthMm - 4), h: 6, stroke: "#000000", strokeWidth: 0.4 };
    default:
      return base as LabelElement;
  }
}

export function LabelDesigner({ template, customKeys: initialCustomKeys = [] }: { template: LabelTemplateDTO; customKeys?: string[] }) {
  const router = useRouter();
  const { can } = usePermissions();
  const canDesign = can("labels.design");
  const canPrint = can("labels.print");

  const initial = normalizeContent(template.content);
  const [name, setName] = React.useState(template.name);
  const [content, setContent] = React.useState<LabelContent>(initial);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [dirty, setDirty] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  // viewport
  const [zoom, setZoom] = React.useState(() => initialZoom(template.widthMm));
  const [gridMm, setGridMm] = React.useState(2);
  const [snap, setSnap] = React.useState(true);
  const [showGrid, setShowGrid] = React.useState(true);
  const [preview, setPreview] = React.useState(true);

  // sample data for preview
  const [entity, setEntity] = React.useState<EntityData | null>(() => sampleEntity(template.target));
  const [sampleOptions, setSampleOptions] = React.useState<{ id: string; label: string }[]>([]);
  const [sampleId, setSampleId] = React.useState<string>("");
  const [customKeys, setCustomKeys] = React.useState<string[]>(initialCustomKeys);

  const widthMm = template.widthMm;
  const heightMm = template.heightMm;
  const target = template.target as LabelTargetKind;

  const selected = content.elements.find((e) => e.id === selectedId) ?? null;

  // Load sample entity options once.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<{ options: { id: string; label: string }[]; data: EntityData }>(
          `/api/labels/sample?target=${target}`,
        );
        if (cancelled) return;
        setSampleOptions(res.options);
        setEntity(res.data);
        deriveCustomKeys(res.data);
      } catch {
        /* sample data falls back to local sampleEntity */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  function deriveCustomKeys(data: EntityData) {
    const keys = data.item?.custom ? Object.keys(data.item.custom) : [];
    if (keys.length) setCustomKeys((prev) => Array.from(new Set([...prev, ...keys])));
  }

  async function loadSample(id: string) {
    setSampleId(id);
    try {
      const res = await api.get<{ data: EntityData }>(`/api/labels/sample?target=${target}${id ? `&id=${id}` : ""}`);
      setEntity(res.data);
      deriveCustomKeys(res.data);
    } catch (err: any) {
      toast.error({ title: "Could not load sample", description: err?.message });
    }
  }

  // Always-current snapshot of content, read by event handlers and by the
  // history helpers so they can capture state without a side effect inside a
  // setState updater (E-3) and without stale closures (E-11).
  const contentRef = React.useRef(content);
  React.useEffect(() => {
    contentRef.current = content;
  }, [content]);

  // ---- undo/redo history ----
  const pastRef = React.useRef<LabelContent[]>([]);
  const futureRef = React.useRef<LabelContent[]>([]);
  const sessionRef = React.useRef(false);
  const clipboardRef = React.useRef<LabelElement | null>(null);
  // E-7: real state for the undo/redo enabled flags (replaces reading refs in
  // render + a manual forceTick). hist mirrors the past/future stack depths and
  // is updated in one place (syncHist) wherever those stacks change.
  const [hist, setHist] = React.useState({ past: 0, future: 0 });
  const syncHist = () => setHist({ past: pastRef.current.length, future: futureRef.current.length });

  const markDirty = () => setDirty(true);
  const cloneContent = (c: LabelContent): LabelContent => JSON.parse(JSON.stringify(c));
  function pushPast(c: LabelContent) {
    pastRef.current.push(cloneContent(c));
    if (pastRef.current.length > 60) pastRef.current.shift();
    futureRef.current = [];
  }

  // Atomic, undoable mutation. E-3: snapshot the pre-state from contentRef
  // OUTSIDE the setState updater so the updater stays pure (no ref mutation /
  // side effects inside it).
  function apply(fn: (c: LabelContent) => LabelContent) {
    pushPast(contentRef.current);
    setContent((c) => fn(c));
    markDirty();
    sessionRef.current = false;
    syncHist();
  }

  // For continuous edits (drag / typing): snapshot once at the start of a session.
  function beginEditSession() {
    if (sessionRef.current) return;
    sessionRef.current = true;
    pushPast(contentRef.current); // E-3: snapshot outside any updater.
    syncHist();
  }
  function endEditSession() {
    sessionRef.current = false;
  }
  function patchLive(id: string, patch: Partial<LabelElement>) {
    setContent((c) => ({ ...c, elements: c.elements.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));
    markDirty();
  }

  function undo() {
    if (pastRef.current.length === 0) return;
    // E-3: mutate the history stacks here, not inside the updater.
    futureRef.current.push(cloneContent(contentRef.current));
    const prev = pastRef.current.pop()!;
    setContent(prev);
    markDirty();
    sessionRef.current = false;
    syncHist();
  }
  function redo() {
    if (futureRef.current.length === 0) return;
    pastRef.current.push(cloneContent(contentRef.current));
    const next = futureRef.current.pop()!;
    setContent(next);
    markDirty();
    sessionRef.current = false;
    syncHist();
  }

  // ---- element mutation helpers ----
  function addElement(type: ElementType) {
    const el = newElement(type, widthMm, heightMm);
    apply((c) => ({ ...c, elements: [...c.elements, el] }));
    setSelectedId(el.id);
  }

  function deleteElement(id: string) {
    apply((c) => ({ ...c, elements: c.elements.filter((e) => e.id !== id) }));
    if (selectedId === id) setSelectedId(null);
  }

  function toggleHidden(id: string) {
    apply((c) => ({ ...c, elements: c.elements.map((e) => (e.id === id ? { ...e, hidden: !e.hidden } : e)) }));
  }

  function reorderLayers(ids: string[]) {
    apply((c) => {
      const map = new Map(c.elements.map((e) => [e.id, e]));
      return { ...c, elements: ids.map((id) => map.get(id)!).filter(Boolean) };
    });
  }

  function setBackground(hex: string) {
    apply((c) => ({ ...c, background: hex }));
  }

  // ---- z-order ----
  function bringToFront(id: string) {
    apply((c) => {
      const el = c.elements.find((e) => e.id === id);
      if (!el) return c;
      return { ...c, elements: [...c.elements.filter((e) => e.id !== id), el] };
    });
  }
  function sendToBack(id: string) {
    apply((c) => {
      const el = c.elements.find((e) => e.id === id);
      if (!el) return c;
      return { ...c, elements: [el, ...c.elements.filter((e) => e.id !== id)] };
    });
  }
  function bringForward(id: string) {
    apply((c) => {
      const i = c.elements.findIndex((e) => e.id === id);
      if (i < 0 || i === c.elements.length - 1) return c;
      const arr = [...c.elements];
      [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
      return { ...c, elements: arr };
    });
  }
  function sendBackward(id: string) {
    apply((c) => {
      const i = c.elements.findIndex((e) => e.id === id);
      if (i <= 0) return c;
      const arr = [...c.elements];
      [arr[i], arr[i - 1]] = [arr[i - 1], arr[i]];
      return { ...c, elements: arr };
    });
  }

  // ---- copy / paste / duplicate ----
  function placedCopy(src: LabelElement): LabelElement {
    return {
      ...JSON.parse(JSON.stringify(src)),
      id: cuidish(),
      x: clamp(src.x + 2, 0, Math.max(0, widthMm - src.w)),
      y: clamp(src.y + 2, 0, Math.max(0, heightMm - src.h)),
    };
  }
  function duplicateElement(id: string) {
    const src = content.elements.find((e) => e.id === id);
    if (!src) return;
    const copy = placedCopy(src);
    apply((c) => ({ ...c, elements: [...c.elements, copy] }));
    setSelectedId(copy.id);
  }
  function copySelected() {
    if (selected) clipboardRef.current = JSON.parse(JSON.stringify(selected));
  }
  function paste() {
    if (!clipboardRef.current) return;
    const copy = placedCopy(clipboardRef.current);
    apply((c) => ({ ...c, elements: [...c.elements, copy] }));
    setSelectedId(copy.id);
  }

  // ---- keyboard: nudge / delete ----
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!selectedId) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;
      const el = contentRef.current.elements.find((x) => x.id === selectedId);
      if (!el) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteElement(selectedId);
        return;
      }
      const step = e.shiftKey ? gridMm || 1 : 0.5;
      let dx = 0;
      let dy = 0;
      if (e.key === "ArrowLeft") dx = -step;
      else if (e.key === "ArrowRight") dx = step;
      else if (e.key === "ArrowUp") dy = -step;
      else if (e.key === "ArrowDown") dy = step;
      else return;
      e.preventDefault();
      beginEditSession();
      // E-11: clamp the upper bound to Math.max(0, ...) so an element wider/taller
      // than the tape (negative dim-el.w) doesn't get forced to a negative
      // coordinate — matching placedCopy's guard at lines above.
      patchLive(selectedId, {
        x: clamp(Math.round((el.x + dx) * 100) / 100, 0, Math.max(0, widthMm - el.w)),
        y: clamp(Math.round((el.y + dy) * 100) / 100, 0, Math.max(0, heightMm - el.h)),
      });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // E-11: read the latest elements via a ref so the listener binds once per
    // selection/dimension change instead of re-binding every drag frame (when
    // content.elements gets a fresh reference from patchLive).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, gridMm, widthMm, heightMm]);

  // End any open edit session when the selection changes.
  React.useEffect(() => {
    sessionRef.current = false;
  }, [selectedId]);

  // ---- keyboard: undo/redo, copy/paste, duplicate ----
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const target = e.target as HTMLElement;
      const inField =
        target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      const k = e.key.toLowerCase();
      if (k === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (k === "y") {
        e.preventDefault();
        redo();
      } else if (k === "c" && !inField && selectedId) {
        e.preventDefault();
        copySelected();
      } else if (k === "v" && !inField) {
        e.preventDefault();
        paste();
      } else if (k === "d" && !inField && selectedId) {
        e.preventDefault();
        duplicateElement(selectedId);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, content.elements]);

  // ---- save ----
  async function save() {
    if (!canDesign) return;
    setSaving(true);
    try {
      await api.patch(`/api/labels/${template.id}`, { name, content });
      setDirty(false);
      toast.success("Label saved");
      router.refresh();
    } catch (err: any) {
      toast.error({ title: "Save failed", description: err?.message });
    } finally {
      setSaving(false);
    }
  }

  function openPdf(download = false) {
    const params = new URLSearchParams({ templateId: template.id, target, format: "pdf" });
    if (sampleId) params.set("id", sampleId);
    else params.set("sample", "1");
    if (download) params.set("download", "1");
    window.open(`/api/labels/render?${params.toString()}`, "_blank", "noopener");
  }

  const sizeReadout = `${widthMm} × ${heightMm} mm${template.tapeName ? ` · ${template.tapeName}` : ""}`;

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-2">
        <Button variant="ghost" size="sm" onClick={() => router.push("/labels")} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" /> Labels
        </Button>
        <Input
          value={name}
          onChange={(e) => { setName(e.target.value); markDirty(); }}
          disabled={!canDesign}
          className="h-8 w-48"
          aria-label="Template name"
        />
        <span className="hidden text-xs text-muted-foreground sm:inline">{sizeReadout}</span>

        <div className="mx-1 h-6 w-px bg-border" />

        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoom((z) => clamp(z - 0.5, 1, 12))} aria-label="Zoom out">
          <ZoomOut className="h-4 w-4" />
        </Button>
        <span className="w-12 text-center text-xs tabular-nums text-muted-foreground">{Math.round(zoom * 100 / 4)}%</span>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoom((z) => clamp(z + 0.5, 1, 12))} aria-label="Zoom in">
          <ZoomIn className="h-4 w-4" />
        </Button>

        <Button
          variant={showGrid ? "secondary" : "ghost"}
          size="icon"
          className="h-8 w-8"
          onClick={() => setShowGrid((v) => !v)}
          aria-label="Toggle grid"
          title="Toggle grid"
        >
          <Grid3x3 className="h-4 w-4" />
        </Button>
        <Button
          variant={snap ? "secondary" : "ghost"}
          size="icon"
          className="h-8 w-8"
          onClick={() => setSnap((v) => !v)}
          aria-label="Toggle snap to grid"
          title="Snap to grid"
        >
          <Magnet className="h-4 w-4" />
        </Button>
        <Button
          variant={preview ? "secondary" : "ghost"}
          size="sm"
          className="gap-1.5"
          onClick={() => setPreview((v) => !v)}
          title="Toggle live binding preview"
        >
          {preview ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          Preview
        </Button>

        <div className="mx-1 h-6 w-px bg-border" />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={undo}
          disabled={hist.past === 0}
          aria-label="Undo"
          title="Undo (⌘/Ctrl+Z)"
        >
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={redo}
          disabled={hist.future === 0}
          aria-label="Redo"
          title="Redo (⇧⌘/Ctrl+Z)"
        >
          <Redo2 className="h-4 w-4" />
        </Button>

        <div className="ml-auto flex items-center gap-2">
          {canPrint && (
            <>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => openPdf(false)}>
                <Printer className="h-4 w-4" /> Print
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openPdf(true)} aria-label="Download PDF" title="Download PDF">
                <Download className="h-4 w-4" />
              </Button>
            </>
          )}
          {canDesign && (
            <Button size="sm" className="gap-1.5" onClick={save} disabled={saving || !dirty}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {dirty ? "Save" : "Saved"}
            </Button>
          )}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[230px_1fr_290px]">
        {/* Left: palette + layers */}
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
          <Card className="p-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Add element</h3>
            <ElementPalette onAdd={addElement} disabled={!canDesign} />
          </Card>
          <Card className="p-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Layers</h3>
            <LayerList
              elements={content.elements}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onReorder={reorderLayers}
              onToggleHidden={toggleHidden}
              onDelete={deleteElement}
            />
          </Card>
          <Card className="space-y-2 p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Canvas</h3>
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs">Background</Label>
              <input type="color" value={content.background} onChange={(e) => setBackground(e.target.value)} className="h-7 w-9 cursor-pointer rounded border border-input bg-background" />
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs">Grid (mm)</Label>
              <Input type="number" min={0.5} step={0.5} value={gridMm} onChange={(e) => setGridMm(Math.max(0.5, Number(e.target.value)))} className="h-7 w-20" />
            </div>
          </Card>
        </div>

        {/* Center: canvas */}
        <div className="flex min-h-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs">
            <span className="text-muted-foreground">Preview data:</span>
            <Select className="h-7 w-56" value={sampleId} onChange={(e) => loadSample(e.target.value)} disabled={!preview}>
              <option value="">Sample {target.toLowerCase()}</option>
              {sampleOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </Select>
            {selected && canDesign && (
              <div className="ml-auto flex items-center gap-0.5">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => bringToFront(selected.id)} title="Bring to front">
                  <BringToFront className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => bringForward(selected.id)} title="Bring forward">
                  <ChevronUp className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => sendBackward(selected.id)} title="Send backward">
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => sendToBack(selected.id)} title="Send to back">
                  <SendToBack className="h-3.5 w-3.5" />
                </Button>
                <div className="mx-1 h-5 w-px bg-border" />
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => duplicateElement(selected.id)} title="Duplicate (⌘/Ctrl+D)">
                  <Copy className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteElement(selected.id)} title="Delete (Del)">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-lg border border-border bg-muted/40 p-6 [background-image:radial-gradient(circle,theme(colors.border)_1px,transparent_1px)] [background-size:16px_16px]">
            <LabelCanvas
              elements={content.elements}
              widthMm={widthMm}
              heightMm={heightMm}
              background={content.background}
              zoom={zoom}
              gridMm={gridMm}
              snap={snap}
              showGrid={showGrid}
              selectedId={selectedId}
              entity={entity}
              preview={preview}
              onSelect={setSelectedId}
              onBeginEdit={beginEditSession}
              onChange={(id, patch) => patchLive(id, patch)}
              onCommit={() => {
                endEditSession();
                markDirty();
              }}
            />
          </div>
        </div>

        {/* Right: property panel */}
        <div className="min-h-0 overflow-y-auto">
          <Card className="p-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {selected ? `${selected.type} properties` : "Properties"}
            </h3>
            <PropertyPanel
              element={selected}
              target={target}
              customKeys={customKeys}
              widthMm={widthMm}
              heightMm={heightMm}
              onChange={(patch) => {
                if (selected) {
                  beginEditSession();
                  patchLive(selected.id, patch);
                }
              }}
              onCommit={() => {
                endEditSession();
                markDirty();
              }}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}

function initialZoom(widthMm: number): number {
  // px per mm so the tape comfortably fits a ~640px canvas column.
  const target = 620 / Math.max(widthMm, 1);
  return clamp(Math.round(target * 2) / 2, 2, 8);
}
