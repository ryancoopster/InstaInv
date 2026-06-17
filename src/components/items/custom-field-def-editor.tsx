"use client";

import * as React from "react";
import { Plus, Pencil, Trash2, Tag, ListPlus } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { fieldKey } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { SortableList, SortableRow, SortableHandle } from "./sortable";
import type { CustomFieldDef, CustomFieldType } from "./types";

const TYPE_OPTIONS: { value: CustomFieldType; label: string }[] = [
  { value: "TEXT", label: "Text" },
  { value: "TEXTAREA", label: "Long text" },
  { value: "NUMBER", label: "Number" },
  { value: "BOOLEAN", label: "Yes / No" },
  { value: "SELECT", label: "Select (one)" },
  { value: "MULTISELECT", label: "Multi-select" },
  { value: "DATE", label: "Date" },
  { value: "URL", label: "URL" },
];

const NEEDS_OPTIONS = (t: CustomFieldType) => t === "SELECT" || t === "MULTISELECT";

interface CustomFieldDefEditorProps {
  categoryId: string;
  canManage: boolean;
}

export function CustomFieldDefEditor({ categoryId, canManage }: CustomFieldDefEditorProps) {
  const [fields, setFields] = React.useState<CustomFieldDef[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [editing, setEditing] = React.useState<CustomFieldDef | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<CustomFieldDef[]>(`/api/custom-fields?categoryId=${categoryId}`)
      .then((defs) => !cancelled && setFields(defs))
      .catch(() => !cancelled && setFields([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [categoryId]);

  function openNew() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(f: CustomFieldDef) {
    setEditing(f);
    setDialogOpen(true);
  }

  function onSaved(saved: CustomFieldDef) {
    setFields((prev) => {
      const exists = prev.some((p) => p.id === saved.id);
      return exists ? prev.map((p) => (p.id === saved.id ? saved : p)) : [...prev, saved];
    });
    setDialogOpen(false);
  }

  async function remove(f: CustomFieldDef) {
    if (!confirm(`Delete field "${f.name}"?`)) return;
    const prev = fields;
    setFields((r) => r.filter((x) => x.id !== f.id));
    try {
      await api.del(`/api/custom-fields/${f.id}`);
      toast.success("Field deleted");
    } catch (err) {
      setFields(prev);
      toast.error(err instanceof ApiError ? err.message : "Delete failed");
    }
  }

  async function persistReorder(ids: string[]) {
    const byId = new Map(fields.map((f) => [f.id, f]));
    setFields(ids.map((id) => byId.get(id)!).filter(Boolean));
    try {
      await api.patch("/api/custom-fields/reorder", { ids });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Reorder failed");
    }
  }

  if (loading) {
    return <p className="py-4 text-sm text-muted-foreground">Loading fields…</p>;
  }

  return (
    <div className="space-y-3">
      {canManage && (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={openNew}>
            <Plus className="h-4 w-4" />
            Add field
          </Button>
        </div>
      )}

      {fields.length === 0 ? (
        <EmptyState
          icon={Tag}
          title="No custom fields"
          description="Custom fields let you store category-specific attributes on items (e.g. thread size, voltage)."
          className="py-8"
          action={
            canManage ? (
              <Button size="sm" variant="outline" onClick={openNew}>
                <Plus className="h-4 w-4" />
                Add field
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-hidden rounded-md border border-border">
          <SortableList
            ids={fields.map((f) => f.id)}
            onReorder={persistReorder}
            disabled={!canManage}
          >
            {fields.map((f) => (
              <SortableRow
                key={f.id}
                id={f.id}
                as="div"
                className="flex items-center gap-3 border-b border-border px-3 py-2 last:border-0"
              >
                {canManage ? <SortableHandle /> : <span className="inline-block h-7 w-7" />}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{f.name}</span>
                    <code className="rounded bg-muted px-1 text-xs text-muted-foreground">
                      {f.key}
                    </code>
                    {f.required && <Badge variant="outline">Required</Badge>}
                    {f.showOnLabel && <Badge variant="secondary">On label</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {TYPE_OPTIONS.find((t) => t.value === f.type)?.label ?? f.type}
                    {f.unit ? ` · ${f.unit}` : ""}
                    {NEEDS_OPTIONS(f.type) && f.options.length > 0
                      ? ` · ${f.options.join(", ")}`
                      : ""}
                  </div>
                </div>
                {canManage && (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(f)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => remove(f)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </SortableRow>
            ))}
          </SortableList>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit field" : "New custom field"}</DialogTitle>
          </DialogHeader>
          <FieldForm
            categoryId={categoryId}
            field={editing}
            onSaved={onSaved}
            onCancel={() => setDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FieldForm({
  categoryId,
  field,
  onSaved,
  onCancel,
}: {
  categoryId: string;
  field: CustomFieldDef | null;
  onSaved: (f: CustomFieldDef) => void;
  onCancel: () => void;
}) {
  const isNew = !field;
  const [name, setName] = React.useState(field?.name ?? "");
  const [type, setType] = React.useState<CustomFieldType>(field?.type ?? "TEXT");
  const [optionsText, setOptionsText] = React.useState((field?.options ?? []).join(", "));
  const [unit, setUnit] = React.useState(field?.unit ?? "");
  const [required, setRequired] = React.useState(field?.required ?? false);
  const [showOnLabel, setShowOnLabel] = React.useState(field?.showOnLabel ?? false);
  const [saving, setSaving] = React.useState(false);

  const previewKey = field?.key ?? (name ? fieldKey(name) : "field");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    const options = NEEDS_OPTIONS(type)
      ? optionsText
          .split(",")
          .map((o) => o.trim())
          .filter(Boolean)
      : [];

    setSaving(true);
    try {
      const payload = {
        categoryId,
        name: name.trim(),
        type,
        options,
        unit: unit || null,
        required,
        showOnLabel,
      };
      const saved = isNew
        ? await api.post<CustomFieldDef>("/api/custom-fields", payload)
        : await api.patch<CustomFieldDef>(`/api/custom-fields/${field!.id}`, payload);
      toast.success(isNew ? "Field added" : "Field saved");
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
        <Label htmlFor="f-name">Name *</Label>
        <Input id="f-name" value={name} onChange={(e) => setName(e.target.value)} />
        <p className="text-xs text-muted-foreground">
          Stored key: <code className="rounded bg-muted px-1">{previewKey}</code>
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="f-type">Type</Label>
          <Select
            id="f-type"
            value={type}
            onChange={(e) => setType(e.target.value as CustomFieldType)}
          >
            {TYPE_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-unit">Unit</Label>
          <Input id="f-unit" placeholder="mm, V, …" value={unit} onChange={(e) => setUnit(e.target.value)} />
        </div>
      </div>

      {NEEDS_OPTIONS(type) && (
        <div className="space-y-1.5">
          <Label htmlFor="f-options" className="flex items-center gap-1">
            <ListPlus className="h-4 w-4" />
            Options (comma-separated)
          </Label>
          <Input
            id="f-options"
            placeholder="Small, Medium, Large"
            value={optionsText}
            onChange={(e) => setOptionsText(e.target.value)}
          />
        </div>
      )}

      <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
        <Label htmlFor="f-required">Required</Label>
        <Switch id="f-required" checked={required} onCheckedChange={setRequired} />
      </div>
      <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
        <Label htmlFor="f-label">Show on label</Label>
        <Switch id="f-label" checked={showOnLabel} onCheckedChange={setShowOnLabel} />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : isNew ? "Add field" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}
