"use client";

import * as React from "react";
import { FileText, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";

export interface ExportFilters {
  supplierId?: string | null;
  onlyBelowMin?: boolean;
}

export interface ExportButtonsProps {
  filters: ExportFilters;
  /** When false, buttons render disabled (no reports.export permission). */
  canExport: boolean;
}

function buildExportUrl(format: "pdf" | "xlsx", filters: ExportFilters): string {
  const params = new URLSearchParams({ format });
  if (filters.supplierId && filters.supplierId !== "all") {
    params.set("supplierId", filters.supplierId);
  }
  if (filters.onlyBelowMin) params.set("onlyBelowMin", "1");
  return `/api/reports/export?${params.toString()}`;
}

export function ExportButtons({ filters, canExport }: ExportButtonsProps) {
  const [busy, setBusy] = React.useState<null | "pdf" | "xlsx">(null);

  async function download(format: "pdf" | "xlsx") {
    if (!canExport || busy) return;
    setBusy(format);
    try {
      const res = await fetch(buildExportUrl(format, filters), { cache: "no-store" });
      if (!res.ok) {
        let message = `Export failed (${res.status})`;
        try {
          const json = await res.json();
          if (json?.error) message = json.error;
        } catch {
          /* non-JSON error body */
        }
        throw new Error(message);
      }

      const blob = await res.blob();

      // Derive filename from Content-Disposition, falling back to a sensible default.
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = /filename="?([^"]+)"?/.exec(disposition);
      const filename = match?.[1] ?? `reorder-report.${format}`;

      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoke after a tick so the download has a chance to start.
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);

      toast.success({ title: `${format.toUpperCase()} exported`, description: filename });
    } catch (err) {
      toast.error({
        title: "Export failed",
        description: err instanceof Error ? err.message : "Could not generate the file.",
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        onClick={() => download("pdf")}
        disabled={!canExport || busy !== null}
        title={canExport ? "Download as PDF" : "You do not have permission to export"}
      >
        {busy === "pdf" ? <Spinner size={16} /> : <FileText className="h-4 w-4" />}
        Export PDF
      </Button>
      <Button
        variant="outline"
        onClick={() => download("xlsx")}
        disabled={!canExport || busy !== null}
        title={canExport ? "Download as Excel" : "You do not have permission to export"}
      >
        {busy === "xlsx" ? <Spinner size={16} /> : <FileSpreadsheet className="h-4 w-4" />}
        Export Excel
      </Button>
    </div>
  );
}
