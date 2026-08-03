// The gallery rights attestation, shared by every surface that can put an
// image into an artist's hosted gallery: the web direct upload, the web
// "Import from URL", and the native device upload.
//
// WHY THIS FILE EXISTS (LO-5 DPIA §7, controller sign-off 2026-08-03).
//
// §4 R3 recorded the defect this closes: "The URL-import path requires a
// rights attestation. Direct file upload, which is the NORMAL case, requires
// nothing." Counsel's Q15 answer and an independent cross-check reached that
// from different directions, which is why the controller treated it as
// settled. The §7 disposition is "Direct-upload attestation at parity with
// URL import (Q15). Precondition of the gallery gate", tracked as the
// activation key `dpia_r3_direct_upload_attestation_built`.
//
// It is ONE module rather than a copy per surface because the founder's
// one-source-of-truth rule applies with unusual force here: what the artist
// asserted is legal evidence, and three call sites drifting apart would mean
// three different assertions recorded under one name.
//
// WHAT THE TEXT ASSERTS, AND WHY IT SAYS THIS AND NOT MORE.
//
// §7 R2 leans on this attestation directly: it is one of three things (with
// the artist-Terms clause and the R1 takedown route) carrying the ACCEPTED
// residual that "Inklee cannot verify artist-client consent." So the text has
// to actually cover the depicted person, not only copyright, or the residual
// it is recorded as carrying is carried by nothing.
//
// It is deliberately phrased as what the ARTIST asserts. Inklee records the
// assertion; it does not and cannot verify it, and the DPIA says so in terms.
// Nothing here should be read, or reworded, to imply we checked.

/** Multipart/form field carrying the attestation on every surface. */
export const GALLERY_RIGHTS_ATTESTATION_FIELD = "rightsAttestation";

/**
 * Versioned like every other discrete consent (WITHDRAWAL_ACK_VERSION), so a
 * future change to the copy is a new, distinguishable version rather than a
 * silent reinterpretation of evidence already collected.
 *
 * v1 -> v2 is a REAL widening, not a re-issue of the same promise. v1 read
 * "I confirm I have the right to use this image on my page": a rights-only
 * claim that says nothing about the person in the photograph. v2 adds the
 * depicted-person limb that §7 R2 requires. Because it is a new version, v1
 * records keep meaning exactly what they meant when they were written, which
 * is the entire point of versioning this.
 */
export const GALLERY_RIGHTS_ATTESTATION_VERSION =
  "gallery-rights-attestation-v2";

/** Rendered verbatim by every surface. The string IS the evidence: the UI must
 *  not paraphrase it, because the consent record stores only the version. */
export const GALLERY_RIGHTS_ATTESTATION_TEXT =
  "I have the right to publish this image, and anyone identifiable in it has agreed to it being shown on my public page.";

/** Shown when the server refuses an unattested add. Deliberately identical on
 *  all three surfaces: same gate, same refusal. */
export const GALLERY_RIGHTS_ATTESTATION_REQUIRED_ERROR =
  "Confirm you have the rights and consent for this image before adding it.";

/** Shown when the evidence cannot be durably written. The add is refused, not
 *  allowed through: see `recordGalleryRightsAttestation`. */
export const GALLERY_RIGHTS_ATTESTATION_LOG_FAILED_ERROR =
  "Could not record your confirmation. Please try again.";

/** `consent_type` written to `billing_consent_records`. Unchanged across v1
 *  and v2 on purpose: it names the KIND of consent, and the version column is
 *  what distinguishes the wording. */
export const GALLERY_RIGHTS_ATTESTATION_CONSENT_TYPE =
  "gallery_image_rights_attestation";

/** Which surface produced the record. Stored in the consent row's `context`
 *  so a later reader can tell a device upload from a URL import without
 *  inferring it from the presence of `source_url`. */
export type GalleryAttestationSurface =
  | "web_upload"
  | "web_url_import"
  | "native_upload";

/**
 * The ONE comparison every surface uses.
 *
 * Strict equality with the literal "true", never truthiness. A checkbox
 * submitted by a raw HTML form sends "on"; a client that sets the field to
 * "false" is stating the artist did NOT tick it. Both must refuse, and both
 * would pass a `Boolean(raw)` test, which is why this is a named function
 * with its own tests rather than an inline coercion at three call sites.
 */
export function isGalleryRightsAttested(raw: unknown): boolean {
  return raw === "true";
}
