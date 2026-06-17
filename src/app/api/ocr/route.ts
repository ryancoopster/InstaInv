import { route, ok, fail } from "@/lib/http";
import { requirePermission } from "@/lib/auth";
import { createWorker, type Worker } from "tesseract.js";

export const dynamic = "force-dynamic";
// tesseract.js downloads its WASM core + traineddata at runtime — Node only.
export const runtime = "nodejs";
// OCR can take a while; give it room.
export const maxDuration = 120;

const OCR_LANG = process.env.OCR_LANG || "eng";

interface OcrWord {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

interface OcrLine {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

interface OcrResult {
  text: string;
  confidence: number;
  lang: string;
  lines: OcrLine[];
  words: OcrWord[];
}

export const POST = route(async (req: Request) => {
  await requirePermission("ocr.scan");

  const form = await req.formData();
  const file = form.get("image") ?? form.get("file");
  if (!(file instanceof File)) {
    return fail("No image uploaded. Send a multipart form field named 'image'.", 422);
  }
  if (file.size === 0) {
    return fail("Uploaded image is empty.", 422);
  }
  // Basic guard so we don't hand a huge file to tesseract.
  if (file.size > 20 * 1024 * 1024) {
    return fail("Image too large (max 20MB).", 413);
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let worker: Worker | null = null;
  try {
    // Worker / language initialization is the fragile part (it fetches the WASM
    // core and the <lang>.traineddata). If anything here throws, we must NOT
    // crash — report a clean 503 with guidance instead.
    try {
      worker = await createWorker(OCR_LANG);
    } catch (initErr) {
      console.error("[ocr] worker init failed", initErr);
      return fail(
        `OCR engine unavailable. Could not initialize the '${OCR_LANG}' language model. ` +
          `This usually means the tesseract.js core or traineddata could not be downloaded ` +
          `on the server. Verify network access or set OCR_LANG to an installed language.`,
        503,
        { code: "OCR_UNAVAILABLE" },
      );
    }

    const { data } = await worker.recognize(buffer);

    const lines: OcrLine[] =
      (data as any).lines?.map((l: any) => ({
        text: (l.text || "").trim(),
        confidence: l.confidence ?? 0,
        bbox: l.bbox ?? { x0: 0, y0: 0, x1: 0, y1: 0 },
      })) ?? [];

    const words: OcrWord[] =
      (data as any).words?.map((w: any) => ({
        text: (w.text || "").trim(),
        confidence: w.confidence ?? 0,
        bbox: w.bbox ?? { x0: 0, y0: 0, x1: 0, y1: 0 },
      })) ?? [];

    const result: OcrResult = {
      text: data.text || "",
      confidence: data.confidence ?? 0,
      lang: OCR_LANG,
      lines: lines.filter((l) => l.text.length > 0),
      words: words.filter((w) => w.text.length > 0),
    };

    return ok(result);
  } catch (err) {
    console.error("[ocr] recognize failed", err);
    return fail(
      "OCR failed while reading the image. Try a clearer, higher-contrast scan.",
      503,
      { code: "OCR_FAILED" },
    );
  } finally {
    if (worker) {
      try {
        await worker.terminate();
      } catch {
        /* ignore */
      }
    }
  }
});
