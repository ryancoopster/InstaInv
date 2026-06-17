"use client";

import * as React from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Check, X, ShoppingCart, PackageCheck, Trash2, ClipboardList } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { applySort, formatCurrency } from "@/lib/utils";
import { usePermissions } from "@/components/shell/permission-context";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "@/components/ui/toast";
import { SortableRow } from "@/components/orders/sortable-row";
import { SortHeader, type SortState } from "@/components/orders/sort-header";
import { StatusBadge, SourceBadge } from "@/components/orders/status-badge";
import type { SerializedRequest } from "@/components/orders/serialize";

// Wrap a request with the primitive fields the column-sort needs. We keep the
// original request under `req` and expose flat sort keys (prefixed `s_`) so they
// never collide with the request's own object-typed fields (e.g. `supplier`).
interface SortableRequest {
  id: string;
  sortOrder: number;
  req: SerializedRequest;
  s_name: string;
  s_supplier: string;
  s_quantity: number;
  s_status: string;
  s_requester: string;
}

function withSortFields(r: SerializedRequest): SortableRequest {
  return {
    id: r.id,
    sortOrder: r.sortOrder,
    req: r,
    s_name: r.displayName,
    s_supplier: r.supplierName,
    s_quantity: r.quantity,
    s_status: r.status,
    s_requester: r.requestedBy?.name ?? "",
  };
}

// Controlled list: the parent owns `rows` so the request form can prepend new
// rows. The list handles drag reorder + column sort + status transitions.
export function RequestList({
  rows,
  setRows,
}: {
  rows: SerializedRequest[];
  setRows: React.Dispatch<React.SetStateAction<SerializedRequest[]>>;
}) {
  const { can } = usePermissions();
  const [sort, setSort] = React.useState<SortState>({ key: null, dir: "asc" });
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const canApprove = can("orders.approve");
  const canMark = can("orders.markOrdered");
  const showRequester = can("orders.viewAll");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  // Manual drag order is the default; a column sort overrides it at view time.
  const view = React.useMemo(() => {
    const enriched = rows.map(withSortFields);
    return applySort(enriched, sort.key, sort.dir);
  }, [rows, sort]);

  const manualMode = sort.key === null;

  async function patch(id: string, body: Record<string, unknown>) {
    setBusyId(id);
    try {
      const updated = await api.patch<SerializedRequest>(`/api/requests/${id}`, body);
      setRows((prev) => prev.map((r) => (r.id === id ? updated : r)));
      toast.success("Request updated");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    setBusyId(id);
    try {
      await api.del(`/api/requests/${id}`);
      setRows((prev) => prev.filter((r) => r.id !== id));
      toast.success("Request deleted");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  }

  async function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = rows.findIndex((r) => r.id === active.id);
    const newIndex = rows.findIndex((r) => r.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(rows, oldIndex, newIndex);
    setRows(next);
    try {
      await api.patch("/api/requests/reorder", { ids: next.map((r) => r.id) });
    } catch {
      toast.error("Could not save new order");
    }
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="No requests yet"
        description="Submit a request for an item you need and it'll show up here."
      />
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragEnd={onDragEnd}
    >
      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <SortHeader label="Item" sortKey="s_name" sort={sort} onSort={setSort} />
              <SortHeader label="Supplier" sortKey="s_supplier" sort={sort} onSort={setSort} />
              <SortHeader
                label="Qty"
                sortKey="s_quantity"
                sort={sort}
                onSort={setSort}
                className="text-right"
              />
              <TableHead>Source</TableHead>
              <SortHeader label="Status" sortKey="s_status" sort={sort} onSort={setSort} />
              {showRequester && (
                <SortHeader
                  label="Requester"
                  sortKey="s_requester"
                  sort={sort}
                  onSort={setSort}
                />
              )}
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <SortableContext
              items={view.map((r) => r.id)}
              strategy={verticalListSortingStrategy}
            >
              {view.map((entry) => {
                const r = entry.req;
                const cost = r.unitCost ? formatCurrency(r.unitCost) : "—";
                return (
                  <SortableRow key={r.id} id={r.id} disabled={!manualMode}>
                    <TableCell className="font-medium">
                      <div>{r.displayName}</div>
                      {r.item?.partNumber || r.freePartNumber ? (
                        <div className="text-xs text-muted-foreground">
                          {r.item?.partNumber ?? r.freePartNumber}
                        </div>
                      ) : null}
                      {r.note ? (
                        <div className="mt-0.5 text-xs italic text-muted-foreground">
                          {r.note}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{r.supplierName}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      <div>{r.quantity}</div>
                      <div className="text-xs text-muted-foreground">{cost} ea</div>
                    </TableCell>
                    <TableCell>
                      <SourceBadge source={r.source} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} />
                    </TableCell>
                    {showRequester && (
                      <TableCell className="text-muted-foreground">
                        {r.requestedBy?.name ?? "—"}
                      </TableCell>
                    )}
                    <TableCell>
                      <RowActions
                        request={r}
                        busy={busyId === r.id}
                        canApprove={canApprove}
                        canMark={canMark}
                        onPatch={patch}
                        onDelete={remove}
                      />
                    </TableCell>
                  </SortableRow>
                );
              })}
            </SortableContext>
          </TableBody>
        </Table>
      </div>
      {!manualMode && (
        <p className="mt-2 text-xs text-muted-foreground">
          Sorted by a column. Clear the sort to drag-reorder manually.
        </p>
      )}
    </DndContext>
  );
}

function RowActions({
  request: r,
  busy,
  canApprove,
  canMark,
  onPatch,
  onDelete,
}: {
  request: SerializedRequest;
  busy: boolean;
  canApprove: boolean;
  canMark: boolean;
  onPatch: (id: string, body: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
}) {
  const isExistingItem = Boolean(r.itemId);

  return (
    <div className="flex items-center justify-end gap-1">
      {/* Approve / Reject — visible while still REQUESTED */}
      {canApprove && r.status === "REQUESTED" && (
        <>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => onPatch(r.id, { status: "APPROVED" })}
            title="Approve"
          >
            <Check className="h-4 w-4" />
            Approve
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => onPatch(r.id, { status: "REJECTED" })}
            title="Reject"
          >
            <X className="h-4 w-4" />
          </Button>
        </>
      )}

      {/* Mark Ordered — once APPROVED */}
      {canMark && r.status === "APPROVED" && (
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => onPatch(r.id, { status: "ORDERED" })}
          title="Mark ordered"
        >
          <ShoppingCart className="h-4 w-4" />
          Ordered
        </Button>
      )}

      {/* Mark Received — once ORDERED. For existing items, add qty to stock. */}
      {canMark && r.status === "ORDERED" && (
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => onPatch(r.id, { status: "RECEIVED", applyToStock: isExistingItem })}
          title={isExistingItem ? "Mark received & add to stock" : "Mark received"}
        >
          <PackageCheck className="h-4 w-4" />
          Received
        </Button>
      )}

      {/* Delete — owner of a pending request or an approver. */}
      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={() => onDelete(r.id)}
        title="Delete"
        className="text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
