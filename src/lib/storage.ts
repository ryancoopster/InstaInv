import "server-only";
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

// Pluggable file storage. Local disk by default; swap STORAGE_DRIVER=s3 for prod.
// Returns a public URL/path that can be stored on Item.imageUrl etc.

const UPLOAD_DIR = process.env.UPLOAD_DIR || "public/uploads";

// Extension is derived from the validated content type, never the client
// filename — so a crafted filename can't inject path separators or odd suffixes.
const EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

function randomName(ext: string) {
  const clean = ext.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return crypto.randomBytes(12).toString("hex") + (clean ? `.${clean}` : "");
}

export async function saveUpload(file: File, subdir = "", contentType?: string): Promise<string> {
  const driver = process.env.STORAGE_DRIVER || "local";
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  // SEC-6: derive the extension strictly from a known image content type. No
  // "bin" fallback — throw on an unknown/absent type so no present or future
  // caller can write a non-image (e.g. .html/.svg) extension into the public
  // static dir, which would be a same-origin stored-XSS vector under /uploads.
  const ext = contentType ? EXT_BY_TYPE[contentType] : undefined;
  if (!ext) throw new Error("Unsupported content type");
  const filename = randomName(ext);

  if (driver === "s3") {
    // Placeholder: wire @aws-sdk/client-s3 here in production.
    throw new Error("S3 storage not configured. Set STORAGE_DRIVER=local or implement S3 in lib/storage.ts.");
  }

  // Defense in depth against path traversal: sanitize the subdir and confirm the
  // resolved directory stays inside UPLOAD_DIR before writing.
  const safeSub = subdir.replace(/[^a-z0-9_-]/gi, "");
  const relDir = path.join(UPLOAD_DIR, safeSub);
  const root = path.resolve(UPLOAD_DIR);
  const resolvedDir = path.resolve(relDir);
  if (resolvedDir !== root && !resolvedDir.startsWith(root + path.sep)) {
    throw new Error("Invalid upload path");
  }

  await fs.mkdir(resolvedDir, { recursive: true });
  await fs.writeFile(path.join(resolvedDir, filename), buffer);

  // public/uploads/foo.png is served at /uploads/foo.png
  const publicPath = path.join(UPLOAD_DIR.replace(/^public\/?/, ""), safeSub, filename);
  return "/" + publicPath.split(path.sep).join("/");
}

export async function deleteUpload(publicUrl: string | null | undefined): Promise<void> {
  if (!publicUrl || !publicUrl.startsWith("/uploads/")) return;
  const driver = process.env.STORAGE_DRIVER || "local";
  if (driver !== "local") return;
  const rel = path.join("public", publicUrl.replace(/^\//, ""));
  try {
    await fs.unlink(rel);
  } catch {
    /* already gone */
  }
}
