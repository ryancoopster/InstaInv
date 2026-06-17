import { route, ok } from "@/lib/http";
import { requirePermission } from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import { applyFetch } from "@/lib/pricing";

export const dynamic = "force-dynamic";
// Scraping can take up to the fetcher's 12s timeout; give the route headroom.
export const maxDuration = 30;

type Params = { params: { id: string } };

// POST /api/pricing/items/[id]/refresh — fetch the current price for one item
// and persist it. Returns the updated price fields.
export const POST = route(async (_req: Request, { params }: Params) => {
  const user = await requirePermission("pricing.manage");
  const result = await applyFetch(params.id);

  await logActivity({
    userId: user.id,
    action: "pricing.refresh",
    entity: "Item",
    entityId: params.id,
    meta: { success: result.success, status: result.status, price: result.price },
  });

  return ok(result);
});
