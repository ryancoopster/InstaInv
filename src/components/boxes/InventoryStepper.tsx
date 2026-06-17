"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, Loader2, Minus, Package, Plus } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { cn, formatNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "@/components/ui/toast";
import type { DrawerItem } from "./types";

interface InventoryStepperProps {
  items: DrawerItem[];
  canAdjust: boolean;
  onAdjusted: (itemId: string, quantity: number) => void;
}

interface AdjustResult {
  id: string;
  quantity: number;
}

// Walk items one-by-one with big +/- controls for fast inventory taking.
export function InventoryStepper({ items, canAdjust, onAdjusted }: InventoryStepperProps) {
  const [index, setIndex] = React.useState(0);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (index > items.length - 1) setIndex(Math.max(0, items.length - 1));
  }, [items.length, index]);

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Package}
        title="No items to count"
        description="This drawer has no items yet."
      />
    );
  }

  const item = items[index];

  async function adjust(delta: number) {
    if (!canAdjust || !item) return;
    setBusy(true);
    try {
      // Quantity adjustment is owned by the items module endpoint.
      const res = await api.patch<AdjustResult>(`/api/items/${item.id}/adjust`, { delta });
      onAdjusted(item.id, res.quantity);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Adjust failed";
      toast.error({ title: "Could not adjust", description: message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Item <span className="font-medium text-foreground">{index + 1}</span> of {items.length}
        </p>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            disabled={index === 0}
            aria-label="Previous item"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setIndex((i) => Math.min(items.length - 1, i + 1))}
            disabled={index >= items.length - 1}
            aria-label="Next item"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center gap-6 p-8 text-center">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg bg-muted">
            {item.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
            ) : (
              <Package className="h-8 w-8 text-muted-foreground" />
            )}
          </div>

          <div className="space-y-1">
            <h3 className="text-xl font-semibold">{item.name}</h3>
            {item.category?.name && <Badge variant="outline">{item.category.name}</Badge>}
          </div>

          <div className="flex items-center gap-6">
            <Button
              variant="outline"
              size="icon"
              className="h-16 w-16 rounded-full"
              onClick={() => adjust(-1)}
              disabled={!canAdjust || busy || item.quantity <= 0}
              aria-label="Decrease quantity"
            >
              <Minus className="!h-7 !w-7" />
            </Button>

            <div className="min-w-[6rem]">
              {busy ? (
                <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
              ) : (
                <span className="text-5xl font-bold tabular-nums">{formatNumber(item.quantity)}</span>
              )}
              <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
                {item.unit || "on hand"}
              </p>
            </div>

            <Button
              size="icon"
              className="h-16 w-16 rounded-full"
              onClick={() => adjust(1)}
              disabled={!canAdjust || busy}
              aria-label="Increase quantity"
            >
              <Plus className="!h-7 !w-7" />
            </Button>
          </div>

          {!canAdjust && (
            <p className="text-xs text-muted-foreground">
              You do not have permission to adjust quantities.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Quick jump dots */}
      <div className="flex flex-wrap justify-center gap-1.5">
        {items.map((it, i) => (
          <button
            key={it.id}
            type="button"
            onClick={() => setIndex(i)}
            className={cn(
              "h-2 w-2 rounded-full transition-colors",
              i === index ? "bg-primary" : "bg-muted hover:bg-muted-foreground/40",
            )}
            aria-label={`Go to item ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
