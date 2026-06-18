import { route, ok, fail } from "@/lib/http";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { refreshLocationSummaries } from "@/lib/summary";
import { logActivity } from "@/lib/audit";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { webUrlSchema } from "@/lib/url";
import { resolveLocation, LocationError } from "@/lib/location";
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

  // Global, case-insensitive part-number uniqueness (DB enforces it too).
  const pn = data.partNumber?.trim();
  if (pn) {
    const dupe = await prisma.item.findFirst({
      where: { partNumber: { equals: pn, mode: "insensitive" } },
      select: { id: true, name: true },
    });
    if (dupe) return fail(`Part number "${pn}" is already used by "${dupe.name}"`, 409);
  }

  // DM-1: derive a consistent box/drawer/bin trio (bin->drawer->box) so the
  // denormalized boxId can't drift from drawerId/binId.
  let location: Awaited<ReturnType<typeof resolveLocation>>;
  try {
    location = await resolveLocation({
      boxId: data.boxId,
      drawerId: data.drawerId,
      binId: data.binId,
    });
  } catch (err) {
    if (err instanceof LocationError) return fail(err.message, err.status);
    throw err;
  }

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
      boxId: location.boxId,
      drawerId: location.drawerId,
      binId: location.binId,
      sortOrder: (max._max.sortOrder ?? 0) + 1,
    },
    include: itemInclude,
  });

  if (item.drawerId) await refreshLocationSummaries(item.drawerId);
  await logActivity({ userId: user.id, action: "item.create", entity: "Item", entityId: item.id });

  return ok(serializeItem(item));
});
