import { route, ok } from "@/lib/http";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/audit";
import { refreshLocationSummaries } from "@/lib/summary";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.object({
  updates: z
    .array(
      z.object({
        itemId: z.string().min(1),
        quantity: z.number().int().min(0).max(1_000_000),
      }),
    )
    .min(1),
});

// Apply reviewed counts: set each item's on-hand quantity to the counted value.
// Guarded by items.adjustQuantity (inventory taking). Refreshes the affected
// drawer/box summaries and writes an audit log entry per change.
export const POST = route(async (req: Request) => {
  const user = await requirePermission("items.adjustQuantity");
  const body = Body.parse(await req.json());

  // De-dupe by itemId (last write wins) so a noisy review table can't double-apply.
  const map = new Map<string, number>();
  for (const u of body.updates) map.set(u.itemId, u.quantity);
  const ids = [...map.keys()];

  // Load current state so we can log before/after and skip no-ops.
  const existing = await prisma.item.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, quantity: true, drawerId: true },
  });
  const existingById = new Map(existing.map((e) => [e.id, e]));

  const drawerIds = new Set<string>();
  let applied = 0;
  const skipped: string[] = [];

  await prisma.$transaction(async (tx) => {
    for (const [itemId, quantity] of map) {
      const prev = existingById.get(itemId);
      if (!prev) {
        skipped.push(itemId);
        continue;
      }
      if (prev.quantity === quantity) continue; // no-op
      await tx.item.update({ where: { id: itemId }, data: { quantity } });
      applied++;
      if (prev.drawerId) drawerIds.add(prev.drawerId);
      await logActivity({
        userId: user.id,
        action: "item.adjustQuantity",
        entity: "Item",
        entityId: itemId,
        meta: { from: prev.quantity, to: quantity, source: "checklist-scan", name: prev.name },
      });
    }
  });

  // Refresh content summaries for every affected drawer (+ its parent box).
  for (const drawerId of drawerIds) {
    await refreshLocationSummaries(drawerId);
  }

  return ok({ applied, skipped, total: ids.length });
});
