import { route, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { z } from "zod";

const ReorderSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
});

export const PATCH = route(async (req: Request) => {
  await requirePermission("users.manage");
  const { ids } = ReorderSchema.parse(await req.json());

  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.userType.update({ where: { id }, data: { sortOrder: index } }),
    ),
  );

  return ok({ success: true });
});
