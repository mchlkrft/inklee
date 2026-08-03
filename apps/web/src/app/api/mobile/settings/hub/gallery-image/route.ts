import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { readMultipartForm, readImageFromForm } from "@/lib/mobile-image";
import {
  requireGalleryEntitlement,
  galleryAtCapacity,
  uploadProcessedGalleryFile,
  MAX_HOSTED_GALLERY_IMAGES,
} from "@/lib/server/hub-gallery-upload";
import { recordGalleryRightsAttestation } from "@/lib/server/gallery-rights-attestation";
import {
  GALLERY_RIGHTS_ATTESTATION_FIELD,
  GALLERY_RIGHTS_ATTESTATION_REQUIRED_ERROR,
  isGalleryRightsAttested,
} from "@inklee/shared/gallery-rights-attestation";
import type { MobileImageUpload } from "@inklee/shared/mobile-api";

export const runtime = "nodejs";

// POST /api/mobile/settings/hub/gallery-image (multipart: image) — upload ONE
// gallery image from the native device picker (founder ruling FD2,
// 2026-08-01, "native gallery editing ships BEFORE publication", SUPERSEDES
// D4's web-only-editing-v1 deferral).
//
// Out-of-band from the hub settings save, exactly like the web
// `uploadGalleryImageAction` (link-hub/actions.ts): this route only stores
// the file and returns the hosted URL. The client appends that URL to the
// block's `images` array in local editor state, and the normal
// `POST /api/mobile/settings/hub` persists it — which is also where
// `removeDroppedHubImages` sweeps a hosted object when an image is later
// dropped from a block. There is deliberately no separate delete endpoint
// here, mirroring the web editor: removal is a local state edit, and Save is
// what persists it and triggers cleanup.
//
// Same gates, same order, as the web action, via the SHARED
// hub-gallery-upload helpers so neither surface can drift: entitlement first
// (H4, before touching storage — a native client is not a trust boundary),
// then the LO-5 DPIA §7 R3 rights attestation, then the server-side
// hosted-image ceiling (H6, counted from SAVED settings), then the re-encode
// + unique-path upload (H7).
//
// THE ATTESTATION IS ENFORCED HERE TOO, and that is the point rather than a
// detail. §7 R3's key (`dpia_r3_direct_upload_attestation_built`) is about
// direct upload being the normal, ungated path; a web-only fix would leave
// the native device picker as an unattested route to the same hosted object,
// which is worse than no fix because it LOOKS complete.
//
// Two honest divergences from the web action, neither of them optional:
//
// 1. The flag cannot be checked before the body is parsed, because it travels
//    in the SAME multipart body as the file. It is still checked before every
//    expensive step (file validation, the capacity read, sharp, storage), so
//    the property that matters (nothing is spent on an unattested request) is
//    preserved even though the literal statement ordering cannot be.
// 2. An installed build that does not send the field is REFUSED, not
//    grandfathered. That is a deliberate wire break and it is safe today only
//    because the gallery capability has never been granted to anyone (LO-5
//    DPIA §10, verified rather than assumed), so no build in the field can
//    reach this route's entitlement check. It needs a fresh EAS build before
//    the capability is granted to a first artist. Failing open for old
//    clients was the alternative and it is exactly the defect class this gate
//    exists to close.
//
// "Import from URL"
// (FD4) is NOT ported here: FD2's required native scope is device upload,
// deletion, reordering, captions, visibility, entitlement/downgrade states,
// progress, retry, unsupported-file handling, empty states, and safe
// render — it does not list a native import-from-URL affordance, and the web
// import path spends Inklee's own egress under an SSRF guard + rate limit
// that would need its own native scope decision, not a mechanical port.
export async function POST(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  if (!(await requireGalleryEntitlement(userId))) {
    return mobileError(
      403,
      "Image galleries are a Plus feature.",
      "not_entitled",
    );
  }

  const parsed = await readMultipartForm(req);
  if (!parsed.ok) return mobileError(parsed.status, parsed.error);

  // SERVER-SIDE, before the file is even validated: a native client is not a
  // trust boundary, so the checkbox in GalleryBlockEditor is an affordance and
  // this is the gate. Strict "true" only, via the shared comparison.
  if (
    !isGalleryRightsAttested(parsed.form.get(GALLERY_RIGHTS_ATTESTATION_FIELD))
  ) {
    return mobileError(
      400,
      GALLERY_RIGHTS_ATTESTATION_REQUIRED_ERROR,
      "attestation_required",
    );
  }

  const read = readImageFromForm(parsed.form);
  if (!read.ok) return mobileError(read.status, read.error);

  if (await galleryAtCapacity(supabase, userId)) {
    return mobileError(
      400,
      `You've reached the limit of ${MAX_HOSTED_GALLERY_IMAGES} gallery images. Remove some to add more.`,
      "cap_reached",
    );
  }

  // Evidence BEFORE the upload, failing closed, exactly as on web.
  const logged = await recordGalleryRightsAttestation({
    artistId: userId,
    surface: "native_upload",
    detail: { file_name: read.file.name, byte_size: read.file.size },
  });
  if (!logged.ok)
    return mobileError(500, logged.error, "attestation_log_failed");

  const result = await uploadProcessedGalleryFile(userId, read.file);
  if (!result.ok) return mobileError(result.status ?? 500, result.error);

  // 0151 (LO-5 DPIA R4): `url` is the inert private-bucket URL that gets
  // STORED; `signedUrl` is the short-lived signature the editor renders and
  // never saves back. Additive, so an older app build ignores it.
  const body: MobileImageUpload = {
    url: result.url,
    signedUrl: result.signedUrl,
  };
  return mobileOk(body);
}
