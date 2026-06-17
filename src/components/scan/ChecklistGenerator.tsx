"use client";

import * as React from "react";
import { Download, FileText, Printer, Boxes } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SelectField } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "@/components/ui/toast";
import type { BoxOption } from "./types";

export function ChecklistGenerator({ boxes }: { boxes: BoxOption[] }) {
  const [boxId, setBoxId] = React.useState<string>(boxes[0]?.id ?? "");
  const [busy, setBusy] = React.useState(false);
  const selected = boxes.find((b) => b.id === boxId) ?? null;

  async function fetchPdf(): Promise<Blob | null> {
    const res = await fetch(`/api/checklist/${boxId}`, { cache: "no-store" });
    if (!res.ok) {
      let message = `Failed to generate sheet (${res.status})`;
      try {
        const j = await res.json();
        if (j?.error) message = j.error;
      } catch {
        /* non-json */
      }
      toast.error({ title: "Could not generate count sheet", description: message });
      return null;
    }
    return res.blob();
  }

  async function handleDownload() {
    if (!boxId) return;
    setBusy(true);
    try {
      const blob = await fetchPdf();
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `count-sheet-${(selected?.name || "box").replace(/[^a-z0-9_-]+/gi, "-").toLowerCase()}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Count sheet downloaded");
    } finally {
      setBusy(false);
    }
  }

  async function handlePrint() {
    if (!boxId) return;
    setBusy(true);
    try {
      const blob = await fetchPdf();
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      // Open the PDF in a new tab; the browser's print dialog handles the rest.
      const win = window.open(url, "_blank");
      if (!win) {
        toast.warning({
          title: "Pop-up blocked",
          description: "Allow pop-ups to open the printable sheet, or use Download.",
        });
      }
      // Revoke later so the new tab has time to load.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } finally {
      setBusy(false);
    }
  }

  if (boxes.length === 0) {
    return (
      <EmptyState
        icon={Boxes}
        title="No boxes to count"
        description="Create a box with drawers and assign items to it, then come back to print a count sheet."
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          Generate a printable count sheet
        </CardTitle>
        <CardDescription>
          Pick a box to produce a PDF listing every item in it, with a wide write-in box for the
          counted quantity and a scannable code per row to speed up matching later.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <SelectField
            label="Box"
            value={boxId}
            onChange={(e) => setBoxId(e.target.value)}
            hint={
              selected
                ? `${selected.itemCount} item${selected.itemCount === 1 ? "" : "s"}${
                    selected.location ? ` • ${selected.location}` : ""
                  }`
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
          <div className="flex gap-2">
            <Button onClick={handleDownload} disabled={busy || !boxId}>
              {busy ? <Spinner size={16} /> : <Download className="h-4 w-4" />}
              Download PDF
            </Button>
            <Button variant="outline" onClick={handlePrint} disabled={busy || !boxId}>
              <Printer className="h-4 w-4" />
              Print
            </Button>
          </div>
        </div>

        {selected && selected.itemCount === 0 && (
          <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground">
            This box has no items assigned to its drawers yet — the sheet will be blank.
          </p>
        )}

        <div className="rounded-md border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">How it works</p>
          <ol className="mt-1 list-decimal space-y-0.5 pl-5">
            <li>Download or print the sheet and walk the box, writing the counted quantity in each box.</li>
            <li>Photograph or scan the filled sheet.</li>
            <li>Use the <span className="font-medium text-foreground">Scan &amp; apply</span> tab to read it back and update quantities.</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}
