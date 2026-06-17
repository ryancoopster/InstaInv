"use client";

// The interactive dashboard surface. Seeds its config from the server-normalized
// layout, renders the user's visible widgets in a responsive grid, and — in edit
// mode — lets them drag-reorder, resize, hide and re-add widgets. Every change is
// persisted to /api/dashboard.

import * as React from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToParentElement } from "@dnd-kit/modifiers";
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  arrayMove,
} from "@dnd-kit/sortable";
import { Check, Loader2, Plus, Settings2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { api, ApiError } from "@/lib/api";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/components/shell/permission-context";
import { WidgetFrame } from "@/components/dashboard/widget-frame";
import { RenderWidget } from "@/components/dashboard/widgets/render-widget";
import {
  WIDGET_META,
  DEFAULT_DASHBOARD,
  normalizeConfig,
  visibleWidgetsFor,
  type DashboardConfig,
  type WidgetConfig,
  type WidgetSpan,
  type WidgetType,
} from "@/components/dashboard/types";
import type { DashboardData } from "@/components/dashboard/data";

type SaveState = "idle" | "saving" | "saved" | "error";

export function DashboardGrid({
  initialConfig,
  data,
}: {
  initialConfig: DashboardConfig;
  data: DashboardData;
}) {
  const { can } = usePermissions();
  const [config, setConfig] = React.useState<DashboardConfig>(initialConfig);
  const [editing, setEditing] = React.useState(false);
  const [saveState, setSaveState] = React.useState<SaveState>("idle");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // --- Persistence ---------------------------------------------------------
  // Skip the initial render so seeding state doesn't trigger a save.
  const firstRender = React.useRef(true);
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveState("saving");
    saveTimer.current = setTimeout(() => {
      void saveConfig(config);
    }, 500);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  async function saveConfig(next: DashboardConfig) {
    try {
      await api.put("/api/dashboard", next);
      setSaveState("saved");
    } catch (err) {
      setSaveState("error");
      const message = err instanceof ApiError ? err.message : "Could not save your dashboard.";
      toast.error({ title: "Save failed", description: message });
    }
  }

  // --- Config mutators -----------------------------------------------------
  function updateWidgets(mutate: (widgets: WidgetConfig[]) => WidgetConfig[]) {
    setConfig((prev) => ({
      widgets: mutate(prev.widgets),
      updatedAt: new Date().toISOString(),
    }));
  }

  function setSpan(type: WidgetType, span: WidgetSpan) {
    updateWidgets((widgets) =>
      widgets.map((w) => (w.type === type ? { ...w, span } : w)),
    );
  }

  function hideWidget(type: WidgetType) {
    updateWidgets((widgets) =>
      widgets.map((w) => (w.type === type ? { ...w, visible: false } : w)),
    );
  }

  function showWidget(type: WidgetType) {
    updateWidgets((widgets) =>
      widgets.map((w) =>
        w.type === type
          ? { ...w, visible: true, span: WIDGET_META[type].defaultSpan }
          : w,
      ),
    );
  }

  function resetToDefault() {
    setConfig({ ...normalizeConfig(DEFAULT_DASHBOARD), updatedAt: new Date().toISOString() });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    updateWidgets((widgets) => {
      const from = widgets.findIndex((w) => w.type === active.id);
      const to = widgets.findIndex((w) => w.type === over.id);
      if (from < 0 || to < 0) return widgets;
      return arrayMove(widgets, from, to);
    });
  }

  // --- Derived render lists ------------------------------------------------
  // Widgets the user is permitted to see (drops permission-gated ones).
  const permitted = visibleWidgetsFor(config, can);
  const visible = permitted.filter((w) => w.visible);
  const hidden = permitted.filter((w) => !w.visible);

  const sortableIds = visible.map((w) => w.type);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-end gap-2">
        {editing && (
          <>
            <SaveIndicator state={saveState} />
            <Button variant="ghost" size="sm" onClick={resetToDefault}>
              <RotateCcw className="h-4 w-4" />
              Reset to default
            </Button>
          </>
        )}
        <Button
          variant={editing ? "default" : "outline"}
          size="sm"
          onClick={() => setEditing((e) => !e)}
        >
          {editing ? (
            <>
              <Check className="h-4 w-4" />
              Done
            </>
          ) : (
            <>
              <Settings2 className="h-4 w-4" />
              Customize
            </>
          )}
        </Button>
      </div>

      {/* Grid */}
      {editing ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
          modifiers={[restrictToParentElement]}
        >
          <SortableContext items={sortableIds} strategy={rectSortingStrategy}>
            <Grid>
              {visible.map((w) => (
                <WidgetFrame
                  key={w.type}
                  type={w.type}
                  span={w.span}
                  editing
                  onSpanChange={(span) => setSpan(w.type, span)}
                  onHide={() => hideWidget(w.type)}
                >
                  <RenderWidget type={w.type} data={data} editing can={can} />
                </WidgetFrame>
              ))}
            </Grid>
          </SortableContext>
        </DndContext>
      ) : (
        <Grid>
          {visible.map((w) => (
            <WidgetFrame
              key={w.type}
              type={w.type}
              span={w.span}
              editing={false}
              onSpanChange={(span) => setSpan(w.type, span)}
              onHide={() => hideWidget(w.type)}
            >
              <RenderWidget type={w.type} data={data} editing={false} can={can} />
            </WidgetFrame>
          ))}
        </Grid>
      )}

      {/* Add widgets tray */}
      {editing && (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Plus className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Add widgets</h3>
          </div>
          {hidden.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Every available widget is already on your dashboard.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {hidden.map((w) => {
                const meta = WIDGET_META[w.type];
                return (
                  <div
                    key={w.type}
                    className="flex items-start justify-between gap-3 rounded-md border border-border bg-card p-3"
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="truncate text-sm font-medium">{meta.title}</p>
                      <p className="text-xs text-muted-foreground">{meta.description}</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => showWidget(w.type)}
                    >
                      <Plus className="h-4 w-4" />
                      Add
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">{children}</div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  return (
    <span
      className={cn(
        "flex items-center gap-1.5 text-xs",
        state === "error" ? "text-destructive" : "text-muted-foreground",
      )}
    >
      {state === "saving" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {state === "saved" && <Check className="h-3.5 w-3.5 text-success" />}
      {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : "Save failed"}
    </span>
  );
}
