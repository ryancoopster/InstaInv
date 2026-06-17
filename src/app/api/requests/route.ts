import { route, ok, fail } from "@/lib/http";
import { requirePermission, requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/audit";
import { z } from "zod";
import { serializeRequest, requestInclude } from "@/components/orders/serialize";

// GET /api/requests
//   Returns order requests. A user with orders.viewAll sees everything;
//   otherwise the list is scoped to the requests they raised themselves.
export const GET = route(async () => {
  const user = await requireUser();
  // Anyone who can request (or view all) may hit this endpoint.
  if (!hasPermission(user, "orders.request") && !hasPermission(user, "orders.viewAll")) {
    return fail("You do not have permission", 403);
  }

  const viewAll = hasPermission(user, "orders.viewAll");
  const rows = await prisma.orderRequest.findMany({
    where: viewAll ? {} : { requestedById: user.id },
    include: requestInclude,
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });

  return ok(rows.map(serializeRequest));
});

// POST /api/requests
//   Create a new request: either an existing item (itemId) OR a free-text item.
const createSchema = z
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
  const user = await requirePermission("orders.request");
  const body = createSchema.parse(await req.json());

  // Resolve the supplier: explicit supplierId wins; else inherit from the item.
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

  // New rows go to the top of the manual order (lowest sortOrder).
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
      status: "REQUESTED",
      source: "USER_REQUEST",
      requestedById: user.id,
      sortOrder,
    },
    include: requestInclude,
  });

  await logActivity({
    userId: user.id,
    action: "order.request",
    entity: "OrderRequest",
    entityId: created.id,
    meta: { quantity: created.quantity, itemId: created.itemId },
  });

  return ok(serializeRequest(created));
});
