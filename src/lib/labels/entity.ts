import "server-only";
import { prisma } from "@/lib/prisma";
import type { EntityData } from "./bindings";
import type { LabelTargetKind } from "./types";

// Loads the target entity (with the relations a label might bind to) and turns
// it into a flat, JSON-safe EntityData snapshot for binding resolution.
//
// Used by the render route and exposed via /api/labels/sample for the designer
// "load a real sample" preview.

function publicItemUrl(itemId: string): string {
  const base = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "";
  return `${base.replace(/\/$/, "")}/i/${itemId}`;
}

export async function loadEntityData(
  target: LabelTargetKind,
  id: string,
): Promise<EntityData | null> {
  switch (target) {
    case "ITEM": {
      const item = await prisma.item.findUnique({
        where: { id },
        include: {
          category: { select: { name: true } },
          supplier: { select: { name: true } },
          drawer: { select: { id: true, name: true, label: true, summary: true, box: { select: { id: true, name: true, location: true, description: true, summary: true } } } },
          bin: { select: { id: true, name: true } },
        },
      });
      if (!item) return null;
      const custom = (item.customValues && typeof item.customValues === "object" ? item.customValues : {}) as Record<string, unknown>;
      return {
        target,
        item: {
          id: item.id,
          name: item.name,
          description: item.description,
          partNumber: item.partNumber,
          sku: item.sku,
          barcode: item.barcode,
          unit: item.unit,
          quantity: item.quantity,
          desiredQuantity: item.desiredQuantity,
          minQuantity: item.minQuantity,
          purchaseCost: item.purchaseCost != null ? item.purchaseCost.toString() : null,
          url: publicItemUrl(item.id),
          category: item.category,
          supplier: item.supplier,
          custom,
        },
        drawer: item.drawer
          ? { id: item.drawer.id, name: item.drawer.name, label: item.drawer.label, summary: item.drawer.summary }
          : undefined,
        box: item.drawer?.box
          ? { id: item.drawer.box.id, name: item.drawer.box.name, location: item.drawer.box.location, description: item.drawer.box.description, summary: item.drawer.box.summary }
          : undefined,
        bin: item.bin ? { id: item.bin.id, name: item.bin.name } : undefined,
      };
    }
    case "DRAWER": {
      const drawer = await prisma.drawer.findUnique({
        where: { id },
        include: { box: { select: { id: true, name: true, location: true, description: true, summary: true } } },
      });
      if (!drawer) return null;
      return {
        target,
        drawer: { id: drawer.id, name: drawer.name, label: drawer.label, summary: drawer.summary },
        box: drawer.box
          ? { id: drawer.box.id, name: drawer.box.name, location: drawer.box.location, description: drawer.box.description, summary: drawer.box.summary }
          : undefined,
      };
    }
    case "BOX": {
      const box = await prisma.box.findUnique({ where: { id } });
      if (!box) return null;
      return {
        target,
        box: { id: box.id, name: box.name, location: box.location, description: box.description, summary: box.summary },
      };
    }
    case "BIN": {
      const bin = await prisma.bin.findUnique({
        where: { id },
        include: { drawer: { select: { id: true, name: true, label: true, summary: true } } },
      });
      if (!bin) return null;
      return {
        target,
        bin: { id: bin.id, name: bin.name },
        drawer: bin.drawer ? { id: bin.drawer.id, name: bin.drawer.name, label: bin.drawer.label, summary: bin.drawer.summary } : undefined,
      };
    }
    case "GENERIC":
    default:
      return { target: "GENERIC" };
  }
}

/** A few entities per target to populate the designer's "sample picker". */
export async function listSampleEntities(target: LabelTargetKind): Promise<{ id: string; label: string }[]> {
  switch (target) {
    case "ITEM": {
      const rows = await prisma.item.findMany({ orderBy: { sortOrder: "asc" }, take: 25, select: { id: true, name: true, partNumber: true } });
      return rows.map((r) => ({ id: r.id, label: r.partNumber ? `${r.name} (${r.partNumber})` : r.name }));
    }
    case "DRAWER": {
      const rows = await prisma.drawer.findMany({ orderBy: { sortOrder: "asc" }, take: 25, select: { id: true, name: true, label: true } });
      return rows.map((r) => ({ id: r.id, label: r.label ? `${r.label} — ${r.name}` : r.name }));
    }
    case "BOX": {
      const rows = await prisma.box.findMany({ orderBy: { sortOrder: "asc" }, take: 25, select: { id: true, name: true } });
      return rows.map((r) => ({ id: r.id, label: r.name }));
    }
    case "BIN": {
      const rows = await prisma.bin.findMany({ orderBy: { sortOrder: "asc" }, take: 25, select: { id: true, name: true } });
      return rows.map((r) => ({ id: r.id, label: r.name || "(unnamed bin)" }));
    }
    default:
      return [];
  }
}
