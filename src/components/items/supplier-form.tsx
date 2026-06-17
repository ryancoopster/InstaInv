"use client";

import * as React from "react";
import { api, ApiError } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import type { SupplierRow } from "./types";

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
