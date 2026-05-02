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

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = src;
  });
}
