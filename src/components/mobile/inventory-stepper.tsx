"use client";

import * as React from "react";
import Image from "next/image";
import {
  Package,
  Check,
  ChevronLeft,
  ChevronRight,
  List,
  Rows3,
  RotateCcw,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/components/shell/permission-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "@/components/ui/toast";
import { QtyStepper } from "@/components/mobile/qty-stepper";
import type { MobileItem } from "@/components/mobile/types";

interface InventoryStepperProps {
  drawerName: string;
  boxName: string | null;
  items: MobileItem[];
  // Optionally focus a specific item on mount (e.g. arriving from search).
  initialItemId?: string;
}

type Mode = "stepper" | "list";

// The on-hand count is the source of truth we read back from the server after
// each save, so the UI stays correct even if the endpoint clamps/normalizes.
async function saveQuantity(itemId: string, target: number, current: number) {
  // Send both an absolute target and a relative delta so this works whichever
  // shape the items module's adjust endpoint expects.
  const updated = await api.patch<{ quantity?: number }>(
    `/api/items/${itemId}/adjust`,
    { quantity: target, delta: target - current },
  );
  return typeof updated?.quantity === "number" ? updated.quantity : target;
}

export function InventoryStepper({
  drawerName,
  boxName,
  items,
  initialItemId,
}: InventoryStepperProps) {
  const { can } = usePermissions();
  const canAdjust = can("items.adjustQuantity");

  // Canonical on-hand quantities (updated after each successful save).
  const [counts, setCounts] = React.useState<Record<string, number>>(() =>
    Object.fromEntries(items.map((i) => [i.id, i.quantity])),
  );
  // In-progress draft quantities (what the user is currently editing).
  const [drafts, setDrafts] = React.useState<Record<string, number>>(() =>
    Object.fromEntries(items.map((i) => [i.id, i.quantity])),
  );
  const [saving, setSaving] = React.useState<Record<string, boolean>>({});
  // Items the user has saved this session (for the progress meter).
  const [done, setDone] = React.useState<Set<string>>(() => new Set());

  const [mode, setMode] = React.useState<Mode>("stepper");
  const startIndex = React.useMemo(() => {
    if (!initialItemId) return 0;
    const idx = items.findIndex((i) => i.id === initialItemId);
    return idx >= 0 ? idx : 0;
  }, [items, initialItemId]);
  const [index, setIndex] = React.useState(startIndex);

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Package}
        title="Empty drawer"
        description="This drawer has no items to count."
      />
    );
  }

  const setDraft = (id: string, v: number) =>
    setDrafts((d) => ({ ...d, [id]: v }));

  const dirty = (id: string) => drafts[id] !== counts[id];

  const save = async (item: MobileItem) => {
    if (!canAdjust) {
      toast.error("You don't have permission to adjust quantities.");
      return;
    }
    const target = drafts[item.id] ?? counts[item.id];
    setSaving((s) => ({ ...s, [item.id]: true }));
    try {
      const confirmed = await saveQuantity(item.id, target, counts[item.id]);
      setCounts((c) => ({ ...c, [item.id]: confirmed }));
      setDrafts((d) => ({ ...d, [item.id]: confirmed }));
      setDone((prev) => new Set(prev).add(item.id));
      toast.success({
        title: "Saved",
        description: `${item.name} → ${confirmed} ${item.unit || "on hand"}`,
      });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Could not save quantity";
      toast.error({ title: "Save failed", description: message });
    } finally {
      setSaving((s) => ({ ...s, [item.id]: false }));
    }
  };

  const doneCount = done.size;

  return (
    <div className="space-y-4">
      <header className="px-1">
        {boxName && (
          <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {boxName}
          </p>
        )}
        <div className="flex items-center justify-between gap-2">
          <h1 className="min-w-0 truncate text-xl font-bold tracking-tight">
            {drawerName}
          </h1>
          <div className="flex shrink-0 overflow-hidden rounded-lg border border-border">
            <button
              type="button"
              aria-label="Stepper mode"
              aria-pressed={mode === "stepper"}
              onClick={() => setMode("stepper")}
              className={cn(
                "flex h-9 w-9 items-center justify-center transition-colors",
                mode === "stepper"
                  ? "bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground",
              )}
            >
              <Rows3 className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label="List all mode"
              aria-pressed={mode === "list"}
              onClick={() => setMode("list")}
              className={cn(
                "flex h-9 w-9 items-center justify-center transition-colors",
                mode === "list"
                  ? "bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground",
              )}
            >
              <List className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Progress meter */}
        <div className="mt-3 space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {doneCount}/{items.length} counted
            </span>
            {!canAdjust && <span>Read-only</span>}
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-success transition-all"
              style={{
                width: `${items.length ? (doneCount / items.length) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
      </header>

      {mode === "stepper" ? (
        <StepperView
          items={items}
          index={index}
          setIndex={setIndex}
          counts={counts}
          drafts={drafts}
          setDraft={setDraft}
          dirty={dirty}
          done={done}
          saving={saving}
          canAdjust={canAdjust}
          onSave={save}
        />
      ) : (
        <ListView
          items={items}
          counts={counts}
          drafts={drafts}
          setDraft={setDraft}
          dirty={dirty}
          done={done}
          saving={saving}
          canAdjust={canAdjust}
          onSave={save}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stepper: one item at a time, big controls, Prev/Next.
// ---------------------------------------------------------------------------

function StepperView({
  items,
  index,
  setIndex,
  counts,
  drafts,
  setDraft,
  dirty,
  done,
  saving,
  canAdjust,
  onSave,
}: {
  items: MobileItem[];
  index: number;
  setIndex: (n: number) => void;
  counts: Record<string, number>;
  drafts: Record<string, number>;
  setDraft: (id: string, v: number) => void;
  dirty: (id: string) => boolean;
  done: Set<string>;
  saving: Record<string, boolean>;
  canAdjust: boolean;
  onSave: (item: MobileItem) => Promise<void>;
}) {
  const item = items[index];
  const isSaving = !!saving[item.id];
  const isDirty = dirty(item.id);
  const isDone = done.has(item.id);

  const go = (delta: number) => {
    const next = index + delta;
    if (next >= 0 && next < items.length) setIndex(next);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1 text-sm text-muted-foreground">
        <span className="tabular-nums">
          {index + 1} / {items.length}
        </span>
        {isDone && (
          <Badge variant="success" className="gap-1">
            <Check className="h-3.5 w-3.5" /> Counted
          </Badge>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="relative aspect-[4/3] w-full bg-muted">
          {item.imageUrl ? (
            <Image
              src={item.imageUrl}
              alt={item.name}
              fill
              sizes="(max-width: 28rem) 100vw, 28rem"
              className="object-contain"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
              <Package className="h-16 w-16" />
            </div>
          )}
        </div>

        <div className="space-y-1 p-4 text-center">
          <h2 className="text-lg font-semibold leading-tight text-foreground">
            {item.name}
          </h2>
          <div className="flex flex-wrap items-center justify-center gap-1.5 text-xs text-muted-foreground">
            {item.partNumber && (
              <Badge variant="outline">PN {item.partNumber}</Badge>
            )}
            {item.binName && <Badge variant="secondary">Bin {item.binName}</Badge>}
            {item.unit && <span>· {item.unit}</span>}
          </div>
          <p className="pt-1 text-xs text-muted-foreground">
            On hand:{" "}
            <span className="font-semibold tabular-nums text-foreground">
              {counts[item.id]}
            </span>
            {item.desiredQuantity > 0 && <> · target {item.desiredQuantity}</>}
          </p>
        </div>

        <div className="border-t border-border p-4">
          <QtyStepper
            value={drafts[item.id] ?? counts[item.id]}
            onChange={(v) => setDraft(item.id, v)}
            disabled={!canAdjust || isSaving}
            size="lg"
            inputId={`qty-${item.id}`}
          />

          <div className="mt-4 flex items-center gap-2">
            {isDirty && (
              <Button
                type="button"
                variant="ghost"
                size="lg"
                aria-label="Reset"
                disabled={isSaving}
                onClick={() => setDraft(item.id, counts[item.id])}
              >
                <RotateCcw className="h-5 w-5" />
              </Button>
            )}
            <Button
              type="button"
              size="lg"
              className="h-12 flex-1 text-base"
              disabled={!canAdjust || isSaving || !isDirty}
              onClick={() => onSave(item)}
            >
              {isSaving ? (
                "Saving…"
              ) : (
                <>
                  <Check className="h-5 w-5" /> Save
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-12 flex-1 text-base"
          disabled={index === 0}
          onClick={() => go(-1)}
        >
          <ChevronLeft className="h-5 w-5" /> Prev
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-12 flex-1 text-base"
          disabled={index === items.length - 1}
          onClick={() => go(1)}
        >
          Next <ChevronRight className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// List all: compact rows for fast adjusting.
// ---------------------------------------------------------------------------

function ListView({
  items,
  counts,
  drafts,
  setDraft,
  dirty,
  done,
  saving,
  canAdjust,
  onSave,
}: {
  items: MobileItem[];
  counts: Record<string, number>;
  drafts: Record<string, number>;
  setDraft: (id: string, v: number) => void;
  dirty: (id: string) => boolean;
  done: Set<string>;
  saving: Record<string, boolean>;
  canAdjust: boolean;
  onSave: (item: MobileItem) => Promise<void>;
}) {
  return (
    <ul className="space-y-2.5">
      {items.map((item) => {
        const isSaving = !!saving[item.id];
        const isDirty = dirty(item.id);
        const isDone = done.has(item.id);
        return (
          <li
            key={item.id}
            className="rounded-xl border border-border bg-card p-3 shadow-sm"
          >
            <div className="flex items-center gap-3">
              <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
                {item.imageUrl ? (
                  <Image
                    src={item.imageUrl}
                    alt=""
                    fill
                    sizes="48px"
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                    <Package className="h-5 w-5" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold leading-tight text-foreground">
                  {item.name}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {item.partNumber ? `PN ${item.partNumber} · ` : ""}
                  on hand {counts[item.id]}
                </p>
              </div>
              {isDone && !isDirty && (
                <Check className="h-5 w-5 shrink-0 text-success" />
              )}
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              <QtyStepper
                value={drafts[item.id] ?? counts[item.id]}
                onChange={(v) => setDraft(item.id, v)}
                disabled={!canAdjust || isSaving}
                size="sm"
              />
              <Button
                type="button"
                size="default"
                className="h-10"
                disabled={!canAdjust || isSaving || !isDirty}
                onClick={() => onSave(item)}
              >
                {isSaving ? "…" : "Save"}
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
