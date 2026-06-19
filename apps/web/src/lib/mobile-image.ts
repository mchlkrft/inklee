// Shared image-upload helper for the mobile multipart endpoints
// (/api/mobile/.../image). Mirrors the web Server Actions' sharp pipeline:
// validate → re-encode to webp → upload to the public `logos` bucket via the
// service client. The mobile client compresses on-device (expo-image-picker
// quality) so the body stays under the platform cap; this re-encodes anyway as
// defense in depth and to normalize format/size.

import { guardedSharp } from "@/lib/image-guard";
import { serviceClient } from "@/lib/supabase/service";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];
// Kept under Vercel's ~4.5MB serverless body cap (a larger body is rejected by
// the platform before the handler runs). The picker compresses well under this.
const MAX_UPLOAD_SIZE = 4 * 1024 * 1024; // 4MB

type FileResult =
  | { ok: true; file: File }
  | { ok: false; status: number; error: string };

/** Pull the `image` file out of a multipart request body + validate it. */
export async function readImageFile(req: Request): Promise<FileResult> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return { ok: false, status: 400, error: "Expected an image upload." };
  }
  const file = form.get("image");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, status: 400, error: "No image provided." };
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return {
      ok: false,
      status: 400,
      error: "Image must be PNG, JPG, or WebP.",
    };
  }
  if (file.size > MAX_UPLOAD_SIZE) {
    return { ok: false, status: 400, error: "Image is too large (max 4 MB)." };
  }
  return { ok: true, file };
}

type UploadResult =
  | { ok: true; url: string }
  | { ok: false; status: number; error: string };

/**
 * Resize + re-encode to webp and upload to `logos/<path>`, returning a public,
 * cache-busted URL. `fit:"inside"` keeps aspect (flash designs); `cover` crops to
 * a square (logo / product hero). A file sharp can't decode yields a friendly
 * 400, never an unhandled 500.
 */
export async function processAndUpload(
  file: File,
  opts: {
    path: string;
    width: number;
    height: number;
    fit?: "cover" | "inside";
    upsert?: boolean;
  },
): Promise<UploadResult> {
  const fit = opts.fit ?? "cover";
  let processed: Buffer;
  try {
    const input = Buffer.from(await file.arrayBuffer());
    processed = await guardedSharp(input)
      .resize(opts.width, opts.height, {
        fit,
        position: "centre",
        withoutEnlargement: fit === "inside",
      })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    return {
      ok: false,
      status: 400,
      error: "Could not process that image. Try a different file.",
    };
  }

  const { error } = await serviceClient.storage
    .from("logos")
    .upload(opts.path, processed, {
      contentType: "image/webp",
      upsert: opts.upsert ?? true,
    });
  if (error) {
    return { ok: false, status: 500, error: "Upload failed. Try again." };
  }

  const { data } = serviceClient.storage.from("logos").getPublicUrl(opts.path);
  return { ok: true, url: `${data.publicUrl}?t=${Date.now()}` };
}
