/**
 * Browser-side image compression for the public booking form.
 *
 * Vercel Hobby has a hard ~4.5 MB request body cap that overrides the
 * Next.js `serverActions.bodySizeLimit` setting. Mobile photos easily
 * land at 2–5 MB each, so 2–3 attached references blow past the cap.
 * We compress in the browser before submission: the server still does
 * its own sharp() pass to enforce final dimensions and produce the
 * canonical WebP, but the upload stays well under the platform limit.
 *
 * Annotation coordinates are stored as 0–1 normalized ratios
 * (see lib/annotations.ts), so resizing the image does not displace pins.
 */

const MAX_DIMENSION = 1600;
const QUALITY = 0.82;
const SKIP_BELOW_BYTES = 500 * 1024;

export async function compressImageInBrowser(file: File): Promise<File> {
  // Already small enough to fit comfortably under the platform cap. Skip the
  // canvas round-trip — preserves original quality and avoids re-encoding
  // PNGs to WebP unnecessarily.
  if (file.size < SKIP_BELOW_BYTES) return file;

  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const ratio = Math.min(
      MAX_DIMENSION / img.naturalWidth,
      MAX_DIMENSION / img.naturalHeight,
      1,
    );
    const targetWidth = Math.round(img.naturalWidth * ratio);
    const targetHeight = Math.round(img.naturalHeight * ratio);

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", QUALITY),
    );
    if (!blob) return file;

    // If the round-trip somehow produced a larger file (rare with low-detail
    // images already encoded efficiently), keep the original.
    if (blob.size >= file.size) return file;

    const newName = file.name.replace(/\.[^.]+$/, ".webp");
    return new File([blob], newName, { type: "image/webp" });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const ALLOWED_IMAGE_UPLOAD_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
];

// Stay safely under Vercel's ~4.5 MB serverless request-body cap. An upload
// over the cap is rejected by the platform before the server action runs,
// which surfaces as an unhandled 500 / blank error page rather than anything
// the form can explain. We compress first, then guard against the rare case
// where even the compressed result is still too big.
export const MAX_IMAGE_UPLOAD_BYTES = 4 * 1024 * 1024;

export type PreparedImage = { file: File } | { error: string };

/**
 * Validate and shrink an image the user picked, in the browser, before it ever
 * reaches a server action. Rejects HEIC and non-image types with a friendly
 * message; compresses large images so they fit under the platform body cap.
 * Returns the processed file or a human-readable error. Every image upload
 * surface should funnel through this so a bad pick never black-screens.
 */
export async function prepareImageUpload(file: File): Promise<PreparedImage> {
  const name = file.name.toLowerCase();
  const isHeic =
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    name.endsWith(".heic") ||
    name.endsWith(".heif");
  if (isHeic) {
    return {
      error:
        "iPhone HEIC photos aren't supported. Choose a JPG or PNG (a screenshot of the photo works too).",
    };
  }
  if (!ALLOWED_IMAGE_UPLOAD_TYPES.includes(file.type)) {
    return {
      error: "That file isn't supported. Choose a PNG, JPG, or WebP image.",
    };
  }

  let processed = file;
  try {
    processed = await compressImageInBrowser(file);
  } catch {
    return {
      error: "Could not read that image. Try a different file or format.",
    };
  }

  if (processed.size > MAX_IMAGE_UPLOAD_BYTES) {
    const mb = (processed.size / 1024 / 1024).toFixed(1);
    return {
      error: `That image is ${mb} MB, too large even after compressing. Try a smaller one.`,
    };
  }
  return { file: processed };
}

/** Replace a file input's selected file with a (compressed) one so the form
 *  submits the processed file. DataTransfer is supported on every browser we
 *  target (Safari/iOS 15.6+). */
export function applyFileToInput(input: HTMLInputElement, file: File): void {
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = src;
  });
}
