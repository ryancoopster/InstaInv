import { route, ok } from "@/lib/http";
import { requirePermission } from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import { refreshMany } from "@/lib/pricing";
import { z } from "zod";

export const dynamic = "force-dynamic";
// A batch of fetches can run a while; bound it and give the route headroom.
export const maxDuration = 60;

const bodySchema = z
  .object({
    // When set, only refresh items older than this many hours; omit for "all".
    staleHours: z.number().int().min(1).max(24 * 30).optional(),
    limit: z.number().int().min(1).max(500).optional(),
    concurrency: z.number().int().min(1).max(8).optional(),
  })
  .optional();

// POST /api/pricing/refresh-all — refresh a bounded batch of items. The work is
// capped (default 100 items, concurrency 4) so a single request can't run away.
export const POST = route(async (req: Request) => {
  const user = await requirePermission("pricing.manage");

  let opts: { staleHours?: number; limit?: number; concurrency?: number } = {};
  try {
    const json = await req.json();
    opts = bodySchema.parse(json) ?? {};
  } catch {
    // Empty/invalid body -> refresh-all with defaults.
    opts = {};
  }

  const summary = await refreshMany({
    staleHours: opts.staleHours,
    limit: opts.limit ?? 100,
    concurrency: opts.concurrency ?? 4,
  });

  await logActivity({
    userId: user.id,
    action: "pricing.refreshAll",
    entity: "Item",
    meta: { ...summary, staleHours: opts.staleHours ?? null },
  });

  return ok(summary);
});
