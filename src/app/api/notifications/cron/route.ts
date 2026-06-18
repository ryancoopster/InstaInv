import { route, ok } from "@/lib/http";
import { compileAndSendDue } from "@/lib/notifications/service";
import { verifyCronSecret } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/notifications/cron — external scheduler entry point to flush due
// approve/deny digests (for serverless/multi-instance where the in-process tick
// is unreliable). Header-secret only (NOTIFICATIONS_CRON_SECRET).
export const GET = route(async (req: Request) => {
  // F2: shared header-secret check (see src/lib/cron-auth.ts).
  const denied = verifyCronSecret(req, "NOTIFICATIONS_CRON_SECRET");
  if (denied) return denied;

  const res = await compileAndSendDue();
  return ok(res);
});
