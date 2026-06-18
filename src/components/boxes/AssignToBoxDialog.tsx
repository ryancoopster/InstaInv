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
import { toast } from "@/components/ui/toast";
import type { BoxListItem, DrawerSummary } from "./types";

// Reusable "assign this item to a (different) box + optional drawer" dialog.
// Calls /api/items/move; the box defaults to defaultBoxId when provided.
export function AssignToBoxDialog({
  open,
  onOpenChange,
  itemId,
  itemName,
  defaultBoxId,
  onAssigned,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemId: string;
  itemName: string;
  defaultBoxId?: string | null;
  onAssigned: () => void;
}) {
  const [boxes, setBoxes] = React.useState<BoxListItem[]>([]);
  const [drawers, setDrawers] = React.useState<DrawerSummary[]>([]);
  const [boxId, setBoxId] = React.useState("");
  const [drawerId, setDrawerId] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setBoxId(defaultBoxId ?? "");
    setDrawerId("");
    setLoading(true);
    api
      .get<BoxListItem[]>("/api/boxes")
      .then((b) => setBoxes(b))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : "Could not load boxes"))
      .finally(() => setLoading(false));
  }, [open, defaultBoxId]);

  React.useEffect(() => {
    if (!boxId) {
      setDrawers([]);
      return;
    }
    api
      .get<DrawerSummary[]>(`/api/drawers?boxId=${boxId}`)
      .then((d) => setDrawers(d))
      .catch(() => setDrawers([]));
  }, [boxId]);

  async function save() {
    setSaving(true);
    try {
      await api.post("/api/items/move", {
        itemId,
        boxId: boxId || null,
        drawerId: drawerId || null,
        binId: null,
      });
      toast.success(`Moved "${itemName}"`);
      onAssigned();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not move item");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Assign “{itemName}” to a box</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="assign-box">Box</Label>
            <Select
              id="assign-box"
              value={boxId}
              disabled={loading}
              onChange={(e) => {
                setBoxId(e.target.value);
                setDrawerId("");
              }}
            >
              <option value="">No box (unassigned)</option>
              {boxes.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="assign-drawer">Drawer (optional)</Label>
            <Select
              id="assign-drawer"
              value={drawerId}
              disabled={!boxId}
              onChange={(e) => setDrawerId(e.target.value)}
            >
              <option value="">In box, no drawer</option>
              {drawers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label ? `${d.label} — ${d.name}` : d.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Moving…" : "Move item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
