import { route, ok, fail } from "@/lib/http";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { refreshLocationSummaries } from "@/lib/summary";
import { logActivity } from "@/lib/audit";
import { z } from "zod";
import { itemInclude, serializeItem } from "../../_serialize";

export const dynamic = "force-dynamic";

const schema = z
  .object({
    delta: z.number().int().optional(),
    setTo: z.number().int().min(0).optional(),
  })
  .refine((v) => v.delta !== undefined || v.setTo !== undefined, {
    message: "Provide delta or setTo",
  });

type Params = { params: { id: string } };

export const PATCH = route(async (req: Request, { params }: Params) => {
  const user = await requirePermission("items.adjustQuantity");
  const data = schema.parse(await req.json());

  const current = await prisma.item.findUnique({
    where: { id: params.id },
    select: { quantity: true, drawerId: true },
  });
  if (!current) return fail("Item not found", 404);

  const next =
    data.setTo !== undefined
      ? data.setTo
      : Math.max(0, current.quantity + (data.delta ?? 0));

  const item = await prisma.item.update({
    where: { id: params.id },
    data: { quantity: next },
    include: itemInclude,
  });

  if (item.drawerId) await refreshLocationSummaries(item.drawerId);
  await logActivity({
    userId: user.id,
    action: "item.adjustQuantity",
    entity: "Item",
    entityId: item.id,
    meta: { from: current.quantity, to: next },
  });

  return ok(serializeItem(item));
});
