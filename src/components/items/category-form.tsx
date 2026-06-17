"use client";

import * as React from "react";
import { api, ApiError } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import type { CategoryRow, CategoryOption } from "./types";

interface CategoryFormProps {
  category?: CategoryRow | null;
  // Possible parents (excludes self in the manager).
  parents: CategoryOption[];
  onSaved: (category: CategoryRow) => void;
  onCancel: () => void;
}

export function CategoryForm({ category, parents, onSaved, onCancel }: CategoryFormProps) {
  const isNew = !category;
  const [name, setName] = React.useState(category?.name ?? "");
  const [description, setDescription] = React.useState(category?.description ?? "");
  const [color, setColor] = React.useState(category?.color ?? "#6366f1");
  const [icon, setIcon] = React.useState(category?.icon ?? "");
  const [parentId, setParentId] = React.useState(category?.parentId ?? "");
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
        description: description || null,
        color: color || null,
        icon: icon || null,
        parentId: parentId || null,
      };
      const saved = isNew
        ? await api.post<CategoryRow>("/api/categories", payload)
        : await api.patch<CategoryRow>(`/api/categories/${category!.id}`, payload);
      toast.success(isNew ? "Category created" : "Category saved");
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
        <Label htmlFor="c-name">Name *</Label>
        <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="c-description">Description</Label>
        <Textarea
          id="c-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="c-color">Color</Label>
          <div className="flex items-center gap-2">
            <input
              id="c-color"
              type="color"
              value={color || "#6366f1"}
              onChange={(e) => setColor(e.target.value)}
              className="h-9 w-12 cursor-pointer rounded-md border border-input bg-background"
            />
            <Input
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="#6366f1"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="c-icon">Icon (lucide name)</Label>
          <Input
            id="c-icon"
            value={icon}
            placeholder="e.g. wrench"
            onChange={(e) => setIcon(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="c-parent">Parent category</Label>
        <Select id="c-parent" value={parentId} onChange={(e) => setParentId(e.target.value)}>
          <option value="">None (top level)</option>
          {parents.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
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
