// Shared image-upload helper for the mobile multipart endpoints
// (/api/mobile/.../image). Mirrors the web Server Actions' sharp pipeline:
// validate → re-encode to webp → upload to the public `logos` bucket via the
// service client. The mobile client compresses on-device (expo-image-picker
// quality) so the body stays under the platform cap; this re-encodes anyway as
// defense in depth and to normalize format/size.

import { guardedSharp } from "@/lib/image-guard";
import { serviceClient } from "@/lib/supabase/service";

// Exported so any OTHER path that produces bytes for this same pipeline (the
// gallery "Import from URL" server-side fetch, FD4, 2026-08-01) enforces the
// identical allowlist and cap rather than restating the numbers.
export const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];
// Kept under Vercel's ~4.5MB serverless body cap (a larger body is rejected by
// the platform before the handler runs). The picker compresses well under this.
export const MAX_UPLOAD_SIZE = 4 * 1024 * 1024; // 4MB

type FileResult =
  | { ok: true; file: File }
  | { ok: false; status: number; error: string };

/** Validate the `image` entry of an ALREADY-PARSED form. Split out of
 *  `readImageFile` so web Server Actions (which receive FormData directly)
 *  share the exact same allowlist and size cap as the mobile routes. */
export function readImageFromForm(form: FormData): FileResult {
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

/** Parse a multipart body ONCE. Split out because a `Request` body can only be
 *  consumed a single time, so a route that needs a sibling field as well as
 *  the file (the gallery upload's rights attestation) cannot call
 *  `readImageFile` and then re-read the form. Callers that only want the file
 *  should keep using `readImageFile`. */
export async function readMultipartForm(
  req: Request,
): Promise<
  { ok: true; form: FormData } | { ok: false; status: number; error: string }
> {
  try {
    return { ok: true, form: await req.formData() };
  } catch {
    return { ok: false, status: 400, error: "Expected an image upload." };
  }
}

/** Pull the `image` file out of a multipart request body + validate it. */
export async function readImageFile(req: Request): Promise<FileResult> {
  const parsed = await readMultipartForm(req);
  if (!parsed.ok) return parsed;
  return readImageFromForm(parsed.form);
}

type UploadResult =
  | { ok: true; url: string }
  | { ok: false; status: number; error: string };

/**
 * Resize + re-encode to webp and upload to `<bucket>/<path>` (default bucket
 * `logos`), returning a URL for the stored object. `fit:"inside"` keeps aspect
 * (flash designs); `cover` crops to a square (logo / product hero). A file
 * sharp can't decode yields a friendly 400, never an unhandled 500.
 *
 * 0151 (LO-5 DPIA R4) added `bucket` / `urlForm` so gallery uploads can land in
 * the PRIVATE `gallery` bucket. Both default to the previous behaviour
 * (`logos`, public URL) so every other caller — covers, logos, flash, goods,
 * Instagram previews — is untouched.
 */
export async function processAndUpload(
  file: File,
  opts: {
    path: string;
    width: number;
    height: number;
    fit?: "cover" | "inside";
    upsert?: boolean;
    /** Default true (fixed-path uploads like cover/logo NEED the ?t= because
     *  replacement overwrites the same object). Pass false for unique-path
     *  uploads (gallery): the path never repeats, and the query string would
     *  otherwise be stored into settings JSON where deep-equality comparisons
     *  (gateMediaBlocksForSave) have to carry it. */
    cacheBust?: boolean;
    /** Storage bucket. Defaults to the PUBLIC `logos` bucket. */
    bucket?: string;
    /** Which URL shape to return. `public` (default) is the world-readable
     *  `/object/public/{bucket}/` form and is only correct for a public
     *  bucket. `authenticated` is the inert `/object/{bucket}/` form, which is
     *  refused without a signature: pass it for a PRIVATE bucket. Calling
     *  `getPublicUrl` on a private bucket would happily return a
     *  well-formed-looking URL that 400s forever, so this is an explicit
     *  choice rather than something inferred. */
    urlForm?: "public" | "authenticated";
  },
): Promise<UploadResult> {
  const bucket = opts.bucket ?? "logos";
  const fit = opts.fit ?? "cover";
  let processed: Buffer;
  try {
    const input = Buffer.from(await file.arrayBuffer());
    // `.rotate()` (no args) applies the EXIF orientation BEFORE the metadata is
    // stripped by re-encoding. Without it, sharp discards the orientation tag
    // without applying it, so portrait phone photos land sideways — latent on
    // the wide cover strip, glaring in a square gallery grid (GB1, 2026-08-01;
    // deliberately global so covers/logos/flash/goods get the fix too).
    processed = await guardedSharp(input)
      .rotate()
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
    .from(bucket)
    .upload(opts.path, processed, {
      contentType: "image/webp",
      upsert: opts.upsert ?? true,
    });
  if (error) {
    return { ok: false, status: 500, error: "Upload failed. Try again." };
  }

  if ((opts.urlForm ?? "public") === "authenticated") {
    // No cache-bust: an authenticated-object URL is never fetched directly, it
    // is only the stable key a signed URL is minted from, and a query string
    // would pollute the settings JSON the save gate deep-compares.
    const base = (
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co"
    ).replace(/\/+$/, "");
    return {
      ok: true,
      url: `${base}/storage/v1/object/${bucket}/${opts.path}`,
    };
  }

  const { data } = serviceClient.storage.from(bucket).getPublicUrl(opts.path);
  return {
    ok: true,
    url:
      (opts.cacheBust ?? true)
        ? `${data.publicUrl}?t=${Date.now()}`
        : data.publicUrl,
  };
}
