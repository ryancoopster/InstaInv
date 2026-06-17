import { route, ok } from "@/lib/http";
import { requirePermission } from "@/lib/auth";
import { computeReorderReport } from "@/components/reports/lib/report";

export const dynamic = "force-dynamic";

// GET /api/reports/reorder?supplierId=...&onlyBelowMin=1
// Returns the reorder report as JSON (Decimals already serialized to strings
// by computeReorderReport).
export const GET = route(async (req: Request) => {
  await requirePermission("reports.view");

  const url = new URL(req.url);
  const supplierIdParam = url.searchParams.get("supplierId");
  const supplierId = supplierIdParam && supplierIdParam !== "all" ? supplierIdParam : null;
  const onlyBelowMin =
    url.searchParams.get("onlyBelowMin") === "1" ||
    url.searchParams.get("onlyBelowMin") === "true";

  const report = await computeReorderReport({ supplierId, onlyBelowMin });
  return ok(report);
});
