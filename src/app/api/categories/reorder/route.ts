import { route, ok } from "@/lib/http";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({ ids: z.array(z.string()).min(1) });

export const PATCH = route(async (req: Request) => {
  await requirePermission("categories.manage");
  const { ids } = schema.parse(await req.json());

  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.category.update({ where: { id }, data: { sortOrder: index } }),
    ),
  );

  return ok({ count: ids.length });
});
