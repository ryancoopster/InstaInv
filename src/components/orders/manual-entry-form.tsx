"use client";

import * as React from "react";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import type { ItemOption, SupplierOption } from "@/components/orders/request-form";

// Admin manual buy-list entry. Posts to /api/orders/manual (creates an
// ADMIN_MANUAL, APPROVED order request so it lands on the buy list at once).
export function ManualEntryForm({
  items,
  suppliers,
  onAdded,
  trigger,
}: {
  items: ItemOption[];
  suppliers: SupplierOption[];
  onAdded: () => void;
  trigger: React.ReactElement;
}) {
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<"existing" | "free">("existing");
  const [saving, setSaving] = React.useState(false);

  const [itemId, setItemId] = React.useState("");
  const [freeName, setFreeName] = React.useState("");
  const [freePartNumber, setFreePartNumber] = React.useState("");
  const [supplierId, setSupplierId] = React.useState("");
  const [quantity, setQuantity] = React.useState("1");
  const [unitCost, setUnitCost] = React.useState("");
  const [note, setNote] = React.useState("");

  function reset() {
    setMode("existing");
    setItemId("");
    setFreeName("");
    setFreePartNumber("");
    setSupplierId("");
    setQuantity("1");
    setUnitCost("");
    setNote("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "existing" && !itemId) return toast.error("Pick an item.");
    if (mode === "free" && !freeName.trim()) return toast.error("Enter a name.");
    setSaving(true);
    try {
      const body =
        mode === "existing"
          ? {
              itemId,
              supplierId: supplierId || undefined,
              quantity: Number(quantity) || 1,
              unitCost: unitCost ? Number(unitCost) : undefined,
              note: note || undefined,
            }
          : {
              freeName: freeName.trim(),
              freePartNumber: freePartNumber || undefined,
              supplierId: supplierId || undefined,
              quantity: Number(quantity) || 1,
              unitCost: unitCost ? Number(unitCost) : undefined,
              note: note || undefined,
            };
      await api.post("/api/orders/manual", body);
      toast.success("Added to buy list");
      reset();
      setOpen(false);
      onAdded();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to add entry");
    } finally {
      setSaving(false);
    }
  }

  const triggerEl = React.cloneElement(trigger, {
    onClick: (e: React.MouseEvent) => {
      (trigger.props as any).onClick?.(e);
      setOpen(true);
    },
  });

  return (
    <>
      {triggerEl}
      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : (setOpen(false), reset()))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Manual buy-list entry</DialogTitle>
            <DialogDescription>
              Add a line straight to the buy list. It&apos;s approved immediately.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={submit} className="space-y-4">
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
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="m_freeName">Name</Label>
                  <Input
                    id="m_freeName"
                    value={freeName}
                    onChange={(e) => setFreeName(e.target.value)}
                    placeholder="e.g. Replacement caster wheel"
                  />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="m_freePart">Part number</Label>
                  <Input
                    id="m_freePart"
                    value={freePartNumber}
                    onChange={(e) => setFreePartNumber(e.target.value)}
                    placeholder="Optional"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="m_qty">Quantity</Label>
                <Input
                  id="m_qty"
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="m_cost">Unit cost</Label>
                <Input
                  id="m_cost"
                  type="number"
                  min={0}
                  step="0.01"
                  value={unitCost}
                  onChange={(e) => setUnitCost(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>

            <SelectField
              label="Supplier"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              hint="Optional — groups the line on the buy list"
            >
              <option value="">Auto / none</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </SelectField>

            <div className="space-y-1.5">
              <Label htmlFor="m_note">Note</Label>
              <Textarea
                id="m_note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="min-h-[56px]"
                placeholder="Optional"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Adding…" : "Add to buy list"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
