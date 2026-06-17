import { fail } from "@/lib/http";
import { requirePermission, AuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { renderLabelPdf } from "@/lib/labels/render";
import { loadEntityData } from "@/lib/labels/entity";
import { sampleEntity } from "@/lib/labels/bindings";
import type { LabelTargetKind } from "@/lib/labels/types";

// Node runtime required: pdf-lib, qrcode and bwip-js use Node Buffers/streams.
export const runtime = "nodejs";

const querySchema = z.object({
  templateId: z.string().min(1),
  target: z.enum(["ITEM", "BIN", "DRAWER", "BOX", "GENERIC"]).optional(),
  id: z.string().optional(), // target entity id
  format: z.enum(["pdf"]).optional(),
  download: z.string().optional(),
  sample: z.string().optional(), // "1" => render with sample data
});

// GET /api/labels/render?templateId=&target=&id=&format=pdf&download=1
// Loads the template + the target entity, resolves bindings, renders a PDF and
// streams it inline (preview) or as an attachment (download).
export async function GET(req: Request) {
  try {
    await requirePermission("labels.print");

    const url = new URL(req.url);
    const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) return fail("Invalid query", 422, { issues: parsed.error.flatten() });
    const q = parsed.data;

    const tpl = await prisma.labelTemplate.findUnique({ where: { id: q.templateId } });
    if (!tpl) return fail("Template not found", 404);

    const target = (q.target ?? tpl.target) as LabelTargetKind;

    // Resolve which entity to bind against:
    //  - explicit ?id=  -> load that entity
    //  - ?sample=1 or no id -> use sample data so the preview always renders
    let entity = null as Awaited<ReturnType<typeof loadEntityData>>;
    if (q.id && q.sample !== "1") {
      entity = await loadEntityData(target, q.id);
      if (!entity) return fail("Target entity not found", 404);
    } else {
      entity = sampleEntity(target);
    }

    const pdf = await renderLabelPdf({
      content: tpl.content,
      widthMm: tpl.widthMm,
      heightMm: tpl.heightMm,
      entity,
    });

    const isDownload = q.download === "1" || q.download === "true";
    const safeName = tpl.name.replace(/[^a-z0-9_-]+/gi, "_").toLowerCase() || "label";
    const filename = `${safeName}.pdf`;

    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${isDownload ? "attachment" : "inline"}; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return fail(
        err.code === "UNAUTHENTICATED" ? "Not signed in" : "You do not have permission",
        err.code === "UNAUTHENTICATED" ? 401 : 403,
        { permission: err.permission },
      );
    }
    console.error("[labels.render]", err);
    return fail(err instanceof Error ? err.message : "Render failed", 500);
  }
}

export const dynamic = "force-dynamic";
