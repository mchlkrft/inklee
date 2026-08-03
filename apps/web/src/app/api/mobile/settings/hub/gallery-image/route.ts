import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { readImageFile } from "@/lib/mobile-image";
import {
  requireGalleryEntitlement,
  galleryAtCapacity,
  uploadProcessedGalleryFile,
  MAX_HOSTED_GALLERY_IMAGES,
} from "@/lib/server/hub-gallery-upload";
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
// Same three gates, same order, as the web action, via the SHARED
// hub-gallery-upload helpers so neither surface can drift: entitlement first
// (H4, before touching storage — a native client is not a trust boundary),
// then the server-side hosted-image ceiling (H6, counted from SAVED
// settings), then the re-encode + unique-path upload (H7). "Import from URL"
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

  const read = await readImageFile(req);
  if (!read.ok) return mobileError(read.status, read.error);

  if (await galleryAtCapacity(supabase, userId)) {
    return mobileError(
      400,
      `You've reached the limit of ${MAX_HOSTED_GALLERY_IMAGES} gallery images. Remove some to add more.`,
      "cap_reached",
    );
  }

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
