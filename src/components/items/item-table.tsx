"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  Search,
  Plus,
  Minus,
  Package,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ImageIcon,
  RefreshCw,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { cn, formatNumber, formatCurrency, reorderQty, applySort } from "@/lib/utils";
import { PriceStatusDot } from "@/components/pricing/price-status";
import type { ApplyFetchResult } from "@/lib/pricing/types";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { usePermissions } from "@/components/shell/permission-context";
import { SortableList, SortableRow, SortableHandle } from "./sortable";
import { ItemForm } from "./item-form";
import { ItemRowMenu } from "./item-row-menu";
import type {
  ItemRow,
  CategoryOption,
  SupplierOption,
  BoxOption,
} from "./types";

interface ItemTableProps {
  initialItems: ItemRow[];
  categories: CategoryOption[];
  suppliers: SupplierOption[];
  boxes: BoxOption[];
  initialQuery: string;
  initialCategoryId: string;
  initialSupplierId: string;
}

type SortKey =
  | "name"
  | "partNumber"
  | "categoryName"
  | "supplierName"
  | "quantity"
  | "desiredQuantity"
  | null;

export function ItemTable({
  initialItems,
  categories,
  suppliers,
  boxes,
  initialQuery,
  initialCategoryId,
  initialSupplierId,
}: ItemTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { can } = usePermissions();
  const canEdit = can("items.edit");
  const canCreate = can("items.create");
  const canAdjust = can("items.adjustQuantity");
  const canPricing = can("pricing.manage");

  const [items, setItems] = React.useState<ItemRow[]>(initialItems);
  const [query, setQuery] = React.useState(initialQuery);
  const [categoryId, setCategoryId] = React.useState(initialCategoryId);
  const [supplierId, setSupplierId] = React.useState(initialSupplierId);
  const [sortKey, setSortKey] = React.useState<SortKey>(null);
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("asc");
  const [newOpen, setNewOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [pricingBusyId, setPricingBusyId] = React.useState<string | null>(null);

  React.useEffect(() => setItems(initialItems), [initialItems]);

  // Push filter state into the URL (?q=&categoryId=&supplierId=) and refetch.
  const applyFilters = React.useCallback(
    (next: { query?: string; categoryId?: string; supplierId?: string }) => {
      const params = new URLSearchParams(searchParams.toString());
      const q = next.query ?? query;
      const cat = next.categoryId ?? categoryId;
      const sup = next.supplierId ?? supplierId;
      q ? params.set("q", q) : params.delete("q");
      cat ? params.set("categoryId", cat) : params.delete("categoryId");
      sup ? params.set("supplierId", sup) : params.delete("supplierId");
      router.replace(`${pathname}?${params.toString()}`);
    },
    [query, categoryId, supplierId, searchParams, router, pathname],
  );

  // Debounced search.
  React.useEffect(() => {
    if (query === initialQuery) return;
    const t = setTimeout(() => applyFilters({ query }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // Decorate rows with flattened sort keys so applySort can use them.
  const decorated = React.useMemo(
    () =>
      items.map((it) => ({
        ...it,
        categoryName: it.category?.name ?? "",
        supplierName: it.supplier?.name ?? "",
      })),
    [items],
  );

  const sorted = React.useMemo(
    () => applySort(decorated, sortKey, sortDir),
    [decorated, sortKey, sortDir],
  );

  const dragDisabled = sortKey !== null || !canEdit;

  function toggleSort(key: Exclude<SortKey, null>) {
    if (sortKey === key) {
      if (sortDir === "asc") setSortDir("desc");
      else {
        setSortKey(null);
        setSortDir("asc");
      }
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  async function persistReorder(orderedIds: string[]) {
    const byId = new Map(items.map((i) => [i.id, i]));
    const reordered = orderedIds.map((id) => byId.get(id)!).filter(Boolean);
    setItems(reordered);
    try {
      await api.patch("/api/items/reorder", { ids: orderedIds });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Reorder failed");
    }
  }

  async function adjust(item: ItemRow, delta: number) {
    const optimistic = Math.max(0, item.quantity + delta);
    setItems((rows) =>
      rows.map((r) => (r.id === item.id ? { ...r, quantity: optimistic } : r)),
    );
    try {
      const updated = await api.patch<ItemRow>(`/api/items/${item.id}/adjust`, { delta });
      setItems((rows) => rows.map((r) => (r.id === item.id ? updated : r)));
    } catch (err) {
      setItems((rows) => rows.map((r) => (r.id === item.id ? item : r)));
      toast.error(err instanceof ApiError ? err.message : "Adjust failed");
    }
  }

  async function refreshPrice(item: ItemRow) {
    setPricingBusyId(item.id);
    try {
      const result = await api.post<ApplyFetchResult>(`/api/pricing/items/${item.id}/refresh`, {});
      setItems((rows) =>
        rows.map((r) =>
          r.id === item.id
            ? {
                ...r,
                lastFetchedPrice: result.lastFetchedPrice,
                priceUpdatedAt: result.priceUpdatedAt,
                priceFetchStatus: result.priceFetchStatus,
              }
            : r,
        ),
      );
      if (result.success) toast.success(`Price updated for "${item.name}"`);
      else toast.warning(result.note ?? "No price found");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Refresh failed");
    } finally {
      setPricingBusyId(null);
    }
  }

  function onItemCreated() {
    setNewOpen(false);
    setLoading(true);
    router.refresh();
    setLoading(false);
  }

  function handleDeleted(id: string) {
    setItems((rows) => rows.filter((r) => r.id !== id));
  }

  function handleUpdated(updated: ItemRow) {
    setItems((rows) => rows.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)));
  }

  const orderedIds = sorted.map((i) => i.id);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search name, part #, SKU…"
              className="pl-8"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Select
            className="sm:max-w-[12rem]"
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value);
              applyFilters({ categoryId: e.target.value });
            }}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select
            className="sm:max-w-[12rem]"
            value={supplierId}
            onChange={(e) => {
              setSupplierId(e.target.value);
              applyFilters({ supplierId: e.target.value });
            }}
          >
            <option value="">All suppliers</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
        {canCreate && (
          <Button onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4" />
            New item
          </Button>
        )}
      </div>

      {sortKey && (
        <p className="text-xs text-muted-foreground">
          Sorted by column — drag reordering is paused.{" "}
          <button
            className="underline"
            onClick={() => {
              setSortKey(null);
              setSortDir("asc");
            }}
          >
            Reset to manual order
          </button>
        </p>
      )}

      {sorted.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No items found"
          description={
            query || categoryId || supplierId
              ? "Try adjusting your search or filters."
              : "Add your first inventory item to get started."
          }
          action={
            canCreate ? (
              <Button onClick={() => setNewOpen(true)}>
                <Plus className="h-4 w-4" />
                New item
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead className="w-12" />
                <SortHead label="Name" active={sortKey === "name"} dir={sortDir} onClick={() => toggleSort("name")} />
                <SortHead label="Part #" active={sortKey === "partNumber"} dir={sortDir} onClick={() => toggleSort("partNumber")} />
                <SortHead label="Category" active={sortKey === "categoryName"} dir={sortDir} onClick={() => toggleSort("categoryName")} />
                <SortHead label="Supplier" active={sortKey === "supplierName"} dir={sortDir} onClick={() => toggleSort("supplierName")} />
                {canPricing && <TableHead>Price</TableHead>}
                <TableHead>Location</TableHead>
                <SortHead label="Qty" align="right" active={sortKey === "quantity"} dir={sortDir} onClick={() => toggleSort("quantity")} />
                <SortHead label="Desired" align="right" active={sortKey === "desiredQuantity"} dir={sortDir} onClick={() => toggleSort("desiredQuantity")} />
                <TableHead className="text-right">Reorder</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              <SortableList ids={orderedIds} onReorder={persistReorder} disabled={dragDisabled}>
                {sorted.map((item) => {
                  const reorder = reorderQty(
                    item.quantity,
                    Math.max(item.desiredQuantity, item.minQuantity),
                  );
                  const location = [
                    item.drawer?.box?.name,
                    item.drawer?.label || item.drawer?.name,
                    item.bin?.name,
                  ]
                    .filter(Boolean)
                    .join(" › ");
                  return (
                    <SortableRow key={item.id} id={item.id}>
                      <TableCell className="pr-0">
                        {!dragDisabled ? (
                          <SortableHandle />
                        ) : (
                          <span className="inline-block h-7 w-7" />
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
                          {item.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <ImageIcon className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/items/${item.id}`}
                          className="font-medium text-foreground hover:underline"
                        >
                          {item.name}
                        </Link>
                        {item.sku && (
                          <div className="text-xs text-muted-foreground">{item.sku}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {item.partNumber || "—"}
                      </TableCell>
                      <TableCell>
                        {item.category ? (
                          <span className="inline-flex items-center gap-1.5">
                            {item.category.color && (
                              <span
                                className="h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: item.category.color }}
                              />
                            )}
                            {item.category.name}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {item.supplier?.name || "—"}
                      </TableCell>
                      {canPricing && (
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            {item.lastFetchedPrice != null ? (
                              <span className="inline-flex items-center gap-1 tabular-nums">
                                <PriceStatusDot status={item.priceFetchStatus} />
                                {formatCurrency(item.lastFetchedPrice)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              aria-label="Refresh price"
                              title="Refresh price"
                              disabled={pricingBusyId === item.id}
                              onClick={() => refreshPrice(item)}
                            >
                              <RefreshCw
                                className={cn(
                                  "h-3 w-3",
                                  pricingBusyId === item.id && "animate-spin",
                                )}
                              />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                      <TableCell className="max-w-[14rem] truncate text-muted-foreground">
                        {location || <span className="italic">Unassigned</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-1">
                          {canAdjust && (
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-6 w-6"
                              aria-label="Decrease"
                              onClick={() => adjust(item, -1)}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                          )}
                          <span className="min-w-[2.5rem] text-center tabular-nums">
                            {formatNumber(item.quantity)}
                            {item.unit ? <span className="text-muted-foreground"> {item.unit}</span> : null}
                          </span>
                          {canAdjust && (
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-6 w-6"
                              aria-label="Increase"
                              onClick={() => adjust(item, 1)}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatNumber(item.desiredQuantity)}
                      </TableCell>
                      <TableCell className="text-right">
                        {reorder > 0 ? (
                          <Badge
                            variant={
                              item.minQuantity > 0 && item.quantity < item.minQuantity
                                ? "destructive"
                                : "warning"
                            }
                          >
                            +{formatNumber(reorder)}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="pl-0 text-right">
                        <ItemRowMenu
                          item={item}
                          boxes={boxes}
                          onDeleted={handleDeleted}
                          onUpdated={handleUpdated}
                        />
                      </TableCell>
                    </SortableRow>
                  );
                })}
              </SortableList>
            </TableBody>
          </Table>
        </div>
      )}

      {/* New item dialog */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>New item</DialogTitle>
          </DialogHeader>
          <ItemForm
            categories={categories}
            suppliers={suppliers}
            boxes={boxes}
            onSaved={onItemCreated}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SortHead({
  label,
  active,
  dir,
  onClick,
  align = "left",
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
  align?: "left" | "right";
}) {
  return (
    <TableHead className={align === "right" ? "text-right" : undefined}>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground",
          active && "text-foreground",
        )}
      >
        {label}
        {active ? (
          dir === "asc" ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-50" />
        )}
      </button>
    </TableHead>
  );
}
