import { route, ok } from "@/lib/http";
import { requirePermission } from "@/lib/auth";
import { computeBuyList } from "@/components/orders/compute-buy-list";

// GET /api/orders/buy-list
//   Returns the consolidated, per-supplier buy list (shortfalls + approved
//   requests + admin manual entries). See compute-buy-list.ts for the logic.
export const GET = route(async () => {
  await requirePermission("orders.viewAll");
  const buyList = await computeBuyList();
  return ok(buyList);
});

export const dynamic = "force-dynamic";
