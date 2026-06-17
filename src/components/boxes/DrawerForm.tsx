"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { COLOR_SWATCHES, type DrawerSummary } from "./types";

interface DrawerFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boxId: string;
  /** When provided, edits this drawer; otherwise creates a new one. */
  drawer?: DrawerSummary | null;
  onSaved: () => void;
}

export function DrawerForm({ open, onOpenChange, boxId, drawer, onSaved }: DrawerFormProps) {
  const editing = Boolean(drawer);
  const [name, setName] = React.useState("");
  const [label, setLabel] = React.useState("");
  const [color, setColor] = React.useState<string | null>(null);
  const [binRows, setBinRows] = React.useState(2);
  const [binCols, setBinCols] = React.useState(4);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setName(drawer?.name ?? "");
    setLabel(drawer?.label ?? "");
    setColor(drawer?.color ?? null);
    setBinRows(drawer?.binRows ?? 2);
    setBinCols(drawer?.binCols ?? 4);
  }, [open, drawer]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Drawer name is required");
      return;
    }
    setSaving(true);
    try {
      if (editing && drawer) {
        await api.patch(`/api/drawers/${drawer.id}`, {
          name: name.trim(),
          label: label.trim() || null,
          color,
          binRows,
          binCols,
        });
        toast.success("Drawer updated");
      } else {
        await api.post("/api/drawers", {
          boxId,
          name: name.trim(),
          label: label.trim() || null,
          color,
          binRows,
          binCols,
        });
        toast.success("Drawer added");
      }
      onOpenChange(false);
      onSaved();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Could not save drawer";
      toast.error({ title: "Save failed", description: message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit drawer" : "New drawer"}</DialogTitle>
          <DialogDescription>
            A drawer sits in the box front view and contains a grid of bins.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="drawer-name">Name</Label>
              <Input
                id="drawer-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. M3 hardware"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="drawer-label">Label</Label>
              <Input
                id="drawer-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="A1"
                className="w-20"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setColor(null)}
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full border text-xs",
                  color === null ? "border-primary ring-2 ring-primary/40" : "border-border",
                )}
                aria-label="No color"
              >
                ✕
              </button>
              {COLOR_SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  style={{ backgroundColor: c }}
                  className={cn(
                    "h-7 w-7 rounded-full border border-black/10 transition-transform hover:scale-110",
                    color === c && "ring-2 ring-offset-2 ring-offset-card ring-foreground",
                  )}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="bin-rows">Bin rows</Label>
              <Input
                id="bin-rows"
                type="number"
                min={1}
                max={12}
                value={binRows}
                onChange={(e) => setBinRows(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bin-cols">Bin columns</Label>
              <Input
                id="bin-cols"
                type="number"
                min={1}
                max={12}
                value={binCols}
                onChange={(e) => setBinCols(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? "Save changes" : "Add drawer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
