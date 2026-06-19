import { guardedSharp } from "@/lib/image-guard";
import { serviceClient } from "@/lib/supabase/service";

const MAX_DIMENSION = 1200;
const WEBP_QUALITY = 82;
const FETCH_TIMEOUT_MS = 8000;

/**
 * Download an Instagram CDN thumbnail, transcode to WebP, and store it in
 * the public `logos` bucket. Returns the storage path on success, null on
 * any failure (network, fetch error, sharp error, upload error).
 *
 * Soft-failing is intentional: one bad post must not break a 50-post sync.
 * The caller stores the returned path (or null) in `instagram_posts.preview_image_path`.
 *
 * Path convention: `{artistId}/instagram/{instagramMediaId}.webp`. Using the
 * stable Instagram media id means resyncs upsert the same object — no
 * orphan cleanup needed.
 */
export async function downloadInstagramThumbnail(
  sourceUrl: string,
  artistId: string,
  instagramMediaId: string,
): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(sourceUrl, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;

    const buffer = Buffer.from(await res.arrayBuffer());
    const processed = await guardedSharp(buffer)
      .rotate()
      .resize(MAX_DIMENSION, MAX_DIMENSION, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: WEBP_QUALITY, effort: 3 })
      .toBuffer();

    const path = `${artistId}/instagram/${instagramMediaId}.webp`;
    const { error } = await serviceClient.storage
      .from("logos")
      .upload(path, processed, {
        contentType: "image/webp",
        upsert: true,
      });
    if (error) return null;

    return path;
  } catch {
    return null;
  }
}
