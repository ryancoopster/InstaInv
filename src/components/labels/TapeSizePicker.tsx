"use client";

import * as React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectField } from "@/components/ui/select";
import { TAPE_PRESETS, tapePresetById, type LabelTargetKind } from "@/lib/labels/types";

export interface TapeSelection {
  tapePresetId: string;
  tapeName: string;
  widthMm: number;
  heightMm: number;
  orientation: "landscape" | "portrait";
}

const TARGET_OPTIONS: { value: LabelTargetKind; label: string }[] = [
  { value: "ITEM", label: "Item" },
  { value: "BIN", label: "Bin" },
  { value: "DRAWER", label: "Drawer" },
  { value: "BOX", label: "Box" },
  { value: "GENERIC", label: "Generic" },
];

// Groups the presets for the <optgroup>s.
function groupedPresets() {
  const groups = new Map<string, typeof TAPE_PRESETS>();
  for (const p of TAPE_PRESETS) {
    const arr = groups.get(p.group) ?? [];
    arr.push(p);
    groups.set(p.group, arr);
  }
  return [...groups.entries()];
}

export function TapeSizePicker({
  target,
  onTargetChange,
  selection,
  onSelectionChange,
  showTarget = true,
}: {
  target: LabelTargetKind;
  onTargetChange?: (t: LabelTargetKind) => void;
  selection: TapeSelection;
  onSelectionChange: (sel: TapeSelection) => void;
  showTarget?: boolean;
}) {
  const isCustom = selection.tapePresetId === "custom";

  function applyPreset(presetId: string) {
    if (presetId === "custom") {
      onSelectionChange({ ...selection, tapePresetId: "custom", tapeName: "Custom" });
      return;
    }
    const preset = tapePresetById(presetId);
    if (!preset) return;
    onSelectionChange({
      tapePresetId: preset.id,
      tapeName: preset.tapeName,
      widthMm: preset.widthMm,
      heightMm: preset.heightMm,
      orientation: preset.orientation,
    });
  }

  return (
    <div className="space-y-4">
      {showTarget && (
        <SelectField
          label="Label is for"
          value={target}
          onChange={(e) => onTargetChange?.(e.target.value as LabelTargetKind)}
        >
          {TARGET_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </SelectField>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="tape-preset">Tape / media</Label>
        <Select id="tape-preset" value={selection.tapePresetId} onChange={(e) => applyPreset(e.target.value)}>
          {groupedPresets().map(([group, presets]) => (
            <optgroup key={group} label={group}>
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          ))}
          <option value="custom">Custom size…</option>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="tape-w">Length (mm)</Label>
          <Input
            id="tape-w"
            type="number"
            min={1}
            step="0.5"
            value={selection.widthMm}
            disabled={!isCustom}
            onChange={(e) => onSelectionChange({ ...selection, widthMm: Number(e.target.value) || 0 })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tape-h">Width / height (mm)</Label>
          <Input
            id="tape-h"
            type="number"
            min={1}
            step="0.5"
            value={selection.heightMm}
            disabled={!isCustom}
            onChange={(e) => onSelectionChange({ ...selection, heightMm: Number(e.target.value) || 0 })}
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {selection.tapeName} — {selection.widthMm} × {selection.heightMm} mm
      </p>
    </div>
  );
}
