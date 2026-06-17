// Shared serialized shapes passed from mobile server components to client ones.
// Prisma Decimal columns are serialized to string at the server boundary.

export interface MobileItem {
  id: string;
  name: string;
  description: string | null;
  partNumber: string | null;
  sku: string | null;
  unit: string | null;
  quantity: number;
  desiredQuantity: number;
  minQuantity: number;
  imageUrl: string | null;
  binName: string | null;
}

export interface MobileSearchHit extends MobileItem {
  boxId: string | null;
  boxName: string | null;
  drawerId: string | null;
  drawerName: string | null;
}
