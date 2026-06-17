import { route, ok } from "@/lib/http";
import { requirePermission } from "@/lib/auth";
import { getPriceHistory } from "@/lib/pricing";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

// GET /api/pricing/items/[id]/history — recent PriceHistory rows for an item.
export const GET = route(async (req: Request, { params }: Params) => {
  // Reading history is part of viewing pricing; gate on the same permission used
  // to manage pricing so the data isn't exposed more broadly than the controls.
  await requirePermission("pricing.manage");
  const url = new URL(req.url);
  const take = Number(url.searchParams.get("take") ?? "20");
  const history = await getPriceHistory(params.id, Number.isFinite(take) ? take : 20);
  return ok(history);
});
