"use client";

import * as React from "react";
import { Loader2, MoreVertical, Minus, Package, Plus, FolderOutput, PackageX, FolderInput } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { applySort, cn, formatNumber } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";
import { AssignToBoxDialog } from "./AssignToBoxDialog";
import type { BinDetail, DrawerItem } from "./types";

interface DrawerItemsListProps {
  drawerId: string;
  items: DrawerItem[];
  bins: BinDetail[];
  canAdjust: boolean;
  canReorganize: boolean;
  onAdjusted: (itemId: string, quantity: number) => void;
  /** Remove an item from the drawer entirely (move it out / unassign). */
  onMovedOut: (itemId: string) => void;
  onBinChanged: (itemId: string, binId: string | null) => void;
}

type SortKey = "manual" | "name" | "quantity";

interface AdjustResult {
  id: string;
  quantity: number;
}

export function DrawerItemsList({
  drawerId,
  items,
  bins,
  canAdjust,
  canReorganize,
  onAdjusted,
  onMovedOut,
  onBinChanged,
}: DrawerItemsListProps) {
  const [sortKey, setSortKey] = React.useState<SortKey>("manual");
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [assignItem, setAssignItem] = React.useState<DrawerItem | null>(null);

  const view =
    sortKey === "manual"
      ? applySort(items, null)
      : applySort(items, sortKey, sortKey === "name" ? "asc" : "desc");

  const binName = React.useCallback(
    (binId: string | null) => bins.find((b) => b.id === binId)?.name || (binId ? "Bin" : null),
    [bins],
  );

  async function adjust(item: DrawerItem, delta: number) {
    setBusyId(item.id);
    try {
      const res = await api.patch<AdjustResult>(`/api/items/${item.id}/adjust`, { delta });
      onAdjusted(item.id, res.quantity);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Adjust failed";
      toast.error({ title: "Could not adjust", description: message });
    } finally {
      setBusyId(null);
    }
  }

  async function changeBin(item: DrawerItem, binId: string | null) {
    setBusyId(item.id);
    try {
      await api.post("/api/items/move", { itemId: item.id, drawerId, binId });
      onBinChanged(item.id, binId);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Move failed";
      toast.error({ title: "Could not move", description: message });
    } finally {
      setBusyId(null);
    }
  }

  async function unassignFromDrawer(item: DrawerItem) {
    setBusyId(item.id);
    try {
      // Clear drawer + bin but keep the item in its box.
      await api.post("/api/items/move", { itemId: item.id, drawerId: null, binId: null });
      onMovedOut(item.id);
      toast.success(`${item.name} removed from the drawer (still in the box)`);
    } catch (err) {
      toast.error({
        title: "Could not unassign",
        description: err instanceof ApiError ? err.message : "Move failed",
      });
    } finally {
      setBusyId(null);
    }
  }

  async function unassignFromBox(item: DrawerItem) {
    setBusyId(item.id);
    try {
      await api.post("/api/items/move", { itemId: item.id, boxId: null, drawerId: null, binId: null });
      onMovedOut(item.id);
      toast.success(`${item.name} removed from the box`);
    } catch (err) {
      toast.error({
        title: "Could not unassign",
        description: err instanceof ApiError ? err.message : "Move failed",
      });
    } finally {
      setBusyId(null);
    }
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Package}
        title="No items in this drawer"
        description="Items placed in this drawer (from the items area) will appear here."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-2">
        <span className="text-xs text-muted-foreground">Sort</span>
        <Select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="h-8 w-[140px]"
          aria-label="Sort items"
        >
          <option value="manual">Manual</option>
          <option value="name">Name</option>
          <option value="quantity">Quantity</option>
        </Select>
      </div>

      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead className="w-40">Bin</TableHead>
              <TableHead className="w-44 text-center">Quantity</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {view.map((item) => {
              const busy = busyId === item.id;
              return (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {item.category?.color && (
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: item.category.color }}
                        />
                      )}
                      <div className="min-w-0">
                        <p className="truncate font-medium">{item.name}</p>
                        {item.category?.name && (
                          <p className="truncate text-xs text-muted-foreground">{item.category.name}</p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {canReorganize ? (
                      <Select
                        value={item.binId ?? ""}
                        onChange={(e) => changeBin(item, e.target.value || null)}
                        disabled={busy}
                        className="h-8 text-xs"
                        aria-label="Move to bin"
                      >
                        <option value="">Unassigned</option>
                        {bins.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name || "Bin"}
                          </option>
                        ))}
                      </Select>
                    ) : item.binId ? (
                      <Badge variant="outline">{binName(item.binId)}</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">Unassigned</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => adjust(item, -1)}
                        disabled={!canAdjust || busy || item.quantity <= 0}
                        aria-label="Decrease"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </Button>
                      <span className={cn("w-12 text-center font-medium tabular-nums", busy && "opacity-50")}>
                        {busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : formatNumber(item.quantity)}
                      </span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => adjust(item, 1)}
                        disabled={!canAdjust || busy}
                        aria-label="Increase"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    {canReorganize && (
                      <DropdownMenu>
                        <DropdownMenuTrigger>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            disabled={busy}
                            aria-label="Item actions"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => unassignFromDrawer(item)}>
                            <FolderOutput /> Unassign from drawer
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setAssignItem(item)}>
                            <FolderInput /> Assign to other box…
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem destructive onClick={() => unassignFromBox(item)}>
                            <PackageX /> Unassign from box
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {assignItem && (
        <AssignToBoxDialog
          open={assignItem !== null}
          onOpenChange={(o) => !o && setAssignItem(null)}
          itemId={assignItem.id}
          itemName={assignItem.name}
          onAssigned={() => {
            const id = assignItem.id;
            setAssignItem(null);
            onMovedOut(id);
          }}
        />
      )}
    </div>
  );
}
