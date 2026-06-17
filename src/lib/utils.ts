import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number | string | null | undefined, currency = "USD") {
  const n = typeof value === "string" ? parseFloat(value) : value ?? 0;
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number.isFinite(n) ? (n as number) : 0);
}

export function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat("en-US").format(value ?? 0);
}

// Quantity needed to restock to the desired level.
export function reorderQty(current: number, desired: number): number {
  return Math.max(0, (desired || 0) - (current || 0));
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// Stable key generator for custom field defs from a label.
export function fieldKey(label: string): string {
  return slugify(label).replace(/-/g, "_") || "field";
}

export function cuidish(): string {
  // Lightweight client-side id for optimistic UI; server uses cuid().
  return "tmp_" + Math.random().toString(36).slice(2, 10);
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

// Sort helper: apply a definable sort key if provided, else fall back to sortOrder.
export function applySort<T extends Record<string, any>>(
  rows: T[],
  sortKey: string | null,
  dir: "asc" | "desc" = "asc",
): T[] {
  if (!sortKey) return [...rows].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const mult = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * mult;
    return String(av).localeCompare(String(bv)) * mult;
  });
}
