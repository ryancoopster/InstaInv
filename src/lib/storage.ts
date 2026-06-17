import "server-only";
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

// Pluggable file storage. Local disk by default; swap STORAGE_DRIVER=s3 for prod.
// Returns a public URL/path that can be stored on Item.imageUrl etc.

const UPLOAD_DIR = process.env.UPLOAD_DIR || "public/uploads";

function randomName(ext: string) {
  return crypto.randomBytes(12).toString("hex") + (ext ? `.${ext.replace(/^\./, "")}` : "");
}

export async function saveUpload(file: File, subdir = ""): Promise<string> {
  const driver = process.env.STORAGE_DRIVER || "local";
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  const filename = randomName(ext);

  if (driver === "s3") {
    // Placeholder: wire @aws-sdk/client-s3 here in production.
    throw new Error("S3 storage not configured. Set STORAGE_DRIVER=local or implement S3 in lib/storage.ts.");
  }

  const relDir = path.join(UPLOAD_DIR, subdir);
  await fs.mkdir(relDir, { recursive: true });
  await fs.writeFile(path.join(relDir, filename), buffer);

  // public/uploads/foo.png is served at /uploads/foo.png
  const publicPath = path.join(UPLOAD_DIR.replace(/^public\/?/, ""), subdir, filename);
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
