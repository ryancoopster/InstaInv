import "server-only";
import { prisma } from "@/lib/prisma";

// DM-1: Centralized location-consistency resolver shared by the item create /
// update write paths. Mirrors the semantics already used in items/move:
//   - a bin implies its drawer + box
//   - a drawer implies its box
//   - a set box with no drawer keeps the boxId and nulls drawer + bin
//   - a cleared box nulls drawer + bin
// It also validates that any chosen bin/drawer actually belongs to the chosen
// box, so the denormalized Item.boxId column can never drift from drawer/bin.

export class LocationError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "LocationError";
    this.status = status;
  }
}

export interface LocationInput {
  boxId?: string | null;
  drawerId?: string | null;
  binId?: string | null;
}

export interface ResolvedLocation {
  boxId: string | null;
  drawerId: string | null;
  binId: string | null;
}

// Resolve a desired {boxId, drawerId, binId} into a fully-consistent trio,
// deriving boxId/drawerId from the most specific field provided and validating
// containment. Throws LocationError (400/404) on a mismatch or missing record.
export async function resolveLocation(input: LocationInput): Promise<ResolvedLocation> {
  const wantBin = input.binId || null;
  const wantDrawer = input.drawerId || null;
  const wantBox = input.boxId || null;

  // A bin implies its drawer + box (most specific wins).
  if (wantBin) {
    const bin = await prisma.bin.findUnique({
      where: { id: wantBin },
      include: { drawer: { select: { id: true, boxId: true } } },
    });
    if (!bin) throw new LocationError("Bin not found", 404);
    // If a drawer/box were also supplied, they must match the bin's.
    if (wantDrawer && wantDrawer !== bin.drawer.id) {
      throw new LocationError("Bin does not belong to the selected drawer", 400);
    }
    if (wantBox && wantBox !== bin.drawer.boxId) {
      throw new LocationError("Bin does not belong to the selected box", 400);
    }
    return { boxId: bin.drawer.boxId, drawerId: bin.drawer.id, binId: bin.id };
  }

  // A drawer implies its box.
  if (wantDrawer) {
    const drawer = await prisma.drawer.findUnique({
      where: { id: wantDrawer },
      select: { id: true, boxId: true },
    });
    if (!drawer) throw new LocationError("Drawer not found", 404);
    if (wantBox && wantBox !== drawer.boxId) {
      throw new LocationError("Drawer does not belong to the selected box", 400);
    }
    return { boxId: drawer.boxId, drawerId: drawer.id, binId: null };
  }

  // Box only (no drawer): keep the box, null the drawer + bin. A cleared box
  // nulls everything.
  if (wantBox) {
    const box = await prisma.box.findUnique({ where: { id: wantBox }, select: { id: true } });
    if (!box) throw new LocationError("Box not found", 404);
    return { boxId: box.id, drawerId: null, binId: null };
  }

  return { boxId: null, drawerId: null, binId: null };
}
