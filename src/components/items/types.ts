// Shared client-facing types for the items / categories / suppliers module.
// Items always carry purchaseCost as a string (Decimal serialized in the API).

export type CustomFieldType =
  | "TEXT"
  | "TEXTAREA"
  | "NUMBER"
  | "BOOLEAN"
  | "SELECT"
  | "MULTISELECT"
  | "DATE"
  | "URL";

export interface CustomFieldDef {
  id: string;
  categoryId: string;
  name: string;
  key: string;
  type: CustomFieldType;
  options: string[];
  unit: string | null;
  required: boolean;
  showOnLabel: boolean;
  sortOrder: number;
}

export interface CategoryRef {
  id: string;
  name: string;
  color: string | null;
}

export interface CategoryRow {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  parentId: string | null;
  parent?: { id: string; name: string } | null;
  sortOrder: number;
  _count?: { items: number; customFields: number };
}

export interface SupplierRef {
  id: string;
  name: string;
  website: string | null;
}

export interface SupplierRow {
  id: string;
  name: string;
  website: string | null;
  email: string | null;
  phone: string | null;
  accountNo: string | null;
  notes: string | null;
  sortOrder: number;
  _count?: { items: number };
}

export interface BoxRef {
  id: string;
  name: string;
}

export interface DrawerLocation {
  id: string;
  name: string;
  label: string | null;
  box: BoxRef | null;
}

export interface BinRef {
  id: string;
  name: string | null;
}

export interface ItemRow {
  id: string;
  name: string;
  description: string | null;
  partNumber: string | null;
  sku: string | null;
  barcode: string | null;
  purchaseCost: string;
  unit: string | null;
  quantity: number;
  desiredQuantity: number;
  minQuantity: number;
  imageUrl: string | null;
  supplierId: string | null;
  supplier: SupplierRef | null;
  supplierLink: string | null;
  categoryId: string | null;
  category: CategoryRef | null;
  customValues: Record<string, unknown>;
  drawerId: string | null;
  drawer: DrawerLocation | null;
  binId: string | null;
  bin: BinRef | null;
  sortOrder: number;
}

// Light option types for select inputs in forms.
export interface CategoryOption {
  id: string;
  name: string;
}
export interface SupplierOption {
  id: string;
  name: string;
}
export interface BoxOption {
  id: string;
  name: string;
  drawers: { id: string; name: string; label: string | null; bins: BinRef[] }[];
}
