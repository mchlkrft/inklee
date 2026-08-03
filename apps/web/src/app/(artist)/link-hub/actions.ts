"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  parseBioPageSettings,
  type BioPageSettings,
} from "@/lib/bio-page-settings";
import {
  gateMediaBlocksForSave,
  preserveGoodsDestinationOnSave,
} from "@inklee/shared/bio-page";
import { getAccountOverrides } from "@/lib/entitlements-server";
import { richContentBlocksAllowed } from "@/lib/server/entitlement-gates";
import { readImageFromForm } from "@/lib/mobile-image";
import { fetchImageForImport } from "@/lib/server/gallery-url-import";
import { removeDroppedHubImages } from "@/lib/server/hub-images";
import { checkGalleryImportRateLimit } from "@/lib/ratelimit";
import {
  requireGalleryEntitlement,
  galleryAtCapacity,
  uploadProcessedGalleryFile,
  MAX_HOSTED_GALLERY_IMAGES,
  type GalleryUploadResult,
} from "@/lib/server/hub-gallery-upload";
import { updateProfileSettings } from "@/lib/server/profile-settings";
import { recordGalleryRightsAttestation } from "@/lib/server/gallery-rights-attestation";
import {
  GALLERY_RIGHTS_ATTESTATION_FIELD,
  GALLERY_RIGHTS_ATTESTATION_REQUIRED_ERROR,
  isGalleryRightsAttested,
} from "@inklee/shared/gallery-rights-attestation";

export type { GalleryUploadResult };

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

  // slug is read separately — display-freshness only (revalidatePath below),
  // not part of the settings merge this module protects.
  const { data: profile } = await supabase
    .from("profiles")
    .select("slug")
    .eq("id", user.id)
    .maybeSingle();

  let priorBlocks: BioPageSettings["blocks"] = [];
  let finalBio: BioPageSettings | null = null;
  let droppedBlocks = 0;
  let droppedSocials = 0;
  let droppedMedia = 0;

  const result = await updateProfileSettings(
    supabase,
    user.id,
    async (currentSettings) => {
      const currentBio = parseBioPageSettings(currentSettings.bio_page);
      priorBlocks = currentBio.blocks;

      // The Link Hub editor owns only blocks + socials. Spread the current
      // bio_page first so bookingPolicy + module visibility (`hidden`) —
      // edited on /bookings/settings — are preserved untouched. Round-trip
      // through the shared parser so every field is validated + sanitized
      // in one place.
      const parsed: BioPageSettings = parseBioPageSettings({
        ...currentBio,
        blocks: blocksInput.value,
        socials: socialsInput.value,
      });

      // FD8 WIRE-SAFETY: an old client that predates the goods block's
      // destination field must not reset an artist's existing explicit
      // choice merely by resaving an unrelated field (e.g. reordering a
      // link). See preserveGoodsDestinationOnSave's own comment for the
      // full reasoning.
      const goodsSafeBlocks = preserveGoodsDestinationOnSave(
        blocksInput.value,
        parsed.blocks,
        currentBio.blocks,
      );

      // SAVE-PATH ENTITLEMENT GATE (image_gallery is a Plus rich block). The
      // parser keeps gallery blocks regardless of plan; the write is
      // refused here for an artist without rich_content_blocks (founder
      // ruling FD1, 2026-08-01, SUPERSEDES the earlier appearance_custom
      // gate), so a Free artist cannot persist a NEW or CHANGED gallery. An
      // existing unchanged one is kept (decision D2: downgrade hides, never
      // deletes). Mirrors the render gate (hub/page.tsx richBlocksAllowed).
      // Fail-safe to unentitled on a plan-read blip: refuse new Plus
      // content rather than over-grant.
      let entitled = false;
      try {
        entitled = richContentBlocksAllowed(await getAccountOverrides(user.id));
      } catch {
        entitled = false;
      }
      const gated = gateMediaBlocksForSave(
        goodsSafeBlocks,
        currentBio.blocks,
        entitled,
      );
      const bioPage: BioPageSettings = { ...parsed, blocks: gated.blocks };

      droppedBlocks = inputBlockCount - parsed.blocks.length;
      droppedSocials = inputSocialCount - bioPage.socials.length;
      droppedMedia = gated.droppedMedia;
      finalBio = bioPage;

      return { ...currentSettings, bio_page: bioPage };
    },
    { updated_at: new Date().toISOString() },
  );

  if (!result.ok) return { error: result.error };
  // `merge` always runs before updateProfileSettings resolves `ok: true`, so
  // finalBio is always assigned on this branch.
  const settings = finalBio!;

  // Orphan cleanup AFTER the write won (row-first, object-second): hosted
  // gallery objects whose URLs were dropped by this save are removed;
  // external URLs and anything outside this artist's hub namespace are
  // re-validated away inside the helper. Best-effort, never fails the save.
  await removeDroppedHubImages(user.id, priorBlocks, settings.blocks);

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
  if (droppedMedia > 0) {
    const g = `${droppedMedia} gallery block${droppedMedia === 1 ? "" : "s"} skipped: image galleries are a Plus feature.`;
    note = note ? `${note} ${g}` : `Saved. ${g}`;
  }
  return note ? { success: true, settings, note } : { success: true, settings };
}

/**
 * Upload ONE gallery image from a device file (Track B slice B1). Out-of-band
 * from the settings save on purpose: the editor submits blocks as JSON, so
 * files cannot ride that submit; this action stores the image and returns the
 * URL the client writes into the block, which the normal save then persists.
 *
 * GATED BY THE RIGHTS ATTESTATION since LO-5 DPIA §7 R3 (controller sign-off
 * 2026-08-03, activation key `dpia_r3_direct_upload_attestation_built`). §4 R3
 * recorded the gap in these terms: "The URL-import path requires a rights
 * attestation. Direct file upload, which is the NORMAL case, requires
 * nothing." The four properties are mirrored from the import path below,
 * deliberately and in the same order: refused SERVER-SIDE, checked BEFORE the
 * expensive work, evidence written BEFORE the operation, and versioned.
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

  // SERVER-SIDE enforcement: the checkbox is a UI affordance, not the
  // boundary. Checked BEFORE the file is validated and before the capacity
  // read, so an unattested upload costs nothing and reaches no storage.
  if (
    !isGalleryRightsAttested(formData.get(GALLERY_RIGHTS_ATTESTATION_FIELD))
  ) {
    return { ok: false, error: GALLERY_RIGHTS_ATTESTATION_REQUIRED_ERROR };
  }

  const read = readImageFromForm(formData);
  if (!read.ok) return { ok: false, error: read.error };

  if (await galleryAtCapacity(supabase, user.id)) {
    return {
      ok: false,
      error: `You've reached the limit of ${MAX_HOSTED_GALLERY_IMAGES} gallery images. Remove some to add more.`,
    };
  }

  // Evidence BEFORE the operation, failing closed. The import path records the
  // source URL; a device upload has none, so the file's own name and size are
  // what tie the record to the specific image the artist attested for. The
  // stored object path cannot be used: it does not exist until the upload the
  // record has to precede.
  const logged = await recordGalleryRightsAttestation({
    artistId: user.id,
    surface: "web_upload",
    detail: { file_name: read.file.name, byte_size: read.file.size },
  });
  if (!logged.ok) return { ok: false, error: logged.error };

  return uploadProcessedGalleryFile(user.id, read.file);
}

// C1.6 (counsel, docs/legal/counsel-accountant-handoff-2026-08.md Part 4):
// storing our own copy of an artist-supplied URL is a reproduction, which
// makes Inklee a host rather than a mere link — the correct engineering
// choice, but it needs a rights attestation from the artist to keep the
// standard UGC-hosting position. "No attestation = no import."
//
// The version constant that used to live here moved to
// @inklee/shared/gallery-rights-attestation when LO-5 DPIA §7 R3 extended the
// same gate to the two direct-upload paths, and it moved with a v1 -> v2 bump.
// Both changes are deliberate; see that file's header for the reasoning, in
// short: §7 R2 records this attestation as one of three things carrying the
// accepted residual that Inklee cannot verify artist-client consent, and the
// v1 wording asserted copyright only, saying nothing about the person in the
// photograph. Existing v1 rows are untouched and still mean what they said.

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
 * first, before any network fetch on the artist's behalf), plus two this
 * action alone needs: the rights attestation (C1.6) and a rate limit
 * (checkGalleryImportRateLimit), both BEFORE the capacity ceiling and the
 * guarded download, since only THIS path spends Inklee's own egress fetching
 * an artist-supplied, otherwise-arbitrary host on the artist's behalf.
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
  const trimmedUrl = rawUrl.trim();

  // SERVER-SIDE enforcement of the C1.6 attestation: the checkbox is a UI
  // affordance, not the boundary. A client that omits the field (an old
  // build, a hand-crafted request) is refused here regardless of what the
  // form rendered. Only the literal "true" the checked checkbox sends counts;
  // anything else (absent, "false", "on") is treated as not attested.
  if (
    !isGalleryRightsAttested(formData.get(GALLERY_RIGHTS_ATTESTATION_FIELD))
  ) {
    return { ok: false, error: GALLERY_RIGHTS_ATTESTATION_REQUIRED_ERROR };
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

  // Log the attestation BEFORE spending Inklee's own egress fetching the
  // artist's chosen URL: the record documents what the artist confirmed and
  // when, for THIS specific source URL, independent of whether the fetch
  // that follows succeeds. Fails CLOSED (see the shared recorder).
  const logged = await recordGalleryRightsAttestation({
    artistId: user.id,
    surface: "web_url_import",
    detail: { source_url: trimmedUrl },
  });
  if (!logged.ok) return { ok: false, error: logged.error };

  const fetched = await fetchImageForImport(trimmedUrl);
  if (!fetched.ok) return fetched;

  return uploadProcessedGalleryFile(user.id, fetched.file);
}
