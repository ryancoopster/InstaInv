import { z } from "zod";
import { route } from "@/lib/http";
import { requirePermission } from "@/lib/auth";
import { computeReorderReport } from "@/components/reports/lib/report";
import { buildReorderXlsx } from "@/components/reports/lib/xlsx";
import { buildReorderPdf } from "@/components/reports/lib/pdf";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  format: z.enum(["pdf", "xlsx"]),
  supplierId: z.string().optional().nullable(),
  onlyBelowMin: z
    .string()
    .optional()
    .transform((v) => v === "1" || v === "true"),
});

// GET /api/reports/export?format=pdf|xlsx&supplierId=...&onlyBelowMin=1
// Streams a generated file (attachment). Guarded by reports.export.
export const GET = route(async (req: Request) => {
  await requirePermission("reports.export");

  const url = new URL(req.url);
  const { format, supplierId, onlyBelowMin } = querySchema.parse({
    format: url.searchParams.get("format"),
    supplierId: url.searchParams.get("supplierId"),
    onlyBelowMin: url.searchParams.get("onlyBelowMin") ?? undefined,
  });

  const cleanSupplier = supplierId && supplierId !== "all" ? supplierId : null;
  const report = await computeReorderReport({ supplierId: cleanSupplier, onlyBelowMin });

  const stamp = new Date(report.generatedAt).toISOString().slice(0, 10);

  if (format === "xlsx") {
    const buffer = await buildReorderXlsx(report);
    return new Response(toBody(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="reorder-report-${stamp}.xlsx"`,
        "Content-Length": String(buffer.length),
        "Cache-Control": "no-store",
      },
    });
  }

  const buffer = await buildReorderPdf(report);
  return new Response(toBody(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="reorder-report-${stamp}.pdf"`,
      "Content-Length": String(buffer.length),
      "Cache-Control": "no-store",
    },
  });
});

// A Node Buffer is a valid response body at runtime (Next/undici accept it), but
// the DOM `BodyInit` type in this TS lib config doesn't list it. Cast through a
// minimal helper so the runtime stays zero-copy and the types stay quiet.
function toBody(buffer: Buffer): BodyInit {
  return buffer as unknown as BodyInit;
}
