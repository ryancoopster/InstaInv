"use client";

import * as React from "react";
import { BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { WidgetHeader } from "@/components/dashboard/widgets/widget-header";
import {
  CategoryChart,
  type CategoryChartKind,
  type CategoryMetric,
} from "@/components/dashboard/charts";
import type { CategoryDatum } from "@/components/dashboard/data";

// Self-contained controls (count/value, bar/pie) are local UI state — they're a
// view preference, not persisted in the layout config.
export function CategoryWidget({ data }: { data: CategoryDatum[] }) {
  const [metric, setMetric] = React.useState<CategoryMetric>("count");
  const [kind, setKind] = React.useState<CategoryChartKind>("bar");

  return (
    <div className="flex h-full flex-col">
      <WidgetHeader
        icon={BarChart3}
        title="Items by category"
        description="How your inventory is distributed."
      />
      <div className="flex flex-wrap items-center gap-2 px-5 pt-3">
        <Toggle
          options={[
            { value: "count", label: "Count" },
            { value: "value", label: "Value" },
          ]}
          value={metric}
          onChange={(v) => setMetric(v as CategoryMetric)}
        />
        <Toggle
          options={[
            { value: "bar", label: "Bar" },
            { value: "pie", label: "Pie" },
          ]}
          value={kind}
          onChange={(v) => setKind(v as CategoryChartKind)}
        />
      </div>
      <div className="p-5 pt-3">
        {data.length === 0 ? (
          <EmptyState
            icon={BarChart3}
            title="No category data yet"
            description="Assign items to categories to see the breakdown."
            className="border-0 bg-transparent py-8"
          />
        ) : (
          <CategoryChart data={data} metric={metric} kind={kind} />
        )}
      </div>
    </div>
  );
}

function Toggle({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-md border border-border bg-muted/40 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-sm px-2.5 py-1 text-xs font-medium transition-colors",
            value === o.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
