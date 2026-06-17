import { route, ok, fail } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { saveUpload } from "@/lib/storage";

export const dynamic = "force-dynamic";

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
  if (file.type && !file.type.startsWith("image/")) {
    return fail("Only image files are allowed", 422);
  }

  const subdir = (form.get("subdir") as string) || "items";
  const url = await saveUpload(file, subdir);
  return ok({ url });
});
