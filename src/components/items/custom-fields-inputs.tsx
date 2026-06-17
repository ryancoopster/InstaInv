"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import type { CustomFieldDef } from "./types";

interface CustomFieldsInputsProps {
  fields: CustomFieldDef[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  disabled?: boolean;
}

// Dynamic renderer: one input per CustomFieldDef, writing into the item's
// customValues keyed by field.key.
export function CustomFieldsInputs({ fields, values, onChange, disabled }: CustomFieldsInputsProps) {
  if (fields.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        This category has no custom fields. Add them on the Categories page.
      </p>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map((field) => (
        <CustomFieldInput
          key={field.id}
          field={field}
          value={values[field.key]}
          onChange={(v) => onChange(field.key, v)}
          disabled={disabled}
        />
      ))}
    </div>
  );
}

function CustomFieldInput({
  field,
  value,
  onChange,
  disabled,
}: {
  field: CustomFieldDef;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}) {
  const id = `cf_${field.key}`;
  const labelNode = (
    <Label htmlFor={id} className="flex items-center gap-1">
      {field.name}
      {field.unit ? <span className="text-xs text-muted-foreground">({field.unit})</span> : null}
      {field.required ? <span className="text-destructive">*</span> : null}
    </Label>
  );

  switch (field.type) {
    case "TEXTAREA":
      return (
        <div className="space-y-1.5 sm:col-span-2">
          {labelNode}
          <Textarea
            id={id}
            value={(value as string) ?? ""}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      );

    case "NUMBER":
      return (
        <div className="space-y-1.5">
          {labelNode}
          <Input
            id={id}
            type="number"
            value={value === null || value === undefined ? "" : String(value)}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          />
        </div>
      );

    case "BOOLEAN":
      return (
        <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
          {labelNode}
          <Switch
            id={id}
            checked={Boolean(value)}
            disabled={disabled}
            onCheckedChange={(checked) => onChange(checked)}
          />
        </div>
      );

    case "SELECT":
      return (
        <div className="space-y-1.5">
          {labelNode}
          <Select
            id={id}
            value={(value as string) ?? ""}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value || null)}
          >
            <option value="">—</option>
            {field.options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </Select>
        </div>
      );

    case "MULTISELECT": {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      const toggle = (opt: string) => {
        const next = selected.includes(opt)
          ? selected.filter((o) => o !== opt)
          : [...selected, opt];
        onChange(next);
      };
      return (
        <div className="space-y-1.5 sm:col-span-2">
          {labelNode}
          <div className="flex flex-wrap gap-3 rounded-md border border-border p-3">
            {field.options.length === 0 && (
              <span className="text-xs text-muted-foreground">No options defined.</span>
            )}
            {field.options.map((opt) => (
              <label key={opt} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={selected.includes(opt)}
                  disabled={disabled}
                  onCheckedChange={() => toggle(opt)}
                />
                {opt}
              </label>
            ))}
          </div>
        </div>
      );
    }

    case "DATE":
      return (
        <div className="space-y-1.5">
          {labelNode}
          <Input
            id={id}
            type="date"
            value={(value as string) ?? ""}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value || null)}
          />
        </div>
      );

    case "URL":
      return (
        <div className="space-y-1.5">
          {labelNode}
          <Input
            id={id}
            type="url"
            placeholder="https://…"
            value={(value as string) ?? ""}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value || null)}
          />
        </div>
      );

    case "TEXT":
    default:
      return (
        <div className="space-y-1.5">
          {labelNode}
          <Input
            id={id}
            type="text"
            value={(value as string) ?? ""}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      );
  }
}
