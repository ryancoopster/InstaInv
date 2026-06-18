"use client";

import * as React from "react";
import { api, ApiError } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import type { BoxListItem, DrawerSummary } from "./types";

type Mode = "leave-in-box" | "unassign-from-box" | "reassign";

const OPTIONS: { value: Mode; title: string; desc: string }[] = [
  {
    value: "leave-in-box",
    title: "Delete drawer, leave items in box",
    desc: "Items stay in this box but become drawer-unassigned.",
  },
  {
    value: "unassign-from-box",
    title: "Delete drawer, unassign items from box",
    desc: "Items are removed from the box entirely (not deleted).",
  },
  {
    value: "reassign",
    title: "Delete drawer, assign items to another box",
    desc: "Move the items to a box (and optional drawer) you choose.",
  },
];

export function DrawerDeleteDialog({
  open,
  onOpenChange,
  drawer,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  drawer: DrawerSummary | null;
  onDeleted: (id: string) => void;
}) {
  const [mode, setMode] = React.useState<Mode>("leave-in-box");
  const [boxes, setBoxes] = React.useState<BoxListItem[]>([]);
  const [drawers, setDrawers] = React.useState<DrawerSummary[]>([]);
  const [targetBoxId, setTargetBoxId] = React.useState("");
  const [targetDrawerId, setTargetDrawerId] = React.useState("");
  const [migrateBins, setMigrateBins] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setMode("leave-in-box");
    setTargetBoxId("");
    setTargetDrawerId("");
    setMigrateBins(false);
    api.get<BoxListItem[]>("/api/boxes").then(setBoxes).catch(() => setBoxes([]));
  }, [open]);

  React.useEffect(() => {
    if (!targetBoxId) {
      setDrawers([]);
      return;
    }
    api.get<DrawerSummary[]>(`/api/drawers?boxId=${targetBoxId}`).then(setDrawers).catch(() => setDrawers([]));
  }, [targetBoxId]);

  if (!drawer) return null;

  const canMigrate = Boolean(targetDrawerId);
  const reassignReady = mode !== "reassign" || Boolean(targetBoxId);

  async function confirm() {
    if (!drawer) return;
    setSaving(true);
    try {
      const body =
        mode === "reassign"
          ? {
              mode,
              targetBoxId,
              targetDrawerId: targetDrawerId || null,
              migrateBins: migrateBins && canMigrate,
            }
          : { mode };
      await api.post(`/api/drawers/${drawer.id}/delete`, body);
      toast.success("Drawer deleted");
      onDeleted(drawer.id);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not delete drawer");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Delete “{drawer.label ? `${drawer.label} — ${drawer.name}` : drawer.name}”</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-1">
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setMode(o.value)}
              className={cn(
                "flex w-full flex-col items-start rounded-md border p-3 text-left transition-colors",
                mode === o.value ? "border-primary ring-2 ring-primary/30" : "border-border hover:bg-muted/50",
              )}
            >
              <span className="text-sm font-medium">{o.title}</span>
              <span className="text-xs text-muted-foreground">{o.desc}</span>
            </button>
          ))}

          {mode === "reassign" && (
            <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
              <div className="space-y-1.5">
                <Label htmlFor="dd-box">Destination box</Label>
                <Select
                  id="dd-box"
                  value={targetBoxId}
                  onChange={(e) => {
                    setTargetBoxId(e.target.value);
                    setTargetDrawerId("");
                    setMigrateBins(false);
                  }}
                >
                  <option value="">Select a box…</option>
                  {boxes.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dd-drawer">Destination drawer (optional)</Label>
                <Select
                  id="dd-drawer"
                  value={targetDrawerId}
                  disabled={!targetBoxId}
                  onChange={(e) => {
                    setTargetDrawerId(e.target.value);
                    if (!e.target.value) setMigrateBins(false);
                  }}
                >
                  <option value="">In box, no drawer</option>
                  {drawers
                    .filter((d) => d.id !== drawer.id)
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.label ? `${d.label} — ${d.name}` : d.name}
                      </option>
                    ))}
                </Select>
              </div>
              <label
                className={cn(
                  "flex items-center gap-2 text-sm",
                  !canMigrate && "opacity-50",
                )}
              >
                <Checkbox checked={migrateBins} onCheckedChange={setMigrateBins} disabled={!canMigrate} />
                Also move this drawer&apos;s bins into the chosen drawer
              </label>
              {!canMigrate && (
                <p className="text-xs text-muted-foreground">
                  Bins can only be migrated when you pick a destination drawer.
                </p>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={saving || !reassignReady}>
            {saving ? "Deleting…" : "Delete drawer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
