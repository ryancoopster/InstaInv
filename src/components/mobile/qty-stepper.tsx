"use client";

import * as React from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { clamp } from "@/lib/utils";

interface QtyStepperProps {
  value: number;
  onChange: (next: number) => void;
  disabled?: boolean;
  min?: number;
  max?: number;
  step?: number;
  // "lg" = the big primary stepper; "sm" = compact inline (list-all mode).
  size?: "sm" | "lg";
  inputId?: string;
}

// Big-touch +/- control with a numeric field in between. One-handed friendly.
export function QtyStepper({
  value,
  onChange,
  disabled,
  min = 0,
  max = 1_000_000,
  step = 1,
  size = "lg",
  inputId,
}: QtyStepperProps) {
  const [text, setText] = React.useState(String(value));

  // Keep the visible text in sync when the canonical value changes externally
  // (e.g. parent reset after save), but allow free typing while focused.
  const focusedRef = React.useRef(false);
  React.useEffect(() => {
    if (!focusedRef.current) setText(String(value));
  }, [value]);

  const commit = (raw: string) => {
    const parsed = parseInt(raw.replace(/[^0-9-]/g, ""), 10);
    const next = Number.isFinite(parsed) ? clamp(parsed, min, max) : min;
    setText(String(next));
    onChange(next);
  };

  const bump = (delta: number) => {
    const next = clamp(value + delta, min, max);
    onChange(next);
    setText(String(next));
  };

  const btn =
    size === "lg"
      ? "h-16 w-16 text-2xl"
      : "h-10 w-10 text-lg";
  const field =
    size === "lg"
      ? "h-16 w-24 text-3xl"
      : "h-10 w-16 text-lg";

  return (
    <div className="flex items-center justify-center gap-3">
      <button
        type="button"
        aria-label="Decrease quantity"
        disabled={disabled || value <= min}
        onClick={() => bump(-step)}
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full border border-border bg-card font-bold text-foreground shadow-sm transition-colors active:bg-accent disabled:opacity-40",
          btn,
        )}
      >
        <Minus className={size === "lg" ? "h-7 w-7" : "h-5 w-5"} />
      </button>

      <input
        id={inputId}
        inputMode="numeric"
        pattern="[0-9]*"
        value={text}
        disabled={disabled}
        onFocus={(e) => {
          focusedRef.current = true;
          e.currentTarget.select();
        }}
        onBlur={(e) => {
          focusedRef.current = false;
          commit(e.currentTarget.value);
        }}
        onChange={(e) => setText(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          }
        }}
        className={cn(
          "rounded-xl border border-input bg-background text-center font-bold tabular-nums shadow-sm",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "disabled:opacity-50",
          field,
        )}
        aria-label="Quantity"
      />

      <button
        type="button"
        aria-label="Increase quantity"
        disabled={disabled || value >= max}
        onClick={() => bump(step)}
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground shadow-sm transition-colors active:bg-primary/80 disabled:opacity-40",
          btn,
        )}
      >
        <Plus className={size === "lg" ? "h-7 w-7" : "h-5 w-5"} />
      </button>
    </div>
  );
}
