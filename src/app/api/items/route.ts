import { route, ok } from "@/lib/http";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { refreshLocationSummaries } from "@/lib/summary";
import { logActivity } from "@/lib/audit";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { itemInclude, serializeItem } from "./_serialize";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(1, "Name is required"),
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

export const GET = route(async (req: Request) => {
  await requirePermission("items.view");
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const categoryId = url.searchParams.get("categoryId") || undefined;
  const supplierId = url.searchParams.get("supplierId") || undefined;
  const boxId = url.searchParams.get("boxId") || undefined;
  const drawerId = url.searchParams.get("drawerId") || undefined;

  const where: Prisma.ItemWhereInput = {
    ...(categoryId ? { categoryId } : {}),
    ...(supplierId ? { supplierId } : {}),
    ...(drawerId ? { drawerId } : {}),
    ...(boxId ? { drawer: { boxId } } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { partNumber: { contains: q, mode: "insensitive" } },
            { sku: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const items = await prisma.item.findMany({
    where,
    include: itemInclude,
    orderBy: { sortOrder: "asc" },
  });

  return ok(items.map(serializeItem));
});

export const POST = route(async (req: Request) => {
  const user = await requirePermission("items.create");
  const data = createSchema.parse(await req.json());

  const max = await prisma.item.aggregate({ _max: { sortOrder: true } });

  const item = await prisma.item.create({
    data: {
      name: data.name,
      description: data.description || null,
      partNumber: data.partNumber || null,
      sku: data.sku || null,
      barcode: data.barcode || null,
      purchaseCost: data.purchaseCost != null ? data.purchaseCost.toString() : undefined,
      unit: data.unit || null,
      quantity: data.quantity ?? 0,
      desiredQuantity: data.desiredQuantity ?? 0,
      minQuantity: data.minQuantity ?? 0,
      imageUrl: data.imageUrl || null,
      supplierId: data.supplierId || null,
      supplierLink: data.supplierLink || null,
      categoryId: data.categoryId || null,
      customValues: (data.customValues ?? {}) as Prisma.InputJsonValue,
      drawerId: data.drawerId || null,
      binId: data.binId || null,
      sortOrder: (max._max.sortOrder ?? 0) + 1,
    },
    include: itemInclude,
  });

  if (item.drawerId) await refreshLocationSummaries(item.drawerId);
  await logActivity({ userId: user.id, action: "item.create", entity: "Item", entityId: item.id });

  return ok(serializeItem(item));
});
