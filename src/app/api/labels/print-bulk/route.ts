import { fail } from "@/lib/http";
import { requirePermission, AuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/audit";
import { z } from "zod";
import { renderLabelPdf, mergeLabelPdfs } from "@/lib/labels/render";
import { loadEntityData } from "@/lib/labels/entity";

// Node runtime required: pdf-lib, qrcode and bwip-js use Node Buffers/streams.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cap a single batch so one request can't render an unbounded number of labels
// (each label embeds fonts + generates QR/barcode images).
const MAX_ITEMS = 500;

const bodySchema = z.object({
  templateId: z.string().min(1),
  itemIds: z.array(z.string().min(1)).min(1).max(MAX_ITEMS),
  download: z.boolean().optional(),
});

// POST /api/labels/print-bulk { templateId, itemIds[] }
// Renders an ITEM label for each selected item using the chosen template and
// returns them merged into a single multi-page PDF (one label per page).
export async function POST(req: Request) {
  try {
    const user = await requirePermission("labels.print");

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return fail("Invalid request", 422, { issues: parsed.error?.flatten() });
    }
    const { templateId, itemIds, download } = parsed.data;

    const tpl = await prisma.labelTemplate.findUnique({ where: { id: templateId } });
    if (!tpl) return fail("Template not found", 404);
    if (tpl.target !== "ITEM") {
      return fail("Choose an item label template to print item labels", 400);
    }

    // De-duplicate while preserving the caller's order.
    const uniqueIds = [...new Set(itemIds)];

    const buffers: Buffer[] = [];
    let missing = 0;
    for (const id of uniqueIds) {
      const entity = await loadEntityData("ITEM", id);
      if (!entity) {
        missing++;
        continue;
      }
      buffers.push(
        await renderLabelPdf({
          content: tpl.content,
          widthMm: tpl.widthMm,
          heightMm: tpl.heightMm,
          entity,
        }),
      );
    }

    if (buffers.length === 0) {
      return fail("None of the selected items could be found", 404);
    }

    const pdf = await mergeLabelPdfs(buffers);

    await logActivity({
      userId: user.id,
      action: "label.printBulk",
      entity: "LabelTemplate",
      entityId: tpl.id,
      meta: { count: buffers.length, requested: uniqueIds.length, missing },
    });

    const safeName = tpl.name.replace(/[^a-z0-9_-]+/gi, "_").toLowerCase() || "labels";
    const filename = `${safeName}-${buffers.length}-labels.pdf`;
    const isDownload = download === true;

    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${isDownload ? "attachment" : "inline"}; filename="${filename}"`,
        "Cache-Control": "no-store",
        "X-Label-Count": String(buffers.length),
        "X-Label-Missing": String(missing),
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
    console.error("[labels.print-bulk]", err);
    return fail(err instanceof Error ? err.message : "Print failed", 500);
  }
}
