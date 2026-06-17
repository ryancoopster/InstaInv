import { route, ok } from "@/lib/http";
import { requirePermission } from "@/lib/auth";
import { z } from "zod";
import { matchLinesToItems } from "../_lib";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.object({
  boxId: z.string().min(1),
  // Either the raw OCR text blob, or pre-split lines (we join them).
  text: z.string().optional(),
  lines: z.array(z.string()).optional(),
});

// Given OCR output + a boxId, heuristically map recognized lines back to the
// box's items and pull out the handwritten count. Best-effort: every proposed
// row carries a confidence and is meant to be reviewed before applying.
export const POST = route(async (req: Request) => {
  await requirePermission("ocr.scan");
  const body = Body.parse(await req.json());

  const text = body.text ?? (body.lines ? body.lines.join("\n") : "");
  const rows = await matchLinesToItems(body.boxId, text);

  return ok({ boxId: body.boxId, rows });
});
