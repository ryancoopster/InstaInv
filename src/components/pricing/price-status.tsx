"use client";

import { Badge } from "@/components/ui/badge";
import type { PriceFetchStatus } from "@/lib/pricing/types";

// Map a fetch status to a Badge variant + label.
const STATUS_META: Record<
  PriceFetchStatus,
  { variant: "success" | "destructive" | "warning" | "secondary"; label: string }
> = {
  ok: { variant: "success", label: "OK" },
  error: { variant: "destructive", label: "Error" },
  unsupported: { variant: "warning", label: "Unsupported" },
  pending: { variant: "secondary", label: "Pending" },
};

export function PriceStatusBadge({ status }: { status: PriceFetchStatus | null | undefined }) {
  if (!status) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }
  const meta = STATUS_META[status] ?? STATUS_META.pending;
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

// Small colored dot used in dense rows where a full badge is too heavy.
const DOT_COLOR: Record<PriceFetchStatus, string> = {
  ok: "bg-success",
  error: "bg-destructive",
  unsupported: "bg-warning",
  pending: "bg-muted-foreground",
};

export function PriceStatusDot({ status }: { status: PriceFetchStatus | null | undefined }) {
  if (!status) return null;
  const color = DOT_COLOR[status] ?? DOT_COLOR.pending;
  return (
    <span
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${color}`}
      title={STATUS_META[status]?.label ?? status}
      aria-label={`Price status: ${STATUS_META[status]?.label ?? status}`}
    />
  );
}

// Compact relative time (e.g. "5m ago", "3h ago", "2d ago"). Returns "Never"
// for a missing timestamp.
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "Never";
  const diffMs = Date.now() - then;
  if (diffMs < 0) return "just now";
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.round(mo / 12)}y ago`;
}
