import { route, ok, fail } from "@/lib/http";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { refreshLocationSummaries } from "@/lib/summary";
import { deleteUpload } from "@/lib/storage";
import { logActivity } from "@/lib/audit";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { webUrlSchema } from "@/lib/url";
import { resolveLocation, LocationError } from "@/lib/location";
import { itemInclude, serializeItem } from "../_serialize";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().trim().optional().nullable(),
  partNumber: z.string().trim().optional().nullable(),
  sku: z.string().trim().optional().nullable(),
  barcode: z.string().trim().optional().nullable(),
  purchaseCost: z.union([z.number(), z.string()]).optional(),
  unit: z.string().trim().optional().nullable(),
  // DM-3: quantities can never be negative (matches the adjust route's clamp).
  quantity: z.number().int().min(0).optional(),
  desiredQuantity: z.number().int().min(0).optional(),
  minQuantity: z.number().int().min(0).optional(),
  imageUrl: z.string().trim().optional().nullable(),
  supplierId: z.string().trim().optional().nullable(),
  supplierLink: webUrlSchema.optional().nullable(),
  categoryId: z.string().trim().optional().nullable(),
  customValues: z.record(z.any()).optional(),
  // DM-1: accept boxId so an item can be placed "in a box but not yet in a drawer".
  boxId: z.string().trim().optional().nullable(),
  drawerId: z.string().trim().optional().nullable(),
  binId: z.string().trim().optional().nullable(),
});

type Params = { params: { id: string } };

export const GET = route(async (_req: Request, { params }: Params) => {
  await requirePermission("items.view");
  const item = await prisma.item.findUnique({
    where: { id: params.id },
    include: itemInclude,
  });
  if (!item) return fail("Item not found", 404);
  return ok(serializeItem(item));
});

export const PATCH = route(async (req: Request, { params }: Params) => {
  const user = await requirePermission("items.edit");
  const data = patchSchema.parse(await req.json());

  const before = await prisma.item.findUnique({
    where: { id: params.id },
    select: { boxId: true, drawerId: true, binId: true },
  });
  if (!before) return fail("Item not found", 404);

  // DM-1: when any location field is in the body, re-derive a consistent
  // box/drawer/bin trio (bin->drawer->box). Absent fields fall back to the
  // item's current value so a partial PATCH keeps the rest of the location.
  const touchesLocation =
    data.boxId !== undefined || data.drawerId !== undefined || data.binId !== undefined;
  let location: { boxId: string | null; drawerId: string | null; binId: string | null } | null = null;
  if (touchesLocation) {
    try {
      location = await resolveLocation({
        boxId: data.boxId !== undefined ? data.boxId : before.boxId,
        drawerId: data.drawerId !== undefined ? data.drawerId : before.drawerId,
        binId: data.binId !== undefined ? data.binId : before.binId,
      });
    } catch (err) {
      if (err instanceof LocationError) return fail(err.message, err.status);
      throw err;
    }
  }

  // Global, case-insensitive part-number uniqueness (DB enforces it too).
  const pn = data.partNumber?.trim();
  if (data.partNumber !== undefined && pn) {
    const dupe = await prisma.item.findFirst({
      where: { partNumber: { equals: pn, mode: "insensitive" }, id: { not: params.id } },
      select: { id: true, name: true },
    });
    if (dupe) return fail(`Part number "${pn}" is already used by "${dupe.name}"`, 409);
  }

  const item = await prisma.item.update({
    where: { id: params.id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.description !== undefined ? { description: data.description || null } : {}),
      ...(data.partNumber !== undefined ? { partNumber: data.partNumber || null } : {}),
      ...(data.sku !== undefined ? { sku: data.sku || null } : {}),
      ...(data.barcode !== undefined ? { barcode: data.barcode || null } : {}),
      ...(data.purchaseCost !== undefined ? { purchaseCost: data.purchaseCost.toString() } : {}),
      ...(data.unit !== undefined ? { unit: data.unit || null } : {}),
      ...(data.quantity !== undefined ? { quantity: data.quantity } : {}),
      ...(data.desiredQuantity !== undefined ? { desiredQuantity: data.desiredQuantity } : {}),
      ...(data.minQuantity !== undefined ? { minQuantity: data.minQuantity } : {}),
      ...(data.imageUrl !== undefined ? { imageUrl: data.imageUrl || null } : {}),
      ...(data.supplierId !== undefined ? { supplierId: data.supplierId || null } : {}),
      ...(data.supplierLink !== undefined ? { supplierLink: data.supplierLink || null } : {}),
      ...(data.categoryId !== undefined ? { categoryId: data.categoryId || null } : {}),
      ...(data.customValues !== undefined
        ? { customValues: data.customValues as Prisma.InputJsonValue }
        : {}),
      // DM-1: write the fully-resolved trio together so boxId stays consistent.
      ...(location
        ? { boxId: location.boxId, drawerId: location.drawerId, binId: location.binId }
        : {}),
    },
    include: itemInclude,
  });

  // Refresh summaries for any drawer that gained or lost this item.
  const affected = new Set<string>();
  if (before.drawerId) affected.add(before.drawerId);
  if (item.drawerId) affected.add(item.drawerId);
  for (const drawerId of affected) await refreshLocationSummaries(drawerId);

  await logActivity({ userId: user.id, action: "item.update", entity: "Item", entityId: item.id });
  return ok(serializeItem(item));
});

export const DELETE = route(async (_req: Request, { params }: Params) => {
  const user = await requirePermission("items.delete");

  const item = await prisma.item.findUnique({
    where: { id: params.id },
    select: { id: true, imageUrl: true, drawerId: true },
  });
  if (!item) return fail("Item not found", 404);

  await prisma.item.delete({ where: { id: params.id } });

  // Clean up the image file and refresh the drawer it lived in.
  await deleteUpload(item.imageUrl);
  if (item.drawerId) await refreshLocationSummaries(item.drawerId);

  await logActivity({ userId: user.id, action: "item.delete", entity: "Item", entityId: params.id });
  return ok({ id: params.id });
});
