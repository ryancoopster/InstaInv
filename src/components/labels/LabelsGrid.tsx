"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { Tag, Plus, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { applySort } from "@/lib/utils";
import { usePermissions } from "@/components/shell/permission-context";
import { TapeSizePicker, type TapeSelection } from "./TapeSizePicker";
import { TemplateCard } from "./TemplateCard";
import type { LabelTemplateDTO } from "./types";
import { TAPE_PRESETS, type LabelTargetKind } from "@/lib/labels/types";

const TARGET_ORDER: LabelTargetKind[] = ["ITEM", "BIN", "DRAWER", "BOX", "GENERIC"];
const TARGET_LABEL: Record<LabelTargetKind, string> = {
  ITEM: "Item labels",
  BIN: "Bin labels",
  DRAWER: "Drawer labels",
  BOX: "Box labels",
  GENERIC: "Generic labels",
};

export function LabelsGrid({ initialTemplates }: { initialTemplates: LabelTemplateDTO[] }) {
  const router = useRouter();
  const { can } = usePermissions();
  const canDesign = can("labels.design");
  const canPrint = can("labels.print");

  const [templates, setTemplates] = React.useState<LabelTemplateDTO[]>(initialTemplates);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [printTarget, setPrintTarget] = React.useState<LabelTemplateDTO | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // group by target, ordered by sortOrder
  const grouped = React.useMemo(() => {
    const map = new Map<LabelTargetKind, LabelTemplateDTO[]>();
    for (const t of TARGET_ORDER) map.set(t, []);
    for (const tpl of templates) (map.get(tpl.target) ?? map.set(tpl.target, []).get(tpl.target)!).push(tpl);
    for (const [, arr] of map) arr.sort((a, b) => a.sortOrder - b.sortOrder);
    return map;
  }, [templates]);

  async function persistOrder(group: LabelTargetKind, ordered: LabelTemplateDTO[]) {
    try {
      await api.patch("/api/labels/reorder", { ids: ordered.map((t) => t.id) });
    } catch (err: any) {
      toast.error({ title: "Reorder failed", description: err?.message });
      router.refresh();
    }
  }

  function handleDragEnd(group: LabelTargetKind) {
    return (e: DragEndEvent) => {
      const { active, over } = e;
      if (!over || active.id === over.id) return;
      const arr = grouped.get(group) ?? [];
      const ids = arr.map((t) => t.id);
      const from = ids.indexOf(String(active.id));
      const to = ids.indexOf(String(over.id));
      if (from < 0 || to < 0) return;
      const reordered = arrayMove(arr, from, to);
      // reassign sortOrder locally
      const updated = reordered.map((t, i) => ({ ...t, sortOrder: i }));
      setTemplates((prev) => prev.map((t) => updated.find((u) => u.id === t.id) ?? t));
      persistOrder(group, updated);
    };
  }

  async function duplicate(tpl: LabelTemplateDTO) {
    try {
      const copy = await api.post<LabelTemplateDTO>(`/api/labels/${tpl.id}/duplicate`);
      setTemplates((prev) => [...prev, copy]);
      toast.success("Template duplicated");
    } catch (err: any) {
      toast.error({ title: "Duplicate failed", description: err?.message });
    }
  }

  async function remove(tpl: LabelTemplateDTO) {
    if (!window.confirm(`Delete "${tpl.name}"? This cannot be undone.`)) return;
    try {
      await api.del(`/api/labels/${tpl.id}`);
      setTemplates((prev) => prev.filter((t) => t.id !== tpl.id));
      toast.success("Template deleted");
      router.refresh();
    } catch (err: any) {
      toast.error({ title: "Delete failed", description: err?.message });
    }
  }

  async function setDefault(tpl: LabelTemplateDTO) {
    try {
      await api.patch(`/api/labels/${tpl.id}`, { isDefault: true });
      setTemplates((prev) =>
        prev.map((t) => (t.target === tpl.target ? { ...t, isDefault: t.id === tpl.id } : t)),
      );
      toast.success("Default updated");
    } catch (err: any) {
      toast.error({ title: "Could not set default", description: err?.message });
    }
  }

  function print(tpl: LabelTemplateDTO) {
    const params = new URLSearchParams({ templateId: tpl.id, target: tpl.target, format: "pdf", sample: "1" });
    window.open(`/api/labels/render?${params.toString()}`, "_blank", "noopener");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Labels"
        description="Design and manage P-touch-style label templates for items, bins, drawers and boxes."
        actions={
          canDesign ? (
            <Button onClick={() => setCreateOpen(true)} className="gap-1.5">
              <Plus className="h-4 w-4" /> New template
            </Button>
          ) : null
        }
      />

      {templates.length === 0 ? (
        <EmptyState
          icon={Tag}
          title="No label templates yet"
          description="Create your first template to start designing labels."
          action={canDesign ? <Button onClick={() => setCreateOpen(true)} className="gap-1.5"><Plus className="h-4 w-4" /> New template</Button> : undefined}
        />
      ) : (
        <div className="space-y-8">
          {TARGET_ORDER.map((target) => {
            const arr = grouped.get(target) ?? [];
            if (arr.length === 0) return null;
            return (
              <section key={target} className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{TARGET_LABEL[target]}</h2>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd(target)}>
                  <SortableContext items={arr.map((t) => t.id)} strategy={rectSortingStrategy}>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {arr.map((tpl) => (
                        <TemplateCard
                          key={tpl.id}
                          tpl={tpl}
                          canDesign={canDesign}
                          canPrint={canPrint}
                          onDuplicate={duplicate}
                          onDelete={remove}
                          onSetDefault={setDefault}
                          onPrint={print}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              </section>
            );
          })}
        </div>
      )}

      <CreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(tpl) => {
          setTemplates((prev) => [...prev, tpl]);
          router.push(`/labels/${tpl.id}`);
        }}
      />
    </div>
  );
}

function CreateDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (tpl: LabelTemplateDTO) => void;
}) {
  const defaultPreset = TAPE_PRESETS[1]; // DK-1209 29x62
  const [name, setName] = React.useState("New label");
  const [target, setTarget] = React.useState<LabelTargetKind>("ITEM");
  const [selection, setSelection] = React.useState<TapeSelection>({
    tapePresetId: defaultPreset.id,
    tapeName: defaultPreset.tapeName,
    widthMm: defaultPreset.widthMm,
    heightMm: defaultPreset.heightMm,
    orientation: defaultPreset.orientation,
  });
  const [busy, setBusy] = React.useState(false);

  async function create() {
    setBusy(true);
    try {
      const tpl = await api.post<LabelTemplateDTO>("/api/labels", {
        name: name.trim() || "New label",
        target,
        widthMm: selection.widthMm,
        heightMm: selection.heightMm,
        tapeName: selection.tapeName,
        orientation: selection.orientation,
      });
      toast.success("Template created");
      onOpenChange(false);
      onCreated(tpl);
    } catch (err: any) {
      toast.error({ title: "Create failed", description: err?.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New label template</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="tpl-name">Name</Label>
            <Input id="tpl-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <TapeSizePicker
            target={target}
            onTargetChange={setTarget}
            selection={selection}
            onSelectionChange={setSelection}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={create} disabled={busy} className="gap-1.5">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Create & design
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
