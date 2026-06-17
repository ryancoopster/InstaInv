import { route, ok } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

// PATCH /api/requests/reorder — persist a new manual order.
// Body: { ids: string[] } in the desired visual order; sortOrder = index.
const schema = z.object({ ids: z.array(z.string().min(1)) });

export const PATCH = route(async (req: Request) => {
  const user = await requireUser();
  if (!hasPermission(user, "orders.request") && !hasPermission(user, "orders.viewAll")) {
    return ok({ updated: 0 });
  }
  const { ids } = schema.parse(await req.json());

  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.orderRequest.update({ where: { id }, data: { sortOrder: index } }),
    ),
  );

  return ok({ updated: ids.length });
});
