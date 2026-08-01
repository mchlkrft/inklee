import "server-only";
import { isPublicHostname } from "@/lib/server/ssrf-guard";
import { ALLOWED_TYPES, MAX_UPLOAD_SIZE } from "@/lib/mobile-image";

// Gallery "Import from URL" (founder ruling FD4, 2026-08-01, SUPERSEDES GB2):
// the permanent free-text image-URL field is REMOVED from the gallery
// editor. In its place, this downloads an artist-supplied URL SERVER-SIDE,
// under the SSRF guard (ssrf-guard.ts) plus the SAME format/size allowlist
// the direct-upload path already enforces (mobile-image.ts), and hands back
// a `File` so the caller can feed it straight into the EXISTING
// `processAndUpload` sharp pipeline — one re-encode path for every way an
// image reaches the `logos` bucket, direct upload or import alike. This is
// what makes the FD1 parser restriction (gallery images must be
// Inklee-hosted) safe to enforce strictly: after this ships, there is no
// other way for a gallery image to exist than through this pipeline or the
// direct upload, both of which always write to Inklee's own storage.

const FETCH_TIMEOUT_MS = 8000;

export type ImportedImage =
  | { ok: true; file: File }
  | { ok: false; error: string };

/** Download `rawUrl` under strict guards and return it as a `File` ready for
 *  `processAndUpload`. Never throws; every failure returns a distinct,
 *  artist-readable reason rather than a generic "something went wrong". */
export async function fetchImageForImport(
  rawUrl: string,
): Promise<ImportedImage> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, error: "That doesn't look like a valid URL." };
  }
  // https-only: the stored image always ends up on Inklee's own https
  // storage regardless, so restricting the SOURCE fetch to https costs
  // nothing real while ruling out plaintext-http SSRF targets outright
  // (mirrors instagram-storage.ts's downloadInstagramThumbnail).
  if (parsed.protocol !== "https:") {
    return { ok: false, error: "Only https:// image URLs can be imported." };
  }
  if (!(await isPublicHostname(parsed.hostname))) {
    return { ok: false, error: "That URL can't be reached." };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    // redirect:"error" so a redirect to an internal host can't bypass the
    // hostname check above — there is no second hop to re-validate.
    res = await fetch(parsed.toString(), {
      signal: controller.signal,
      redirect: "error",
    });
  } catch {
    return { ok: false, error: "Could not reach that URL." };
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    return { ok: false, error: "That URL did not return an image." };
  }

  const contentType = (res.headers.get("content-type") ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (!ALLOWED_TYPES.includes(contentType)) {
    return { ok: false, error: "Image must be PNG, JPG, or WebP." };
  }
  // Declared length is an early, cheap rejection ONLY — a server can omit or
  // lie about Content-Length (understate it, or not send one at all), so it
  // can never be the real enforcement. The loop below counts actual bytes as
  // they arrive and aborts mid-stream, which is what makes the cap hold
  // against a body that is huge and never claims to be.
  const declaredLength = Number(res.headers.get("content-length") ?? "");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_UPLOAD_SIZE) {
    return { ok: false, error: "Image is too large (max 4 MB)." };
  }

  if (!res.body) {
    return { ok: false, error: "Could not read that image." };
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      // Abort DURING the stream, before buffering another byte, the moment
      // the running total crosses the cap — never wait for `done` first. A
      // malicious or misconfigured server can send an unbounded body with no
      // (or a false, small) Content-Length; only counting bytes as they
      // arrive stops this before the response is ever fully buffered.
      if (total > MAX_UPLOAD_SIZE) {
        await reader.cancel();
        return { ok: false, error: "Image is too large (max 4 MB)." };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, error: "Could not read that image." };
  }
  if (total === 0) {
    return { ok: false, error: "That URL returned an empty file." };
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const filename = parsed.pathname.split("/").pop() || "import";
  const file = new File([bytes], filename, { type: contentType });
  return { ok: true, file };
}
