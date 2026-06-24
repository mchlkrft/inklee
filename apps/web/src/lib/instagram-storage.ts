import { guardedSharp } from "@/lib/image-guard";
import { serviceClient } from "@/lib/supabase/service";

const MAX_DIMENSION = 1200;
const WEBP_QUALITY = 82;
const FETCH_TIMEOUT_MS = 8000;
// SSRF-01: only fetch over https from the Instagram/Facebook CDN, with a hard
// byte cap, so a coerced/replaced media_url can't make the server fetch
// internal infrastructure or a huge payload with its service credentials.
const ALLOWED_HOST_SUFFIXES = [".cdninstagram.com", ".fbcdn.net"];
const MAX_BYTES = 12 * 1024 * 1024;

function isAllowedInstagramMediaUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  return ALLOWED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

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
  if (!isAllowedInstagramMediaUrl(sourceUrl)) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    // redirect:"error" so a redirect to an internal host can't bypass the
    // host allowlist (Instagram CDN URLs are direct, signed links).
    const res = await fetch(sourceUrl, {
      signal: controller.signal,
      redirect: "error",
    });
    clearTimeout(timer);
    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) return null;
    const declaredLength = Number(res.headers.get("content-length") ?? "");
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BYTES) {
      return null;
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength > MAX_BYTES) return null;
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
