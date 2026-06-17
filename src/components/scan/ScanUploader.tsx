"use client";

import * as React from "react";
import { Upload, ImageIcon, ScanLine, X, FileWarning } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SelectField } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { BoxOption, OcrResult, ParseResponse, ParsedRow } from "./types";

type Phase = "idle" | "ocr" | "parsing";

export function ScanUploader({
  boxes,
  onParsed,
}: {
  boxes: BoxOption[];
  onParsed: (box: BoxOption, rows: ParsedRow[], ocr: OcrResult) => void;
}) {
  const [boxId, setBoxId] = React.useState<string>(boxes[0]?.id ?? "");
  const [file, setFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [dragOver, setDragOver] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const busy = phase !== "idle";
  const selected = boxes.find((b) => b.id === boxId) ?? null;

  React.useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function pickFile(f: File | null) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (!f) {
      setFile(null);
      setPreviewUrl(null);
      return;
    }
    if (!f.type.startsWith("image/")) {
      toast.error("Please choose an image file (photo or scan).");
      return;
    }
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) pickFile(f);
  }

  async function handleScan() {
    if (!file || !boxId) return;

    // 1) OCR the image.
    setPhase("ocr");
    let ocr: OcrResult;
    try {
      const fd = new FormData();
      fd.append("image", file);
      const res = await fetch("/api/ocr", { method: "POST", body: fd, cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        const msg = json?.error || `OCR failed (${res.status})`;
        // 503 = engine unavailable / degraded — surface a friendly explanation.
        toast.error({
          title: res.status === 503 ? "OCR is unavailable right now" : "OCR failed",
          description: msg,
        });
        setPhase("idle");
        return;
      }
      ocr = json.data as OcrResult;
    } catch (err) {
      toast.error({
        title: "OCR request failed",
        description: err instanceof Error ? err.message : "Network error.",
      });
      setPhase("idle");
      return;
    }

    if (!ocr.text || ocr.text.trim().length === 0) {
      toast.warning({
        title: "No text recognized",
        description: "The scan came back empty. Try a sharper, higher-contrast image.",
      });
      setPhase("idle");
      return;
    }

    // 2) Match the recognized text back to the box's items.
    setPhase("parsing");
    try {
      const res = await fetch("/api/checklist/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boxId, text: ocr.text, lines: ocr.lines.map((l) => l.text) }),
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new ApiError(json?.error || `Parse failed (${res.status})`, res.status);
      }
      const parsed = json.data as ParseResponse;
      const matched = parsed.rows.filter((r) => r.matchedBy !== "none").length;
      toast.success({
        title: "Scan processed",
        description: `Matched ${matched} of ${parsed.rows.length} item${
          parsed.rows.length === 1 ? "" : "s"
        }. Review below.`,
      });
      if (selected) onParsed(selected, parsed.rows, ocr);
    } catch (err) {
      toast.error({
        title: "Could not match the scan",
        description: err instanceof ApiError ? err.message : "Unexpected error.",
      });
    } finally {
      setPhase("idle");
    }
  }

  if (boxes.length === 0) {
    return (
      <EmptyState
        icon={FileWarning}
        title="No boxes available"
        description="Create a box and assign items to it before scanning count sheets."
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ScanLine className="h-5 w-5 text-primary" />
          Scan a filled count sheet
        </CardTitle>
        <CardDescription>
          Upload a photo or scan of a sheet you counted. We&apos;ll run OCR and match each line to an
          item so you can review and apply the new quantities.
          <span className="mt-1 block font-medium text-foreground">
            Handwriting OCR is best-effort — always review before applying.
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <SelectField
          label="Which box is this sheet for?"
          value={boxId}
          onChange={(e) => setBoxId(e.target.value)}
          disabled={busy}
          hint={
            selected
              ? `Matching against ${selected.itemCount} item${selected.itemCount === 1 ? "" : "s"}`
              : undefined
          }
        >
          {boxes.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
              {b.location ? ` — ${b.location}` : ""} ({b.itemCount})
            </option>
          ))}
        </SelectField>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={cn(
            "relative flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors",
            dragOver ? "border-primary bg-primary/5" : "border-border bg-muted/30",
          )}
        >
          {previewUrl ? (
            <div className="w-full space-y-3">
              <div className="relative mx-auto max-w-md overflow-hidden rounded-md border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewUrl} alt="Sheet preview" className="max-h-72 w-full object-contain" />
                <button
                  type="button"
                  onClick={() => pickFile(null)}
                  disabled={busy}
                  className="absolute right-2 top-2 rounded-full bg-background/90 p-1 text-foreground shadow disabled:opacity-50"
                  aria-label="Remove image"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <ImageIcon className="h-4 w-4" />
                {file?.name}
                {file && <Badge variant="outline">{(file.size / 1024).toFixed(0)} KB</Badge>}
              </p>
            </div>
          ) : (
            <>
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Upload className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  Drop an image here, or choose a file
                </p>
                <p className="text-xs text-muted-foreground">PNG or JPG, up to 20MB.</p>
              </div>
            </>
          )}

          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            {previewUrl ? "Choose a different image" : "Choose image"}
          </Button>
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {phase === "ocr"
              ? "Reading the image with OCR… this can take a moment."
              : phase === "parsing"
                ? "Matching recognized text to items…"
                : "Ready when you are."}
          </p>
          <Button onClick={handleScan} disabled={busy || !file || !boxId}>
            {busy ? <Spinner size={16} /> : <ScanLine className="h-4 w-4" />}
            {phase === "ocr" ? "Running OCR…" : phase === "parsing" ? "Matching…" : "Scan & match"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
