"use client";

import * as React from "react";
import { api, ApiError } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select } from "@/components/ui/select";
import { DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import type { SupplierRow } from "./types";

type PriceParser = "generic" | "mouser" | "mcmaster";

function normalizeParser(value: string | null | undefined): PriceParser {
  return value === "mouser" || value === "mcmaster" ? value : "generic";
}

interface SupplierFormProps {
  supplier?: SupplierRow | null;
  onSaved: (supplier: SupplierRow) => void;
  onCancel: () => void;
}

export function SupplierForm({ supplier, onSaved, onCancel }: SupplierFormProps) {
  const isNew = !supplier;
  const [name, setName] = React.useState(supplier?.name ?? "");
  const [website, setWebsite] = React.useState(supplier?.website ?? "");
  const [email, setEmail] = React.useState(supplier?.email ?? "");
  const [phone, setPhone] = React.useState(supplier?.phone ?? "");
  const [accountNo, setAccountNo] = React.useState(supplier?.accountNo ?? "");
  const [notes, setNotes] = React.useState(supplier?.notes ?? "");
  const [priceFetchEnabled, setPriceFetchEnabled] = React.useState(
    supplier?.priceFetchEnabled ?? false,
  );
  const [priceParser, setPriceParser] = React.useState<PriceParser>(
    normalizeParser(supplier?.priceParser),
  );
  const [saving, setSaving] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        website: website || null,
        email: email || null,
        phone: phone || null,
        accountNo: accountNo || null,
        notes: notes || null,
        priceFetchEnabled,
        priceParser,
      };
      const saved = isNew
        ? await api.post<SupplierRow>("/api/suppliers", payload)
        : await api.patch<SupplierRow>(`/api/suppliers/${supplier!.id}`, payload);
      toast.success(isNew ? "Supplier created" : "Supplier saved");
      onSaved(saved);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="s-name">Name *</Label>
        <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="s-website">Website</Label>
          <Input
            id="s-website"
            type="url"
            placeholder="https://…"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="s-email">Email</Label>
          <Input
            id="s-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="s-phone">Phone</Label>
          <Input id="s-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="s-account">Account #</Label>
          <Input
            id="s-account"
            value={accountNo}
            onChange={(e) => setAccountNo(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="s-notes">Notes</Label>
        <Textarea id="s-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <div className="space-y-3 rounded-md border border-border p-3">
        <div className="space-y-0.5">
          <p className="text-sm font-medium">Price fetching</p>
          <p className="text-xs text-muted-foreground">
            Let InstaInv scrape current prices from this supplier&apos;s product links. Best-effort —
            some sites block scraping or require a login.
          </p>
        </div>
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="s-price-fetch">Enable price fetching</Label>
          <Switch
            id="s-price-fetch"
            checked={priceFetchEnabled}
            onCheckedChange={setPriceFetchEnabled}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="s-price-parser">Parser</Label>
          <Select
            id="s-price-parser"
            value={priceParser}
            disabled={!priceFetchEnabled}
            onChange={(e) => setPriceParser(e.target.value as PriceParser)}
          >
            <option value="generic">Generic</option>
            <option value="mouser">Mouser</option>
            <option value="mcmaster">McMaster-Carr</option>
          </Select>
          <p className="text-xs text-muted-foreground">
            How to read prices from this supplier&apos;s pages. McMaster-Carr requires a login, so it
            typically returns “unsupported”.
          </p>
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : isNew ? "Create" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}
