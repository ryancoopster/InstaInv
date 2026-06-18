"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { MoreVertical, Pencil, Copy, History, FolderInput, Trash2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toast";
import { usePermissions } from "@/components/shell/permission-context";
import { PurchaseHistoryPanel } from "./purchase-history-panel";
import type { ItemRow, BoxOption } from "./types";

export function ItemRowMenu({
  item,
  boxes,
  onDeleted,
  onUpdated,
}: {
  item: ItemRow;
  boxes: BoxOption[];
  onDeleted: (id: string) => void;
  onUpdated: (item: ItemRow) => void;
}) {
  const router = useRouter();
  const { can } = usePermissions();
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [moveOpen, setMoveOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  const canEdit = can("items.edit");
  const canCreate = can("items.create");
  const canDelete = can("items.delete");
  const canViewPurchases = can("orders.viewAll");

  async function del() {
    setDeleting(true);
    try {
      await api.del(`/api/items/${item.id}`);
      toast.success(`Deleted "${item.name}"`);
      onDeleted(item.id);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
      setConfirmOpen(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger>
          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Item actions">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canEdit && (
            <DropdownMenuItem onClick={() => router.push(`/items/${item.id}`)}>
              <Pencil /> Edit
            </DropdownMenuItem>
          )}
          {canViewPurchases && (
            <DropdownMenuItem onClick={() => setHistoryOpen(true)}>
              <History /> View purchase history
            </DropdownMenuItem>
          )}
          {canCreate && (
            <DropdownMenuItem onClick={() => router.push(`/items/new?from=${item.id}`)}>
              <Copy /> Duplicate
            </DropdownMenuItem>
          )}
          {canEdit && (
            <DropdownMenuItem onClick={() => setMoveOpen(true)}>
              <FolderInput /> Change box / location
            </DropdownMenuItem>
          )}
          {canDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive onClick={() => setConfirmOpen(true)}>
                <Trash2 /> Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete item?"
        description={
          <>
            This permanently deletes <strong>{item.name}</strong>
            {item.partNumber ? ` (${item.partNumber})` : ""} and <strong>cannot be undone</strong>.
          </>
        }
        confirmLabel="Delete"
        destructive
        busy={deleting}
        onConfirm={del}
      />

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Purchase history — {item.name}</DialogTitle>
          </DialogHeader>
          {historyOpen && <PurchaseHistoryPanel itemId={item.id} />}
        </DialogContent>
      </Dialog>

      <ChangeLocationDialog
        open={moveOpen}
        onOpenChange={setMoveOpen}
        item={item}
        boxes={boxes}
        onUpdated={onUpdated}
      />
    </>
  );
}

function ChangeLocationDialog({
  open,
  onOpenChange,
  item,
  boxes,
  onUpdated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: ItemRow;
  boxes: BoxOption[];
  onUpdated: (item: ItemRow) => void;
}) {
  const currentBox = boxes.find((b) => b.drawers.some((d) => d.id === item.drawerId));
  const [boxId, setBoxId] = React.useState(currentBox?.id ?? "");
  const [drawerId, setDrawerId] = React.useState(item.drawerId ?? "");
  const [binId, setBinId] = React.useState(item.binId ?? "");
  const [saving, setSaving] = React.useState(false);

  // Reset local state whenever the dialog opens for this item.
  React.useEffect(() => {
    if (open) {
      const box = boxes.find((b) => b.drawers.some((d) => d.id === item.drawerId));
      setBoxId(box?.id ?? "");
      setDrawerId(item.drawerId ?? "");
      setBinId(item.binId ?? "");
    }
  }, [open, item, boxes]);

  const drawers = boxes.find((b) => b.id === boxId)?.drawers ?? [];
  const bins = drawers.find((d) => d.id === drawerId)?.bins ?? [];

  async function save() {
    setSaving(true);
    try {
      const updated = await api.patch<ItemRow>(`/api/items/${item.id}`, {
        drawerId: drawerId || null,
        binId: binId || null,
      });
      toast.success("Location updated");
      onUpdated(updated);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not update location");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Change location — {item.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="move-box">Box</Label>
            <Select
              id="move-box"
              value={boxId}
              onChange={(e) => {
                setBoxId(e.target.value);
                setDrawerId("");
                setBinId("");
              }}
            >
              <option value="">No box</option>
              {boxes.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="move-drawer">Drawer</Label>
            <Select
              id="move-drawer"
              value={drawerId}
              disabled={!boxId}
              onChange={(e) => {
                setDrawerId(e.target.value);
                setBinId("");
              }}
            >
              <option value="">No drawer</option>
              {drawers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label ? `${d.label} — ${d.name}` : d.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="move-bin">Bin</Label>
            <Select id="move-bin" value={binId} disabled={!drawerId} onChange={(e) => setBinId(e.target.value)}>
              <option value="">No bin</option>
              {bins.map((bin) => (
                <option key={bin.id} value={bin.id}>
                  {bin.name ?? "Unnamed bin"}
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
            {saving ? "Saving…" : "Save location"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
