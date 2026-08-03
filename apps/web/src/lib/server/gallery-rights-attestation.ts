import "server-only";
import * as Sentry from "@sentry/nextjs";
import { serviceClient } from "@/lib/supabase/service";
import {
  GALLERY_RIGHTS_ATTESTATION_CONSENT_TYPE,
  GALLERY_RIGHTS_ATTESTATION_LOG_FAILED_ERROR,
  GALLERY_RIGHTS_ATTESTATION_VERSION,
  type GalleryAttestationSurface,
} from "@inklee/shared/gallery-rights-attestation";

/**
 * Write the rights-attestation evidence row, shared by all three gallery
 * ingest paths (LO-5 DPIA §7 R3, key
 * `dpia_r3_direct_upload_attestation_built`).
 *
 * CALL THIS BEFORE THE OPERATION, NEVER AFTER. The URL-import path established
 * the ordering and the reason: the record documents what the artist confirmed
 * and when, independently of whether the work that follows succeeds. Writing
 * it afterwards would mean a crash mid-upload leaves a hosted object with no
 * evidence behind it, which is precisely the state R3 exists to prevent.
 *
 * FAILS CLOSED. A caller MUST refuse the add when this returns `ok: false`.
 * "We hosted the image but could not prove they attested" is not an outcome
 * worth falling through to, and a permissive default on a failed write is the
 * exact defect class this repository removed across nine findings on
 * 2026-08-02. The function therefore returns a refusal rather than throwing or
 * resolving to a bare boolean a caller could accidentally ignore.
 *
 * Append-only, service-role write: RLS on `billing_consent_records` grants no
 * authenticated policy, so every consent write in this codebase goes through
 * `serviceClient` (see withdrawal.ts).
 */
export async function recordGalleryRightsAttestation(params: {
  artistId: string;
  surface: GalleryAttestationSurface;
  /** Surface-specific evidence merged into the consent row's `context`, e.g.
   *  the source URL for an import. Must not carry image bytes. */
  detail?: Record<string, unknown>;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { artistId, surface, detail } = params;
  const { error } = await serviceClient.from("billing_consent_records").insert({
    artist_id: artistId,
    consent_type: GALLERY_RIGHTS_ATTESTATION_CONSENT_TYPE,
    consent_version: GALLERY_RIGHTS_ATTESTATION_VERSION,
    consented_at: new Date().toISOString(),
    context: { surface, ...detail },
  });
  if (error) {
    Sentry.captureException(error, {
      tags: { action: "gallery_rights_attestation_log" },
      extra: { artistId, surface },
    });
    return { ok: false, error: GALLERY_RIGHTS_ATTESTATION_LOG_FAILED_ERROR };
  }
  return { ok: true };
}
