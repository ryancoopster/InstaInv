import { route, ok } from "@/lib/http";
import { requirePermission } from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import { getPricingSettings, savePricingSettings } from "@/lib/pricing";
import { z } from "zod";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  autoEnabled: z.boolean().optional(),
  intervalHours: z.number().int().min(1).max(168).optional(),
  staleHours: z.number().int().min(1).max(24 * 30).optional(),
});

// GET /api/pricing/settings — read the Setting("pricing") row (with defaults).
export const GET = route(async () => {
  await requirePermission("pricing.manage");
  const settings = await getPricingSettings();
  return ok(settings);
});

// PATCH /api/pricing/settings — update auto-fetch config.
export const PATCH = route(async (req: Request) => {
  const user = await requirePermission("pricing.manage");
  const patch = patchSchema.parse(await req.json());
  const settings = await savePricingSettings(patch);
  await logActivity({
    userId: user.id,
    action: "pricing.settings.update",
    entity: "Setting",
    entityId: "pricing",
    meta: { ...settings },
  });
  return ok(settings);
});
