import { route, ok } from "@/lib/http";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({ ids: z.array(z.string()).min(1) });

// PATCH /api/bins/reorder — persist manual drag order by index.
export const PATCH = route(async (req: Request) => {
  await requirePermission("boxes.manage");
  const { ids } = schema.parse(await req.json());

  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.bin.update({ where: { id }, data: { sortOrder: index } }),
    ),
  );

  return ok({ ids });
});
