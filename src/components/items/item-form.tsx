"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Save, Trash2, ExternalLink } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { usePermissions } from "@/components/shell/permission-context";
import { ImageUpload } from "./image-upload";
import { CustomFieldsInputs } from "./custom-fields-inputs";
import type {
  ItemRow,
  CategoryOption,
  SupplierOption,
  BoxOption,
  CustomFieldDef,
} from "./types";

interface ItemFormState {
  name: string;
  description: string;
  partNumber: string;
  sku: string;
  barcode: string;
  purchaseCost: string;
  unit: string;
  quantity: number;
  desiredQuantity: number;
  minQuantity: number;
  imageUrl: string | null;
  supplierId: string;
  supplierLink: string;
  categoryId: string;
  drawerId: string;
  binId: string;
  customValues: Record<string, unknown>;
}

function toState(item?: ItemRow | null): ItemFormState {
  return {
    name: item?.name ?? "",
    description: item?.description ?? "",
    partNumber: item?.partNumber ?? "",
    sku: item?.sku ?? "",
    barcode: item?.barcode ?? "",
    purchaseCost: item ? String(item.purchaseCost ?? "0") : "0",
    unit: item?.unit ?? "",
    quantity: item?.quantity ?? 0,
    desiredQuantity: item?.desiredQuantity ?? 0,
    minQuantity: item?.minQuantity ?? 0,
    imageUrl: item?.imageUrl ?? null,
    supplierId: item?.supplierId ?? "",
    supplierLink: item?.supplierLink ?? "",
    categoryId: item?.categoryId ?? "",
    drawerId: item?.drawerId ?? "",
    binId: item?.binId ?? "",
    customValues: (item?.customValues as Record<string, unknown>) ?? {},
  };
}

interface ItemFormProps {
  item?: ItemRow | null;
  categories: CategoryOption[];
  suppliers: SupplierOption[];
  boxes: BoxOption[];
  // Preloaded custom fields for the item's current category (avoids a flash).
  initialFields?: CustomFieldDef[];
  onSaved?: (item: ItemRow) => void;
  onDeleted?: (id: string) => void;
}

export function ItemForm({
  item,
  categories,
  suppliers,
  boxes,
  initialFields = [],
  onSaved,
  onDeleted,
}: ItemFormProps) {
  const router = useRouter();
  const { can } = usePermissions();
  const isNew = !item;
  const canEdit = isNew ? can("items.create") : can("items.edit");
  const canDelete = can("items.delete");

  const [state, setState] = React.useState<ItemFormState>(() => toState(item));
  const [fields, setFields] = React.useState<CustomFieldDef[]>(initialFields);
  const [saving, setSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  const set = <K extends keyof ItemFormState>(key: K, value: ItemFormState[K]) =>
    setState((s) => ({ ...s, [key]: value }));

  // Load the selected category's custom field definitions whenever it changes.
  const lastLoadedCategory = React.useRef<string>(item?.categoryId ?? "");
  React.useEffect(() => {
    const categoryId = state.categoryId;
    if (categoryId === lastLoadedCategory.current) return;
    lastLoadedCategory.current = categoryId;

    if (!categoryId) {
      setFields([]);
      return;
    }
    let cancelled = false;
    api
      .get<CustomFieldDef[]>(`/api/custom-fields?categoryId=${categoryId}`)
      .then((defs) => {
        if (!cancelled) setFields(defs);
      })
      .catch(() => {
        if (!cancelled) setFields([]);
      });
    return () => {
      cancelled = true;
    };
  }, [state.categoryId]);

  // Cascading location pickers.
  const selectedBox = boxes.find((b) => b.drawers.some((d) => d.id === state.drawerId));
  const drawersForBox = selectedBox?.drawers ?? [];
  const [boxId, setBoxId] = React.useState<string>(selectedBox?.id ?? "");
  const drawers = boxes.find((b) => b.id === boxId)?.drawers ?? [];
  const binsForDrawer = drawers.find((d) => d.id === state.drawerId)?.bins ?? [];

  async function handleSave() {
    if (!state.name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: state.name.trim(),
        description: state.description || null,
        partNumber: state.partNumber || null,
        sku: state.sku || null,
        barcode: state.barcode || null,
        purchaseCost: state.purchaseCost === "" ? 0 : Number(state.purchaseCost),
        unit: state.unit || null,
        quantity: Number(state.quantity) || 0,
        desiredQuantity: Number(state.desiredQuantity) || 0,
        minQuantity: Number(state.minQuantity) || 0,
        imageUrl: state.imageUrl,
        supplierId: state.supplierId || null,
        supplierLink: state.supplierLink || null,
        categoryId: state.categoryId || null,
        drawerId: state.drawerId || null,
        binId: state.binId || null,
        customValues: state.customValues,
      };

      const saved = isNew
        ? await api.post<ItemRow>("/api/items", payload)
        : await api.patch<ItemRow>(`/api/items/${item!.id}`, payload);

      toast.success(isNew ? "Item created" : "Item saved");
      if (onSaved) onSaved(saved);
      else {
        router.push("/items");
        router.refresh();
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!item) return;
    if (!confirm(`Delete "${item.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await api.del(`/api/items/${item.id}`);
      toast.success("Item deleted");
      if (onDeleted) onDeleted(item.id);
      else {
        router.push("/items");
        router.refresh();
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  const disabled = !canEdit || saving;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Left: core fields */}
      <div className="space-y-6 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={state.name}
                disabled={disabled}
                onChange={(e) => set("name", e.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={state.description}
                disabled={disabled}
                onChange={(e) => set("description", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="partNumber">Part number</Label>
              <Input
                id="partNumber"
                value={state.partNumber}
                disabled={disabled}
                onChange={(e) => set("partNumber", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sku">SKU</Label>
              <Input
                id="sku"
                value={state.sku}
                disabled={disabled}
                onChange={(e) => set("sku", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="barcode">Barcode</Label>
              <Input
                id="barcode"
                value={state.barcode}
                disabled={disabled}
                onChange={(e) => set("barcode", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unit">Unit</Label>
              <Input
                id="unit"
                placeholder="ea, box, ft…"
                value={state.unit}
                disabled={disabled}
                onChange={(e) => set("unit", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="purchaseCost">Purchase cost</Label>
              <Input
                id="purchaseCost"
                type="number"
                step="0.0001"
                min="0"
                value={state.purchaseCost}
                disabled={disabled}
                onChange={(e) => set("purchaseCost", e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quantities</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="quantity">Current</Label>
              <Input
                id="quantity"
                type="number"
                value={state.quantity}
                disabled={disabled}
                onChange={(e) => set("quantity", Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="desiredQuantity">Desired</Label>
              <Input
                id="desiredQuantity"
                type="number"
                value={state.desiredQuantity}
                disabled={disabled}
                onChange={(e) => set("desiredQuantity", Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="minQuantity">Minimum</Label>
              <Input
                id="minQuantity"
                type="number"
                value={state.minQuantity}
                disabled={disabled}
                onChange={(e) => set("minQuantity", Number(e.target.value))}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Custom fields</CardTitle>
          </CardHeader>
          <CardContent>
            {state.categoryId ? (
              <CustomFieldsInputs
                fields={fields}
                values={state.customValues}
                disabled={disabled}
                onChange={(key, value) =>
                  setState((s) => ({
                    ...s,
                    customValues: { ...s.customValues, [key]: value },
                  }))
                }
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Select a category to see its custom fields.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Right: image, classification, location, actions */}
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Image</CardTitle>
          </CardHeader>
          <CardContent>
            <ImageUpload
              value={state.imageUrl}
              disabled={disabled}
              onChange={(url) => set("imageUrl", url)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Classification</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="categoryId">Category</Label>
              <Select
                id="categoryId"
                value={state.categoryId}
                disabled={disabled}
                onChange={(e) => set("categoryId", e.target.value)}
              >
                <option value="">Uncategorized</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="supplierId">Supplier</Label>
              <Select
                id="supplierId"
                value={state.supplierId}
                disabled={disabled}
                onChange={(e) => set("supplierId", e.target.value)}
              >
                <option value="">None</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="supplierLink">Supplier link</Label>
              <div className="flex gap-2">
                <Input
                  id="supplierLink"
                  type="url"
                  placeholder="https://…"
                  value={state.supplierLink}
                  disabled={disabled}
                  onChange={(e) => set("supplierLink", e.target.value)}
                />
                {state.supplierLink && (
                  <Button asChild variant="outline" size="icon" title="Open link">
                    <a href={state.supplierLink} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Location</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="boxId">Box</Label>
              <Select
                id="boxId"
                value={boxId}
                disabled={disabled}
                onChange={(e) => {
                  setBoxId(e.target.value);
                  set("drawerId", "");
                  set("binId", "");
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
              <Label htmlFor="drawerId">Drawer</Label>
              <Select
                id="drawerId"
                value={state.drawerId}
                disabled={disabled || !boxId}
                onChange={(e) => {
                  set("drawerId", e.target.value);
                  set("binId", "");
                }}
              >
                <option value="">No drawer</option>
                {(boxId ? drawers : drawersForBox).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label ? `${d.label} — ${d.name}` : d.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="binId">Bin</Label>
              <Select
                id="binId"
                value={state.binId}
                disabled={disabled || !state.drawerId}
                onChange={(e) => set("binId", e.target.value)}
              >
                <option value="">No bin</option>
                {binsForDrawer.map((bin) => (
                  <option key={bin.id} value={bin.id}>
                    {bin.name ?? "Unnamed bin"}
                  </option>
                ))}
              </Select>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center gap-2">
          <Button onClick={handleSave} disabled={disabled} className="flex-1">
            <Save className="h-4 w-4" />
            {saving ? "Saving…" : isNew ? "Create item" : "Save changes"}
          </Button>
          {!isNew && canDelete && (
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
