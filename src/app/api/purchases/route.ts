import { route, ok } from "@/lib/http";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serializePurchase } from "@/lib/purchases";

export const dynamic = "force-dynamic";

// GET /api/purchases[?itemId=&limit=] — the central purchase log (most recent
// first), optionally filtered to one item. Gated by orders.viewAll.
export const GET = route(async (req: Request) => {
  await requirePermission("orders.viewAll");
  const url = new URL(req.url);
  const itemId = url.searchParams.get("itemId") || undefined;
  const limit = Math.min(Number(url.searchParams.get("limit")) || 200, 500);

  const purchases = await prisma.purchase.findMany({
    where: itemId ? { itemId } : undefined,
    orderBy: { purchasedAt: "desc" },
    take: limit,
    include: { purchasedBy: { select: { name: true } } },
  });

  return ok(purchases.map(serializePurchase));
});
