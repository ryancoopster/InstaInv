"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastVariant = "default" | "success" | "destructive" | "warning" | "info";

export interface ToastOptions {
  title?: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
}

export interface ToastRecord extends ToastOptions {
  id: string;
}

// ---------------------------------------------------------------------------
// Module-level event emitter so toast() works without prop-drilling / context.
// ---------------------------------------------------------------------------

type Listener = (toasts: ToastRecord[]) => void;

const listeners = new Set<Listener>();
let toasts: ToastRecord[] = [];
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function emit() {
  for (const listener of listeners) listener(toasts);
}

function genId() {
  return `toast_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function dismissToast(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  const timer = timers.get(id);
  if (timer) {
    clearTimeout(timer);
    timers.delete(id);
  }
  emit();
}

export function toast(options: ToastOptions | string): string {
  const opts: ToastOptions = typeof options === "string" ? { title: options } : options;
  const id = genId();
  const duration = opts.duration ?? 5000;
  const record: ToastRecord = { id, variant: "default", ...opts };
  toasts = [...toasts, record];
  emit();
  if (duration !== Infinity && duration > 0) {
    const timer = setTimeout(() => dismissToast(id), duration);
    timers.set(id, timer);
  }
  return id;
}

// Convenience helpers.
toast.success = (o: Omit<ToastOptions, "variant"> | string) =>
  toast({ ...(typeof o === "string" ? { title: o } : o), variant: "success" });
toast.error = (o: Omit<ToastOptions, "variant"> | string) =>
  toast({ ...(typeof o === "string" ? { title: o } : o), variant: "destructive" });
toast.warning = (o: Omit<ToastOptions, "variant"> | string) =>
  toast({ ...(typeof o === "string" ? { title: o } : o), variant: "warning" });
toast.info = (o: Omit<ToastOptions, "variant"> | string) =>
  toast({ ...(typeof o === "string" ? { title: o } : o), variant: "info" });
toast.dismiss = dismissToast;

// ---------------------------------------------------------------------------
// Hook to subscribe (optional alternative API).
// ---------------------------------------------------------------------------

export function useToast() {
  const [list, setList] = React.useState<ToastRecord[]>(toasts);
  React.useEffect(() => {
    listeners.add(setList);
    setList(toasts);
    return () => {
      listeners.delete(setList);
    };
  }, []);
  return { toasts: list, toast, dismiss: dismissToast };
}

// ---------------------------------------------------------------------------
// Toaster — renders the live toast stack via a portal.
// ---------------------------------------------------------------------------

const VARIANT_META: Record<
  ToastVariant,
  { icon: React.ElementType; classes: string; iconClass: string }
> = {
  default: { icon: Info, classes: "border-border bg-card text-card-foreground", iconClass: "text-foreground" },
  success: { icon: CheckCircle2, classes: "border-success/40 bg-card text-card-foreground", iconClass: "text-success" },
  destructive: { icon: AlertCircle, classes: "border-destructive/40 bg-card text-card-foreground", iconClass: "text-destructive" },
  warning: { icon: AlertTriangle, classes: "border-warning/50 bg-card text-card-foreground", iconClass: "text-warning" },
  info: { icon: Info, classes: "border-primary/40 bg-card text-card-foreground", iconClass: "text-primary" },
};

function ToastItem({ record }: { record: ToastRecord }) {
  const meta = VARIANT_META[record.variant ?? "default"];
  const Icon = meta.icon;
  return (
    <div
      role="status"
      className={cn(
        "pointer-events-auto flex w-full items-start gap-3 rounded-lg border p-4 shadow-lg",
        "animate-in slide-in-from-right-full fade-in-0",
        meta.classes,
      )}
    >
      <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", meta.iconClass)} />
      <div className="flex-1 space-y-1">
        {record.title && <p className="text-sm font-medium leading-tight">{record.title}</p>}
        {record.description && (
          <p className="text-sm text-muted-foreground">{record.description}</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => dismissToast(record.id)}
        className="shrink-0 rounded-sm text-muted-foreground opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function Toaster() {
  const { toasts: list } = useToast();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div
      aria-live="assertive"
      className="pointer-events-none fixed inset-0 z-[100] flex flex-col items-end gap-2 p-4 sm:p-6"
    >
      <div className="ml-auto flex w-full max-w-sm flex-col gap-2">
        {list.map((record) => (
          <ToastItem key={record.id} record={record} />
        ))}
      </div>
    </div>,
    document.body,
  );
}

// Provider alias for ergonomic imports (no behavior — toasts are global).
export function ToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Toaster />
    </>
  );
}
