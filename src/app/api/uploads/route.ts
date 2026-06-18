import { route, ok, fail } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { saveUpload } from "@/lib/storage";

export const dynamic = "force-dynamic";

// Only these upload categories are allowed (no client-controlled paths).
const ALLOWED_SUBDIRS = new Set(["items", "labels", "scans", "boxes"]);

// Raster image types only. SVG is intentionally excluded — it can carry script
// and would be a stored-XSS vector when served from /uploads.
const EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

// Identify an image by its magic bytes, not the (spoofable) client content-type.
function sniffImageType(head: Buffer): string | null {
  if (head.length >= 8 && head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47)
    return "image/png";
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  if (head.length >= 6 && head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x38)
    return "image/gif";
  if (
    head.length >= 12 &&
    head.toString("ascii", 0, 4) === "RIFF" &&
    head.toString("ascii", 8, 12) === "WEBP"
  )
    return "image/webp";
  return null;
}

// Shared image-upload endpoint. Other modules (boxes, labels, etc.) call this —
// don't recreate it. Returns { url } pointing at the stored file.
export const POST = route(async (req: Request) => {
  // Any authenticated user may upload (the resulting URL is then attached to an
  // entity the user has permission to edit).
  await requireUser();

  const form = await req.formData();
  const file = form.get("file");

  if (!file || !(file instanceof File)) {
    return fail("No file provided", 422);
  }

  const maxBytes = 10 * 1024 * 1024; // 10 MB
  if (file.size > maxBytes) {
    return fail("File too large (max 10 MB)", 422);
  }

  const subdir = (form.get("subdir") as string) || "items";
  if (!ALLOWED_SUBDIRS.has(subdir)) {
    return fail("Invalid upload category", 422);
  }

  // Validate by content, not by extension/declared type.
  const head = Buffer.from(await file.slice(0, 16).arrayBuffer());
  const contentType = sniffImageType(head);
  if (!contentType || !EXT_BY_TYPE[contentType]) {
    return fail("Only PNG, JPEG, GIF or WebP images are allowed", 422);
  }

  const url = await saveUpload(file, subdir, contentType);
  return ok({ url });
});
