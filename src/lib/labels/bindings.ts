// Binding-token resolution. Shared by the client live preview and the server
// PDF renderer so a label looks identical in both.
//
// Tokens look like {{item.name}}, {{item.partNumber}}, {{item.custom.<key>}},
// {{item.url}}, {{drawer.name}}, {{drawer.label}}, {{drawer.summary}},
// {{box.name}}, {{bin.name}} etc. (see CONTRACT.md "Binding tokens").
//
// `EntityData` is a plain, already-serialized snapshot (no Prisma Decimals).
// The server loader in render.ts builds it; the client passes a sample.

import type { LabelTargetKind } from "./types";

export interface EntityData {
  /** which kind of entity this snapshot represents */
  target: LabelTargetKind;
  item?: {
    id: string;
    name: string;
    description?: string | null;
    partNumber?: string | null;
    sku?: string | null;
    barcode?: string | null;
    unit?: string | null;
    quantity?: number;
    desiredQuantity?: number;
    minQuantity?: number;
    purchaseCost?: string | null; // serialized Decimal
    url?: string; // public item URL
    category?: { name: string } | null;
    supplier?: { name: string } | null;
    custom?: Record<string, unknown>;
  };
  drawer?: {
    id: string;
    name: string;
    label?: string | null;
    summary?: string | null;
  };
  box?: {
    id: string;
    name: string;
    description?: string | null;
    location?: string | null;
    summary?: string | null;
  };
  bin?: {
    id: string;
    name?: string | null;
  };
}

/**
 * Resolve a single dotted token path (without the surrounding braces) against
 * the entity snapshot. `item.custom.<key>` reads from the custom map.
 * Returns "" when the path can't be resolved so labels never print "undefined".
 */
export function resolveToken(path: string, data: EntityData): string {
  const trimmed = path.trim();
  if (!trimmed) return "";

  const parts = trimmed.split(".");
  const [root, ...rest] = parts;

  // item.custom.<key> (key may itself contain dots, though unusual)
  if (root === "item" && rest[0] === "custom") {
    const key = rest.slice(1).join(".");
    const val = data.item?.custom?.[key];
    return formatValue(val);
  }

  let cursor: any;
  switch (root) {
    case "item":
      cursor = data.item;
      break;
    case "drawer":
      cursor = data.drawer;
      break;
    case "box":
      cursor = data.box;
      break;
    case "bin":
      cursor = data.bin;
      break;
    default:
      cursor = (data as any)[root];
  }

  for (const key of rest) {
    if (cursor == null) return "";
    cursor = cursor[key];
  }
  return formatValue(cursor);
}

function formatValue(val: unknown): string {
  if (val == null) return "";
  if (typeof val === "boolean") return val ? "Yes" : "No";
  if (Array.isArray(val)) return val.map(formatValue).join(", ");
  return String(val);
}

const TOKEN_RE = /\{\{\s*([^}]+?)\s*\}\}/g;

/** Replace every {{token}} in a string with its resolved value. */
export function resolveBindingString(template: string | undefined | null, data: EntityData): string {
  if (!template) return "";
  return template.replace(TOKEN_RE, (_m, path: string) => resolveToken(path, data));
}

/** Does this string contain any unresolved-at-design-time tokens? */
export function hasTokens(template: string | undefined | null): boolean {
  if (!template) return false;
  TOKEN_RE.lastIndex = 0;
  return TOKEN_RE.test(template);
}

// ---------------------------------------------------------------------------
// Token palette shown by the binding picker, grouped per target.
// ---------------------------------------------------------------------------

export interface BindingToken {
  token: string; // e.g. "{{item.name}}"
  label: string; // human label
}

export interface BindingGroup {
  group: string;
  tokens: BindingToken[];
}

/**
 * Token palette for a given target. `customKeys` are category custom-field keys
 * (passed in from the designer once a sample/category is known) so the picker
 * can offer {{item.custom.<key>}} entries.
 */
export function bindingPalette(target: LabelTargetKind, customKeys: string[] = []): BindingGroup[] {
  const itemTokens: BindingToken[] = [
    { token: "{{item.name}}", label: "Item name" },
    { token: "{{item.partNumber}}", label: "Part number" },
    { token: "{{item.sku}}", label: "SKU" },
    { token: "{{item.barcode}}", label: "Barcode value" },
    { token: "{{item.description}}", label: "Description" },
    { token: "{{item.quantity}}", label: "Quantity on hand" },
    { token: "{{item.unit}}", label: "Unit" },
    { token: "{{item.url}}", label: "Public item URL" },
    { token: "{{item.category.name}}", label: "Category" },
    { token: "{{item.supplier.name}}", label: "Supplier" },
  ];
  const customTokens: BindingToken[] = customKeys.map((k) => ({
    token: `{{item.custom.${k}}}`,
    label: `Custom: ${k}`,
  }));
  const drawerTokens: BindingToken[] = [
    { token: "{{drawer.name}}", label: "Drawer name" },
    { token: "{{drawer.label}}", label: "Drawer label" },
    { token: "{{drawer.summary}}", label: "Drawer summary" },
  ];
  const boxTokens: BindingToken[] = [
    { token: "{{box.name}}", label: "Box name" },
    { token: "{{box.location}}", label: "Box location" },
    { token: "{{box.summary}}", label: "Box summary" },
  ];
  const binTokens: BindingToken[] = [{ token: "{{bin.name}}", label: "Bin name" }];

  const groups: BindingGroup[] = [];
  if (target === "ITEM") {
    groups.push({ group: "Item", tokens: itemTokens });
    if (customTokens.length) groups.push({ group: "Custom fields", tokens: customTokens });
    groups.push({ group: "Location", tokens: [...drawerTokens, ...binTokens, ...boxTokens] });
  } else if (target === "DRAWER") {
    groups.push({ group: "Drawer", tokens: drawerTokens });
    groups.push({ group: "Box", tokens: boxTokens });
  } else if (target === "BOX") {
    groups.push({ group: "Box", tokens: boxTokens });
  } else if (target === "BIN") {
    groups.push({ group: "Bin", tokens: binTokens });
    groups.push({ group: "Drawer", tokens: drawerTokens });
  } else {
    // GENERIC — offer everything.
    groups.push({ group: "Item", tokens: itemTokens });
    groups.push({ group: "Drawer", tokens: drawerTokens });
    groups.push({ group: "Box", tokens: boxTokens });
    groups.push({ group: "Bin", tokens: binTokens });
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Sample data — used by the designer preview when no real entity is selected.
// ---------------------------------------------------------------------------

export function sampleEntity(target: LabelTargetKind): EntityData {
  return {
    target,
    item: {
      id: "sample",
      name: "Nut with Tooth Lock Washer",
      description: "8-32 nut with external-tooth lock washer.",
      partNumber: "90328A103",
      sku: "NUT-832-TLW",
      barcode: "90328A103",
      unit: "ea",
      quantity: 240,
      desiredQuantity: 500,
      minQuantity: 100,
      purchaseCost: "0.12",
      url: "https://instainv.local/i/sample",
      category: { name: "Hardware" },
      supplier: { name: "McMaster-Carr" },
      custom: {
        thread_size: "8-32",
        type: "Nut W/ Tooth Lock Washer",
        material: "Steel",
        coating: "Black-Oxide",
        length: "0.5",
      },
    },
    drawer: { id: "sample", name: "Nuts & Washers", label: "A2", summary: "12 items (340 pieces) — Hardware, Fasteners." },
    box: { id: "sample", name: "Hardware Case A", location: "Shop wall", summary: "48 items across 4 drawers." },
    bin: { id: "sample", name: "Nuts" },
  };
}
