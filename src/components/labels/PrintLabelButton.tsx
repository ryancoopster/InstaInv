"use client";

import * as React from "react";
import { Printer, Loader2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { toast } from "@/components/ui/toast";
import { usePermissions } from "@/components/shell/permission-context";
import type { LabelTargetKind } from "@/lib/labels/types";
import type { LabelTemplateDTO } from "./types";

// Reusable "Print label" action for item / drawer / box / bin contexts.
// Other modules (items, boxes) import this. It loads templates for the target,
// lets the user pick one (default pre-selected) and opens the rendered PDF so
// the browser print dialog can print it.
//
// Direct silent printing isn't possible from the browser — see
// src/lib/labels/print-agent.ts for the future local-agent integration.
export function PrintLabelButton({
  target,
  entityId,
  variant = "outline",
  size = "sm",
  label = "Print label",
  className,
}: {
  target: LabelTargetKind;
  entityId: string;
  variant?: "default" | "secondary" | "outline" | "ghost" | "destructive" | "link";
  size?: "sm" | "default" | "lg" | "icon";
  label?: string;
  className?: string;
}) {
  const { can } = usePermissions();
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [templates, setTemplates] = React.useState<LabelTemplateDTO[]>([]);
  const [selectedId, setSelectedId] = React.useState<string>("");

  if (!can("labels.print")) return null;

  async function load() {
    setLoading(true);
    try {
      const all = await api.get<LabelTemplateDTO[]>("/api/labels");
      const forTarget = all.filter((t) => t.target === target);
      setTemplates(forTarget);
      const def = forTarget.find((t) => t.isDefault) ?? forTarget[0];
      setSelectedId(def?.id ?? "");
    } catch (err: any) {
      toast.error({ title: "Could not load templates", description: err?.message });
    } finally {
      setLoading(false);
    }
  }

  function openDialog() {
    setOpen(true);
    void load();
  }

  function render(download: boolean) {
    if (!selectedId) {
      toast.error("Select a template first");
      return;
    }
    const params = new URLSearchParams({ templateId: selectedId, target, id: entityId, format: "pdf" });
    if (download) params.set("download", "1");
    window.open(`/api/labels/render?${params.toString()}`, "_blank", "noopener");
  }

  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={openDialog}>
        <Printer className="h-4 w-4" />
        {size !== "icon" && label}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Print label</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading templates…
              </div>
            ) : templates.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No {target.toLowerCase()} label templates exist yet. Create one in the Labels designer.
              </p>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="print-tpl">Template</Label>
                <Select id="print-tpl" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {t.isDefault ? " (default)" : ""} — {t.tapeName || `${t.widthMm}×${t.heightMm}mm`}
                    </option>
                  ))}
                </Select>
                <p className="text-xs text-muted-foreground">
                  Opens the rendered PDF in a new tab; use your browser's print dialog and select your Brother printer + media.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => render(true)} disabled={!selectedId} className="gap-1.5">
              <Download className="h-4 w-4" /> Download PDF
            </Button>
            <Button onClick={() => render(false)} disabled={!selectedId} className="gap-1.5">
              <Printer className="h-4 w-4" /> Open & print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
