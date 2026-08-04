import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import { HOSTED_GALLERY_PRIVATE_MARKER } from "@inklee/shared/bio-page";

/**
 * Signed expiring URLs for gallery objects (LO-5 DPIA R4, counsel Q18,
 * migration 0151).
 *
 * DPIA §4 R4, verbatim: "Unguessable URLs are not access control. Counsel
 * named this directly. Gallery objects sit at public URLs; signed expiring
 * URLs are dated and not built." The controller's §7 made building this a
 * precondition of the gallery activation gate
 * (`dpia_r4_signed_gallery_urls_built`, dpia-gate-preconditions.ts).
 *
 * THE SHAPE, AND WHY. Gallery objects live in the PRIVATE `gallery` bucket
 * with zero storage policies. They are not fetchable at all without a
 * signature. A signed URL layered over an object that remains public would be
 * theatre: the unsigned URL keeps working, so the signature would grant
 * nothing and withhold nothing. That is why 0151 creates a bucket rather than
 * this module simply wrapping the old public URL.
 *
 * WHAT IS STORED vs WHAT IS SERVED. A gallery block persists the INERT
 * authenticated-object URL (`/storage/v1/object/gallery/{uid}/hub/{uuid}.webp`,
 * `HOSTED_GALLERY_PRIVATE_MARKER`). A GET against that with no credentials is
 * refused. Viewable URLs are minted here per render and never written back:
 * persisting one would store a bearer token in the settings JSON and leave a
 * dead image when it expired. `sanitizeHostedGalleryImageUrl` refuses to store
 * a `/object/sign/` URL for exactly that reason, so an editor round trip
 * cannot accidentally do it.
 */

/** The private live-gallery bucket (migration 0151). Distinct from
 *  `gallery-archive` (0144), which holds a DOWNGRADED artist's objects. Both
 *  are private with zero policies; the split is about lifecycle state, not
 *  about reachability, because after 0151 neither is reachable unsigned. */
export const GALLERY_LIVE_BUCKET = "gallery";

/**
 * How long a minted gallery URL stays valid: 15 minutes.
 *
 * The number is a trade between two failure modes, both real:
 *
 * TOO SHORT breaks legitimate viewing. Gallery images render through
 * `next/image` with `fill`, which is lazy by default, so a visitor who opens a
 * Hub page and scrolls to the gallery some minutes later fetches the image
 * long after the HTML was produced. An expiry shorter than a plausible
 * read-then-scroll gap produces broken images on a public page, which is a
 * user-visible defect masquerading as security.
 *
 * TOO LONG weakens the control. A signed URL is a bearer token: within its
 * window it works for anyone holding it, with no account and no re-check.
 * Everything that leaks a URL (browser history, a referrer header, a pasted
 * link, a screenshot of the address bar, an intermediary log) leaks a working
 * fetch for the remainder of the window.
 *
 * 15 minutes covers the lazy-load gap with room to spare while keeping the
 * leak window to a quarter hour. The closest in-repo precedent is booking
 * reference media (`signProjectMedia`, projects.ts) at 10 minutes, which is
 * the same category of subject (photographs of identifiable skin) but renders
 * in a private artist dashboard rather than on a public page that a stranger
 * may scroll slowly; the 60-minute precedents (`studio-media`,
 * `welcome-pack-files`) are ordinary business media and are not the right
 * analogue here.
 *
 * RESIDUAL, stated rather than hidden: expiry bounds the leak window, it does
 * not eliminate it, and it does not recall bytes already fetched into a
 * browser or CDN image cache. Nothing at this layer can. What it does buy is
 * the difference between a URL that works for fifteen minutes and one that
 * works forever, which is precisely the gap counsel named.
 */
export const GALLERY_SIGNED_URL_TTL_SECONDS = 900;

function storageBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    // Fail loud. A missing base URL must not silently produce a relative or
    // half-formed URL that some surface then renders or, worse, stores.
    throw new Error(
      "gallery-signed-urls: NEXT_PUBLIC_SUPABASE_URL is not set; cannot build a gallery object URL.",
    );
  }
  return url.replace(/\/+$/, "");
}

/** The canonical, INERT URL persisted for a gallery object at `path`
 *  (`{uid}/hub/{uuid}.webp`). Unsigned and deliberately unfetchable: this is
 *  what goes into the settings JSON, and it is refused by Storage until this
 *  module signs it. */
export function galleryObjectUrl(path: string): string {
  return `${storageBaseUrl()}${HOSTED_GALLERY_PRIVATE_MARKER}${path}`;
}

/** The storage path inside `GALLERY_LIVE_BUCKET` for a canonical gallery URL,
 *  or null for anything else. Deliberately does NOT accept a `/object/public/`
 *  or `/object/sign/` URL, matching `sanitizeHostedGalleryImageUrl`. Ownership
 *  is a separate question answered by `ownedHubImagePath` (hub-images.ts);
 *  this only parses. */
export function galleryObjectPathFromUrl(url: string): string | null {
  const idx = url.indexOf(HOSTED_GALLERY_PRIVATE_MARKER);
  if (idx < 0) return null;
  const tail = url.slice(idx + HOSTED_GALLERY_PRIVATE_MARKER.length);
  const path = tail.split("?")[0];
  return path || null;
}

/**
 * The images a render surface may actually show: exactly those with a signed
 * URL, paired with it.
 *
 * Extracted from `HubImageGalleryBlock` so the rule is testable. This project's
 * vitest include is `src/**\/*.test.ts` and does not run `.tsx`, so a decision
 * left inline in the component would be untested — and the decision here is
 * the one that keeps the whole control honest: an image WITHOUT a signature is
 * dropped, never rendered from its stored `url`. That fallback is the single
 * most likely way this feature quietly reverts to serving unsigned URLs, so it
 * is a named function with a test rather than a `??` buried in JSX.
 */
export function renderableGalleryImages<T extends { url: string }>(
  images: readonly T[],
  signedUrls: ReadonlyMap<string, string>,
): { image: T; src: string }[] {
  const out: { image: T; src: string }[] = [];
  for (const image of images) {
    const src = signedUrls.get(image.url);
    if (src) out.push({ image, src });
  }
  return out;
}

/**
 * Mint short-lived signed URLs for canonical gallery URLs, keyed by the
 * canonical URL the caller passed in. ONE batched storage call regardless of
 * how many images the page has (a gallery can hold up to
 * MAX_BLOCKS_PER_TYPE * MAX_GALLERY_IMAGES = 120 objects, so per-image signing
 * would be a real cost on a public page).
 *
 * FAILS LOUD (house rule, and the defect class removed across nine findings on
 * 2026-08-02): a storage error THROWS. It does not return an empty map that a
 * caller could mistake for "this artist has no images", and above all it never
 * falls back to any unsigned or public URL. The caller decides what a render
 * without images looks like; this function never decides that a failure means
 * "show it anyway".
 *
 * A URL that is not a canonical gallery URL is skipped rather than signed:
 * there is no path to sign, and guessing one would be how a foreign URL gets
 * laundered into a signed Inklee URL.
 */
export async function signGalleryImageUrls(
  urls: readonly string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const pathByUrl = new Map<string, string>();
  for (const url of urls) {
    const path = galleryObjectPathFromUrl(url);
    if (path) pathByUrl.set(url, path);
  }
  if (pathByUrl.size === 0) return out;

  // R6 Q3 (counsel §6.4; DSA procedure §2b/§4): interim disable. Drop any
  // gallery URL that has an OPEN "image of me without consent" report so it is
  // not rendered while a moderation decision is pending; it returns to the
  // signable set if the report is dismissed, and a founded report proceeds to
  // the object-deleting takedown. FAIL-CLOSED, like the storage step below: a
  // query error THROWS rather than risk rendering a reported image (the caller
  // already treats a throw as "show no gallery images", never an unsigned one).
  // The category value matches report-categories.ts ('image_without_consent').
  const candidateUrls = [...pathByUrl.keys()];
  const { data: openReports, error: reportError } = await serviceClient
    .from("content_reports")
    .select("url")
    .eq("category", "image_without_consent")
    .in("status", ["new", "reviewed"])
    .in("url", candidateUrls);
  if (reportError) {
    throw new Error(
      `signGalleryImageUrls: could not check content_reports for interim suppression: ${reportError.message}`,
    );
  }
  for (const row of openReports ?? []) {
    pathByUrl.delete((row as { url: string }).url);
  }
  if (pathByUrl.size === 0) return out;

  const paths = [...new Set(pathByUrl.values())];
  const { data, error } = await serviceClient.storage
    .from(GALLERY_LIVE_BUCKET)
    .createSignedUrls(paths, GALLERY_SIGNED_URL_TTL_SECONDS);

  if (error || !data) {
    throw new Error(
      `signGalleryImageUrls: could not sign ${paths.length} gallery object(s): ${
        error?.message ?? "no data returned"
      }`,
    );
  }

  const signedByPath = new Map<string, string>();
  for (const row of data) {
    // Storage reports per-row failures in `row.error` while the call as a
    // whole succeeds (a deleted or relocated object). Such a row is simply
    // absent from the result, so the caller renders nothing for it rather than
    // rendering a broken or unsigned src.
    if (row.path && row.signedUrl && !row.error) {
      signedByPath.set(row.path, row.signedUrl);
    }
  }
  for (const [url, path] of pathByUrl) {
    const signed = signedByPath.get(path);
    if (signed) out.set(url, signed);
  }
  return out;
}
