import { route, ok } from "@/lib/http";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({ ids: z.array(z.string()).min(1) });

// PATCH /api/labels/reorder — persist new sortOrder by array index.
// The list is grouped by target; reordering happens within a target group, so
// the incoming ids are the new ordering for that group.
export const PATCH = route(async (req: Request) => {
  await requirePermission("labels.design");
  const { ids } = schema.parse(await req.json());

  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.labelTemplate.update({ where: { id }, data: { sortOrder: index } }),
    ),
  );

  return ok({ count: ids.length });
});
