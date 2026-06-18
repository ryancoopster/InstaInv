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

// Move a bin (and its items) into another drawer. Box defaults to the bin's
// current box.
export function BinMoveDialog({
  open,
  onOpenChange,
  binId,
  binName,
  defaultBoxId,
  currentDrawerId,
  onMoved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  binId: string;
  binName: string;
  defaultBoxId: string;
  currentDrawerId: string;
  onMoved: () => void;
}) {
  const [boxes, setBoxes] = React.useState<BoxListItem[]>([]);
  const [drawers, setDrawers] = React.useState<DrawerSummary[]>([]);
  const [boxId, setBoxId] = React.useState(defaultBoxId);
  const [drawerId, setDrawerId] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setBoxId(defaultBoxId);
    setDrawerId("");
    api
      .get<BoxListItem[]>("/api/boxes")
      .then(setBoxes)
      .catch((err) => toast.error(err instanceof ApiError ? err.message : "Could not load boxes"));
  }, [open, defaultBoxId]);

  React.useEffect(() => {
    if (!boxId) {
      setDrawers([]);
      return;
    }
    api
      .get<DrawerSummary[]>(`/api/drawers?boxId=${boxId}`)
      .then(setDrawers)
      .catch(() => setDrawers([]));
  }, [boxId]);

  async function save() {
    if (!drawerId) {
      toast.error("Pick a destination drawer");
      return;
    }
    setSaving(true);
    try {
      await api.post(`/api/bins/${binId}/action`, { action: "move", drawerId });
      toast.success(`Moved bin “${binName || "Bin"}”`);
      onMoved();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not move bin");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Move bin “{binName || "Bin"}”</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="bin-move-box">Box</Label>
            <Select
              id="bin-move-box"
              value={boxId}
              onChange={(e) => {
                setBoxId(e.target.value);
                setDrawerId("");
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
            <Label htmlFor="bin-move-drawer">Drawer</Label>
            <Select
              id="bin-move-drawer"
              value={drawerId}
              disabled={!boxId}
              onChange={(e) => setDrawerId(e.target.value)}
            >
              <option value="">Select a drawer…</option>
              {drawers
                .filter((d) => d.id !== currentDrawerId)
                .map((d) => (
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
          <Button onClick={save} disabled={saving || !drawerId}>
            {saving ? "Moving…" : "Move bin"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
