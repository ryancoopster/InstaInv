import { route, ok } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";

// Lenient: the client owns the canonical shape (normalizeConfig clamps spans and
// drops unknown widgets on read), so we only enforce the rough structure here.
const configSchema = z.object({
  widgets: z.array(
    z.object({
      type: z.string(),
      span: z.number(),
      visible: z.boolean(),
    }),
  ),
  updatedAt: z.string().optional(),
});

export const GET = route(async () => {
  const user = await requireUser();
  return ok(user.dashboardConfig ?? null);
});

export const PUT = route(async (req: Request) => {
  const user = await requireUser();
  const parsed = configSchema.parse(await req.json());

  await prisma.user.update({
    where: { id: user.id },
    data: { dashboardConfig: parsed },
  });

  return ok(parsed);
});
