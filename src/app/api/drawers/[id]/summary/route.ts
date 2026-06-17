import { route, ok } from "@/lib/http";
import { requirePermission } from "@/lib/auth";
import { refreshDrawerSummary } from "@/lib/summary";

type Ctx = { params: { id: string } };

// POST /api/drawers/[id]/summary — regenerate the drawer's auto summary.
export const POST = route(async (_req: Request, ctx: Ctx) => {
  await requirePermission("boxes.view");
  const summary = await refreshDrawerSummary(ctx.params.id);
  return ok({ id: ctx.params.id, summary });
});
