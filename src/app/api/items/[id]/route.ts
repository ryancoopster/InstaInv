import { route, ok, fail } from "@/lib/http";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { refreshLocationSummaries } from "@/lib/summary";
import { deleteUpload } from "@/lib/storage";
import { logActivity } from "@/lib/audit";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
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
  quantity: z.number().int().optional(),
  desiredQuantity: z.number().int().optional(),
  minQuantity: z.number().int().optional(),
  imageUrl: z.string().trim().optional().nullable(),
  supplierId: z.string().trim().optional().nullable(),
  supplierLink: z.string().trim().optional().nullable(),
  categoryId: z.string().trim().optional().nullable(),
  customValues: z.record(z.any()).optional(),
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
    select: { drawerId: true },
  });
  if (!before) return fail("Item not found", 404);

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
      ...(data.drawerId !== undefined ? { drawerId: data.drawerId || null } : {}),
      ...(data.binId !== undefined ? { binId: data.binId || null } : {}),
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
