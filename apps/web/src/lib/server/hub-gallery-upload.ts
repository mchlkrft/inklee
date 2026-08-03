import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseBioPageSettings } from "@/lib/bio-page-settings";
import {
  MAX_BLOCKS_PER_TYPE,
  MAX_GALLERY_IMAGES,
} from "@inklee/shared/bio-page";
import { getAccountOverrides } from "@/lib/entitlements-server";
import { richContentBlocksAllowed } from "@/lib/server/entitlement-gates";
import { processAndUpload } from "@/lib/mobile-image";
import {
  GALLERY_LIVE_BUCKET,
  signGalleryImageUrls,
} from "@/lib/server/gallery-signed-urls";

// Gallery-upload gates shared by BOTH surfaces that store a gallery image
// (Track B slice B2 web direct upload; FD2, 2026-08-01, native direct upload).
// Lifted out of link-hub/actions.ts so the web Server Action and the native
// mobile route call the IDENTICAL entitlement-first / ceiling / unique-path
// logic rather than two copies that could drift — a native client is not a
// trust boundary, so this is where the boundary actually lives.

export type GalleryUploadResult =
  | {
      ok: true;
      /** The canonical, INERT authenticated-object URL. This is what gets
       *  stored in the block, and it is deliberately not fetchable. */
      url: string;
      /** A short-lived SIGNED URL for showing the image the artist just
       *  uploaded, before any reload has had a chance to sign it. Display
       *  only, never stored. Absent if signing failed, in which case the
       *  thumbnail is blank until the editor reloads: an upload that
       *  physically succeeded must not be reported as a failure, and there is
       *  no unsigned URL to fall back to by design. */
      signedUrl?: string;
    }
  | { ok: false; error: string; status?: number };

/** The hosted-image ceiling: every gallery block full (H6). Derived from the
 *  shared caps, never a magic number, so a cap change moves this with it. */
export const MAX_HOSTED_GALLERY_IMAGES =
  MAX_BLOCKS_PER_TYPE * MAX_GALLERY_IMAGES;

/** ENTITLEMENT FIRST (H4), shared by every way a gallery image enters storage
 *  (web direct upload, web "Import from URL", native direct upload): the save
 *  path gates gallery blocks, so an unentitled write would only produce an
 *  orphaned storage object — refuse before touching storage. Fail-safe to
 *  unentitled on a plan-read blip. */
export async function requireGalleryEntitlement(
  userId: string,
): Promise<boolean> {
  try {
    return richContentBlocksAllowed(await getAccountOverrides(userId));
  } catch {
    return false;
  }
}

/** The stored-image CEILING, counted server-side from the SAVED settings
 *  (H6), shared by every write path: the per-block cap of 12 lives in the
 *  parser, but an unsaved block is invisible here, so the enforceable server
 *  bound is the total across all saved gallery blocks. Checked BEFORE the
 *  (possibly network) work of processing a new image. */
export async function galleryAtCapacity(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("settings")
    .eq("id", userId)
    .single();
  const bio = parseBioPageSettings(
    ((profile?.settings ?? {}) as Record<string, unknown>).bio_page,
  );
  const storedImages = bio.blocks.reduce(
    (sum, b) => sum + (b.type === "image_gallery" ? b.images.length : 0),
    0,
  );
  return storedImages >= MAX_HOSTED_GALLERY_IMAGES;
}

/** Re-encode + upload an already-validated file through the ONE sharp
 *  pipeline every gallery image goes through, web or native alike. Unique
 *  path per upload (`{uid}/hub/{uuid}.webp`, upsert:false, no cache-bust — the
 *  path never repeats and a query string would pollute the settings JSON the
 *  save-gate deep-compares). `status` on failure carries processAndUpload's
 *  own status (400 bad file, 500 storage failure) so an HTTP caller (the
 *  mobile route) can use it directly; the web Server Action ignores it.
 *
 *  0151 (LO-5 DPIA R4, counsel Q18): the destination is the PRIVATE `gallery`
 *  bucket and the returned URL is the inert authenticated-object form, which
 *  is refused by Storage without a signature. This is the single choke point
 *  every gallery image passes through (web upload, web URL import, native
 *  upload), so there is no second path by which an image could still land in a
 *  public bucket. */
export async function uploadProcessedGalleryFile(
  userId: string,
  file: File,
): Promise<GalleryUploadResult> {
  const result = await processAndUpload(file, {
    path: `${userId}/hub/${crypto.randomUUID()}.webp`,
    width: 1600,
    height: 1600,
    // `inside`, never `cover`: the renderer crops with object-cover itself, and
    // server-side cropping would destroy pixels the carousel layout wants.
    fit: "inside",
    upsert: false,
    cacheBust: false,
    bucket: GALLERY_LIVE_BUCKET,
    urlForm: "authenticated",
  });
  if (!result.ok)
    return { ok: false, error: result.error, status: result.status };

  let signedUrl: string | undefined;
  try {
    signedUrl = (await signGalleryImageUrls([result.url])).get(result.url);
  } catch {
    // Swallowed on purpose, and this is the ONE place in this feature where
    // that is right: the bytes are already stored and the canonical URL below
    // is correct, so failing the action would tell the artist their upload
    // failed when it did not. The cost is a blank thumbnail until reload. No
    // unsigned URL is substituted.
    signedUrl = undefined;
  }
  return { ok: true, url: result.url, signedUrl };
}
