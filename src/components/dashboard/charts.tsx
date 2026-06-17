"use client";

// Dashboard-local chart bodies. These render only the chart (no Card chrome) so
// they can be dropped inside a <WidgetFrame>. They build on recharts and the
// same color palette as the shell charts, but support a count/value toggle and a
// pie option for the category widget.

import * as React from "react";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  CartesianGrid,
  Legend,
} from "recharts";
import { formatCurrency, formatNumber } from "@/lib/utils";
import type { CategoryDatum, SupplierValueDatum } from "@/components/dashboard/data";

export const CHART_COLORS = [
  "hsl(221 83% 53%)",
  "hsl(199 89% 48%)",
  "hsl(262 83% 58%)",
  "hsl(142 71% 45%)",
  "hsl(38 92% 50%)",
  "hsl(330 81% 60%)",
  "hsl(173 80% 40%)",
  "hsl(280 65% 60%)",
];

function ChartTooltip({
  active,
  payload,
  label,
  valueFormatter,
}: {
  active?: boolean;
  payload?: Array<{ value: number; name?: string; payload?: { name?: string } }>;
  label?: string;
  valueFormatter?: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0];
  const title = label ?? point.name ?? point.payload?.name ?? "";
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      {title && <p className="font-medium">{title}</p>}
      <p className="text-muted-foreground">
        {valueFormatter ? valueFormatter(point.value) : point.value}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Category breakdown — bar or pie, by item count or on-hand value.
// ---------------------------------------------------------------------------

export type CategoryMetric = "count" | "value";
export type CategoryChartKind = "bar" | "pie";

export function CategoryChart({
  data,
  metric,
  kind,
}: {
  data: CategoryDatum[];
  metric: CategoryMetric;
  kind: CategoryChartKind;
}) {
  const dataKey = metric;
  const fmt = (v: number) => (metric === "value" ? formatCurrency(v) : formatNumber(v));

  if (kind === "pie") {
    return (
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey={dataKey}
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={48}
              outerRadius={80}
              paddingAngle={2}
              stroke="hsl(var(--card))"
              strokeWidth={2}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip valueFormatter={fmt} />} />
            <Legend
              verticalAlign="bottom"
              height={28}
              iconType="circle"
              wrapperStyle={{ fontSize: 11 }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={{ stroke: "hsl(var(--border))" }}
            interval={0}
            angle={data.length > 5 ? -25 : 0}
            textAnchor={data.length > 5 ? "end" : "middle"}
            height={data.length > 5 ? 48 : 28}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            width={metric === "value" ? 52 : 36}
            tickFormatter={(v) => (metric === "value" ? formatCurrency(v).replace(/\.00$/, "") : String(v))}
          />
          <Tooltip cursor={{ fill: "hsl(var(--muted) / 0.4)" }} content={<ChartTooltip valueFormatter={fmt} />} />
          <Bar dataKey={dataKey} radius={[4, 4, 0, 0]} maxBarSize={56}>
            {data.map((_, i) => (
              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Supplier value — horizontal bars.
// ---------------------------------------------------------------------------

export function SupplierChart({ data }: { data: SupplierValueDatum[] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => formatCurrency(v).replace(/\.00$/, "")}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={{ stroke: "hsl(var(--border))" }}
            width={96}
          />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
            content={<ChartTooltip valueFormatter={(v) => formatCurrency(v)} />}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={26}>
            {data.map((_, i) => (
              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
