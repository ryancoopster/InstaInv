"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectField } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import type { SerializedRequest } from "@/components/orders/serialize";

export interface ItemOption {
  id: string;
  name: string;
  partNumber: string | null;
  supplierId: string | null;
  purchaseCost: string;
}

export interface SupplierOption {
  id: string;
  name: string;
}

// Submit a new order request: either an existing item, or free-text for a new
// item. Posts to /api/requests and bubbles the created row to the parent.
export function RequestForm({
  items,
  suppliers,
  onCreated,
}: {
  items: ItemOption[];
  suppliers: SupplierOption[];
  onCreated: (created: SerializedRequest) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<"existing" | "free">("existing");
  const [saving, setSaving] = React.useState(false);

  const [itemId, setItemId] = React.useState("");
  const [freeName, setFreeName] = React.useState("");
  const [freePartNumber, setFreePartNumber] = React.useState("");
  const [freeSupplier, setFreeSupplier] = React.useState("");
  const [supplierId, setSupplierId] = React.useState("");
  const [quantity, setQuantity] = React.useState("1");
  const [note, setNote] = React.useState("");

  function reset() {
    setMode("existing");
    setItemId("");
    setFreeName("");
    setFreePartNumber("");
    setFreeSupplier("");
    setSupplierId("");
    setQuantity("1");
    setNote("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "existing" && !itemId) {
      toast.error("Pick an item to request.");
      return;
    }
    if (mode === "free" && !freeName.trim()) {
      toast.error("Enter a name for the new item.");
      return;
    }
    setSaving(true);
    try {
      const body =
        mode === "existing"
          ? {
              itemId,
              supplierId: supplierId || undefined,
              quantity: Number(quantity) || 1,
              note: note || undefined,
            }
          : {
              freeName: freeName.trim(),
              freePartNumber: freePartNumber || undefined,
              freeSupplier: freeSupplier || undefined,
              supplierId: supplierId || undefined,
              quantity: Number(quantity) || 1,
              note: note || undefined,
            };
      const created = await api.post<SerializedRequest>("/api/requests", body);
      onCreated(created);
      toast.success("Request submitted");
      reset();
      setOpen(false);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to submit request";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        New request
      </Button>

      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : (setOpen(false), reset()))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New order request</DialogTitle>
            <DialogDescription>
              Request an existing item, or describe a new one to add to the buy list.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={submit} className="space-y-4">
            {/* Mode toggle */}
            <div className="inline-flex w-full rounded-lg bg-muted p-1 text-sm">
              <button
                type="button"
                onClick={() => setMode("existing")}
                className={`flex-1 rounded-md px-3 py-1.5 font-medium transition-colors ${
                  mode === "existing"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground"
                }`}
              >
                Existing item
              </button>
              <button
                type="button"
                onClick={() => setMode("free")}
                className={`flex-1 rounded-md px-3 py-1.5 font-medium transition-colors ${
                  mode === "free"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground"
                }`}
              >
                New item
              </button>
            </div>

            {mode === "existing" ? (
              <SelectField
                label="Item"
                value={itemId}
                onChange={(e) => setItemId(e.target.value)}
              >
                <option value="">Select an item…</option>
                {items.map((it) => (
                  <option key={it.id} value={it.id}>
                    {it.name}
                    {it.partNumber ? ` (${it.partNumber})` : ""}
                  </option>
                ))}
              </SelectField>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="freeName">Name</Label>
                  <Input
                    id="freeName"
                    value={freeName}
                    onChange={(e) => setFreeName(e.target.value)}
                    placeholder="e.g. M3 x 10mm cap screws"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="freePart">Part number</Label>
                    <Input
                      id="freePart"
                      value={freePartNumber}
                      onChange={(e) => setFreePartNumber(e.target.value)}
                      placeholder="Optional"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="freeSupplier">Supplier (text)</Label>
                    <Input
                      id="freeSupplier"
                      value={freeSupplier}
                      onChange={(e) => setFreeSupplier(e.target.value)}
                      placeholder="Optional"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="quantity">Quantity</Label>
                <Input
                  id="quantity"
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
              <SelectField
                label="Supplier"
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                hint="Optional override"
              >
                <option value="">Auto / none</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </SelectField>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="note">Note</Label>
              <Textarea
                id="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Why is this needed? (optional)"
                className="min-h-[64px]"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Submitting…" : "Submit request"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
