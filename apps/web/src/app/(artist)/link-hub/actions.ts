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
import { appearanceCustomAllowed } from "@/lib/server/entitlement-gates";
import { readImageFromForm, processAndUpload } from "@/lib/mobile-image";
import { removeDroppedHubImages } from "@/lib/server/hub-images";

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
  // artist without appearance_custom, so a Free artist cannot persist a NEW or
  // CHANGED gallery. An existing unchanged one is kept (decision D2: downgrade
  // hides, never deletes). Mirrors the render gate (hub/page.tsx richBlocksAllowed).
  // Fail-safe to unentitled on a plan-read blip: refuse new Plus content rather
  // than over-grant.
  let entitled = false;
  try {
    entitled = appearanceCustomAllowed(await getAccountOverrides(user.id));
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

/**
 * Upload ONE gallery image (Track B slice B1). Out-of-band from the settings
 * save on purpose: the editor submits blocks as JSON, so files cannot ride that
 * submit; this action stores the image and returns the URL the client writes
 * into the block, which the normal save then persists.
 *
 * ENTITLEMENT FIRST (H4): the save path gates gallery blocks, so an unentitled
 * upload would only produce an orphaned storage object — refuse before touching
 * storage. The stored-image CEILING is counted server-side from the SAVED
 * settings (H6): the per-block cap of 12 lives in the parser, but an unsaved
 * block is invisible here, so the enforceable server bound is the total across
 * all saved gallery blocks. Unique path per upload (`{uid}/hub/{uuid}.webp`,
 * upsert:false, no cache-bust — the path never repeats and a query string
 * would pollute the settings JSON the save-gate deep-compares).
 */
export async function uploadGalleryImageAction(
  formData: FormData,
): Promise<GalleryUploadResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  // Fail-safe to unentitled on a plan-read blip: refuse new Plus content
  // rather than over-grant (same posture as the save gate).
  let entitled = false;
  try {
    entitled = appearanceCustomAllowed(await getAccountOverrides(user.id));
  } catch {
    entitled = false;
  }
  if (!entitled) {
    return { ok: false, error: "Image galleries are a Plus feature." };
  }

  const read = readImageFromForm(formData);
  if (!read.ok) return { ok: false, error: read.error };

  // Ceiling check against SAVED galleries.
  const { data: profile } = await supabase
    .from("profiles")
    .select("settings")
    .eq("id", user.id)
    .single();
  const bio = parseBioPageSettings(
    ((profile?.settings ?? {}) as Record<string, unknown>).bio_page,
  );
  const storedImages = bio.blocks.reduce(
    (sum, b) => sum + (b.type === "image_gallery" ? b.images.length : 0),
    0,
  );
  if (storedImages >= MAX_HOSTED_GALLERY_IMAGES) {
    return {
      ok: false,
      error: `You've reached the limit of ${MAX_HOSTED_GALLERY_IMAGES} gallery images. Remove some to add more.`,
    };
  }

  const result = await processAndUpload(read.file, {
    path: `${user.id}/hub/${crypto.randomUUID()}.webp`,
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
