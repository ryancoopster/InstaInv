import { route, ok, fail } from "@/lib/http";
import { requirePermission } from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import { applyPriceToCost } from "@/lib/pricing";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

// POST /api/pricing/items/[id]/apply — copy the item's lastFetchedPrice into its
// purchaseCost. Fails cleanly when there is no fetched price to apply.
export const POST = route(async (_req: Request, { params }: Params) => {
  const user = await requirePermission("pricing.manage");
  const result = await applyPriceToCost(params.id);
  if (!result) return fail("No fetched price to apply", 400);

  await logActivity({
    userId: user.id,
    action: "pricing.applyToCost",
    entity: "Item",
    entityId: params.id,
    meta: { purchaseCost: result.purchaseCost },
  });

  return ok(result);
});
