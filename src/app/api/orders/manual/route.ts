import { route, ok, fail } from "@/lib/http";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/audit";
import { z } from "zod";
import { serializeRequest, requestInclude } from "@/components/orders/serialize";

// POST /api/orders/manual
//   Admin manual buy-list entry. Creates an OrderRequest with source
//   ADMIN_MANUAL (status APPROVED so it lands on the buy list immediately).
//   Permission: orders.approve (admins curating the buy list).
const schema = z
  .object({
    itemId: z.string().min(1).optional(),
    freeName: z.string().trim().min(1).optional(),
    freePartNumber: z.string().trim().optional(),
    freeSupplier: z.string().trim().optional(),
    supplierId: z.string().min(1).optional(),
    quantity: z.coerce.number().int().min(1).default(1),
    unitCost: z.coerce.number().min(0).optional(),
    note: z.string().trim().optional(),
  })
  .refine((d) => Boolean(d.itemId) || Boolean(d.freeName), {
    message: "Provide an existing item or a free-text name.",
    path: ["itemId"],
  });

export const POST = route(async (req: Request) => {
  const user = await requirePermission("orders.approve");
  const body = schema.parse(await req.json());

  let supplierId = body.supplierId ?? null;
  let unitCost = body.unitCost;

  if (body.itemId) {
    const item = await prisma.item.findUnique({
      where: { id: body.itemId },
      select: { id: true, supplierId: true, purchaseCost: true },
    });
    if (!item) return fail("Item not found", 404);
    if (!supplierId) supplierId = item.supplierId ?? null;
    if (unitCost === undefined) unitCost = Number(item.purchaseCost);
  }

  const min = await prisma.orderRequest.aggregate({ _min: { sortOrder: true } });
  const sortOrder = (min._min.sortOrder ?? 0) - 1;

  const created = await prisma.orderRequest.create({
    data: {
      itemId: body.itemId ?? null,
      freeName: body.itemId ? null : body.freeName ?? null,
      freePartNumber: body.itemId ? null : body.freePartNumber || null,
      freeSupplier: body.itemId ? null : body.freeSupplier || null,
      supplierId,
      quantity: body.quantity,
      unitCost: unitCost !== undefined ? unitCost : undefined,
      note: body.note || null,
      status: "APPROVED",
      source: "ADMIN_MANUAL",
      requestedById: user.id,
      approvedById: user.id,
      approvedAt: new Date(),
      sortOrder,
    },
    include: requestInclude,
  });

  await logActivity({
    userId: user.id,
    action: "order.manualAdd",
    entity: "OrderRequest",
    entityId: created.id,
    meta: { quantity: created.quantity },
  });

  return ok(serializeRequest(created));
});
