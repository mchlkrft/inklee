"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  parseBioPageSettings,
  type BioPageSettings,
} from "@/lib/bio-page-settings";
import {
  gateMediaBlocksForSave,
  MAX_BLOCKS_PER_TYPE,
  MAX_GALLERY_IMAGES,
} from "@inklee/shared/bio-page";
import { getAccountOverrides } from "@/lib/entitlements-server";
import { richContentBlocksAllowed } from "@/lib/server/entitlement-gates";
import { readImageFromForm, processAndUpload } from "@/lib/mobile-image";
import { fetchImageForImport } from "@/lib/server/gallery-url-import";
import { removeDroppedHubImages } from "@/lib/server/hub-images";
import { checkGalleryImportRateLimit } from "@/lib/ratelimit";

type State =
  | { error: string }
  | { success: true; note?: string; settings: BioPageSettings }
  | null;

function readJsonArray(
  formData: FormData,
  key: string,
): { value: unknown[]; error?: string } {
  const raw = formData.get(key);
  if (typeof raw !== "string" || !raw.trim()) return { value: [] };
  try {
    const parsed = JSON.parse(raw);
    return { value: Array.isArray(parsed) ? parsed : [] };
  } catch {
    return { value: [], error: `Could not read the ${key}. Try again.` };
  }
}

export async function saveBioPageAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const blocksInput = readJsonArray(formData, "blocks");
  if (blocksInput.error) return { error: blocksInput.error };
  const socialsInput = readJsonArray(formData, "socials");
  if (socialsInput.error) return { error: socialsInput.error };

  const inputBlockCount = blocksInput.value.length;
  const inputSocialCount = socialsInput.value.length;

  const { data: profile } = await supabase
    .from("profiles")
    .select("slug, settings")
    .eq("id", user.id)
    .single();

  const currentSettings = (profile?.settings ?? {}) as Record<string, unknown>;
  const currentBio = parseBioPageSettings(currentSettings.bio_page);

  // The Link Hub editor owns only blocks + socials. Spread the current bio_page
  // first so bookingPolicy + module visibility (`hidden`) — edited on
  // /bookings/settings — are preserved untouched. Round-trip through the shared
  // parser so every field is validated + sanitized in one place.
  const parsed: BioPageSettings = parseBioPageSettings({
    ...currentBio,
    blocks: blocksInput.value,
    socials: socialsInput.value,
  });

  // SAVE-PATH ENTITLEMENT GATE (image_gallery is a Plus rich block). The parser
  // keeps gallery blocks regardless of plan; the write is refused here for an
  // artist without rich_content_blocks (founder ruling FD1, 2026-08-01,
  // SUPERSEDES the earlier appearance_custom gate), so a Free artist cannot
  // persist a NEW or CHANGED gallery. An existing unchanged one is kept
  // (decision D2: downgrade hides, never deletes). Mirrors the render gate
  // (hub/page.tsx richBlocksAllowed). Fail-safe to unentitled on a plan-read
  // blip: refuse new Plus content rather than over-grant.
  let entitled = false;
  try {
    entitled = richContentBlocksAllowed(await getAccountOverrides(user.id));
  } catch {
    entitled = false;
  }
  const gated = gateMediaBlocksForSave(
    parsed.blocks,
    currentBio.blocks,
    entitled,
  );
  const settings: BioPageSettings = { ...parsed, blocks: gated.blocks };

  const droppedBlocks = inputBlockCount - parsed.blocks.length;
  const droppedSocials = inputSocialCount - settings.socials.length;

  const { error } = await supabase
    .from("profiles")
    .update({
      settings: { ...currentSettings, bio_page: settings },
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) return { error: error.message };

  // Orphan cleanup AFTER the write won (row-first, object-second): hosted
  // gallery objects whose URLs were dropped by this save are removed;
  // external URLs and anything outside this artist's hub namespace are
  // re-validated away inside the helper. Best-effort, never fails the save.
  await removeDroppedHubImages(user.id, currentBio.blocks, settings.blocks);

  revalidatePath("/link-hub");
  if (profile?.slug) revalidatePath(`/${profile.slug}/hub`);

  // Report anything the parser sanitized away (empty headline/text, unsafe link
  // URL, deduped/invalid social) so an item doesn't vanish with only "Saved.".
  const parts: string[] = [];
  if (droppedBlocks > 0) {
    parts.push(`${droppedBlocks} item${droppedBlocks === 1 ? "" : "s"}`);
  }
  if (droppedSocials > 0) {
    parts.push(`${droppedSocials} social${droppedSocials === 1 ? "" : "s"}`);
  }
  let note: string | undefined;
  if (parts.length > 0) {
    note = `Saved. ${parts.join(" and ")} skipped (empty, invalid, or past the limit of 10).`;
  }
  if (gated.droppedMedia > 0) {
    const g = `${gated.droppedMedia} gallery block${gated.droppedMedia === 1 ? "" : "s"} skipped: image galleries are a Plus feature.`;
    note = note ? `${note} ${g}` : `Saved. ${g}`;
  }
  return note ? { success: true, settings, note } : { success: true, settings };
}

export type GalleryUploadResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

/** The hosted-image ceiling: every gallery block full (H6). Derived from the
 *  shared caps, never a magic number, so a cap change moves this with it. */
const MAX_HOSTED_GALLERY_IMAGES = MAX_BLOCKS_PER_TYPE * MAX_GALLERY_IMAGES;

/** ENTITLEMENT FIRST (H4), shared by BOTH ways a gallery image enters storage
 *  (direct upload and "Import from URL", FD4): the save path gates gallery
 *  blocks, so an unentitled write would only produce an orphaned storage
 *  object — refuse before touching storage OR making an outbound fetch on the
 *  artist's behalf. Fail-safe to unentitled on a plan-read blip. */
async function requireGalleryEntitlement(userId: string): Promise<boolean> {
  try {
    return richContentBlocksAllowed(await getAccountOverrides(userId));
  } catch {
    return false;
  }
}

/** The stored-image CEILING, counted server-side from the SAVED settings
 *  (H6), shared by both write paths: the per-block cap of 12 lives in the
 *  parser, but an unsaved block is invisible here, so the enforceable server
 *  bound is the total across all saved gallery blocks. Checked BEFORE the
 *  (possibly network) work of processing or importing a new image. */
async function galleryAtCapacity(
  supabase: Awaited<ReturnType<typeof createClient>>,
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
 *  pipeline every gallery image goes through, direct upload or import alike.
 *  Unique path per upload (`{uid}/hub/{uuid}.webp`, upsert:false, no
 *  cache-bust — the path never repeats and a query string would pollute the
 *  settings JSON the save-gate deep-compares). */
async function uploadProcessedGalleryFile(
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
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, url: result.url };
}

/**
 * Upload ONE gallery image from a device file (Track B slice B1). Out-of-band
 * from the settings save on purpose: the editor submits blocks as JSON, so
 * files cannot ride that submit; this action stores the image and returns the
 * URL the client writes into the block, which the normal save then persists.
 */
export async function uploadGalleryImageAction(
  formData: FormData,
): Promise<GalleryUploadResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  if (!(await requireGalleryEntitlement(user.id))) {
    return { ok: false, error: "Image galleries are a Plus feature." };
  }

  const read = readImageFromForm(formData);
  if (!read.ok) return { ok: false, error: read.error };

  if (await galleryAtCapacity(supabase, user.id)) {
    return {
      ok: false,
      error: `You've reached the limit of ${MAX_HOSTED_GALLERY_IMAGES} gallery images. Remove some to add more.`,
    };
  }

  return uploadProcessedGalleryFile(user.id, read.file);
}

/**
 * Import ONE gallery image from a URL (founder ruling FD4, 2026-08-01,
 * SUPERSEDES GB2): replaces the removed permanent free-text URL field.
 * Downloads the artist-supplied URL SERVER-SIDE under the SSRF guard
 * (gallery-url-import.ts), then re-encodes and stores it through the SAME
 * pipeline as a direct upload (`uploadProcessedGalleryFile`) — the stored
 * gallery image is always Inklee-hosted either way, which is what makes the
 * FD1 parser restriction (`sanitizeHostedGalleryImageUrl`, bio-page.ts) safe
 * to enforce strictly.
 *
 * Same ordering as the direct upload for the shared checks (entitlement
 * first, before any network fetch on the artist's behalf), plus one this
 * action alone needs: a rate limit (checkGalleryImportRateLimit) BEFORE the
 * capacity ceiling and the guarded download, since only THIS path spends
 * Inklee's own egress fetching an artist-supplied, otherwise-arbitrary host.
 */
export async function importGalleryImageFromUrlAction(
  formData: FormData,
): Promise<GalleryUploadResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  if (!(await requireGalleryEntitlement(user.id))) {
    return { ok: false, error: "Image galleries are a Plus feature." };
  }

  const rawUrl = formData.get("url");
  if (typeof rawUrl !== "string" || !rawUrl.trim()) {
    return { ok: false, error: "Enter an image URL." };
  }

  // Rate limit BEFORE the ceiling read and the outbound fetch: unlike a
  // direct upload, this action spends Inklee's own egress fetching an
  // artist-supplied, otherwise-arbitrary URL (FD4, founder ruling 2026-08-01).
  const limit = await checkGalleryImportRateLimit(user.id);
  if (!limit.allowed) {
    return {
      ok: false,
      error: "Too many attempts. Please wait a moment and try again.",
    };
  }

  if (await galleryAtCapacity(supabase, user.id)) {
    return {
      ok: false,
      error: `You've reached the limit of ${MAX_HOSTED_GALLERY_IMAGES} gallery images. Remove some to add more.`,
    };
  }

  const fetched = await fetchImageForImport(rawUrl.trim());
  if (!fetched.ok) return fetched;

  return uploadProcessedGalleryFile(user.id, fetched.file);
}
