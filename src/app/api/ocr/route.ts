import { route, ok, fail } from "@/lib/http";
import { requirePermission } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { createWorker, type Worker, type Line, type Word } from "tesseract.js";

export const dynamic = "force-dynamic";
// tesseract.js downloads its WASM core + traineddata at runtime — Node only.
export const runtime = "nodejs";
// OCR can take a while; give it room (but bounded to limit DoS impact).
export const maxDuration = 60;

const OCR_LANG = process.env.OCR_LANG || "eng";

// OCR is CPU-expensive — throttle per user and cap global concurrency so it can't
// be used to exhaust the server.
const OCR_MAX_PER_WINDOW = 20;
const OCR_WINDOW_SEC = 5 * 60;
const OCR_MAX_CONCURRENT = 2;
let activeOcrJobs = 0;

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
  const user = await requirePermission("ocr.scan");

  // Per-user throttle.
  const rl = rateLimit(`ocr:${user.id}`, OCR_MAX_PER_WINDOW, OCR_WINDOW_SEC);
  if (!rl.ok) {
    return fail("Too many OCR requests. Please wait a moment and try again.", 429, {
      retryAfterSec: rl.retryAfterSec,
    });
  }
  // Global concurrency cap so a burst can't pin every CPU.
  // F1/SEC-7: reserve the slot atomically. The check and the increment happen in
  // the same synchronous tick with NO await between them, so concurrent requests
  // can't all pass a stale check before any of them increments (TOCTOU). The whole
  // handler body then runs inside the try below so the finally always releases the
  // slot — including the early validation returns, which previously sat before the
  // increment and so could leak a reserved slot if moved up naively.
  if (activeOcrJobs >= OCR_MAX_CONCURRENT) {
    return fail("The OCR engine is busy. Please try again shortly.", 503, { code: "OCR_BUSY" });
  }
  activeOcrJobs += 1;

  let worker: Worker | null = null;
  try {
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

    // F9: ask explicitly for text + blocks so the block tree is always present.
    const { data } = await worker.recognize(buffer, {}, { text: true, blocks: true });

    // F9: tesseract.js v5 does NOT expose flat data.lines / data.words at runtime
    // (those keys are undefined despite the stale bundled .d.ts), so the previous
    // `(data as any).lines` always fell back to []. Derive them from the real
    // block tree: blocks[].paragraphs[].lines[].words[].
    const blocks = data.blocks ?? [];
    const tessLines: Line[] = blocks.flatMap((b) => b.paragraphs.flatMap((p) => p.lines));
    const tessWords: Word[] = tessLines.flatMap((l) => l.words);

    const lines: OcrLine[] = tessLines.map((l) => ({
      text: (l.text || "").trim(),
      confidence: l.confidence ?? 0,
      bbox: l.bbox ?? { x0: 0, y0: 0, x1: 0, y1: 0 },
    }));

    const words: OcrWord[] = tessWords.map((w) => ({
      text: (w.text || "").trim(),
      confidence: w.confidence ?? 0,
      bbox: w.bbox ?? { x0: 0, y0: 0, x1: 0, y1: 0 },
    }));

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
    activeOcrJobs = Math.max(0, activeOcrJobs - 1);
    if (worker) {
      try {
        await worker.terminate();
      } catch {
        /* ignore */
      }
    }
  }
});
