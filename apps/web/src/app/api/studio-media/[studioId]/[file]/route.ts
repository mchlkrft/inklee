import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase/service";
import { publicMapEnabled } from "@/lib/map-features";
import { getClientIp } from "@/lib/get-client-ip";
import { checkStudioMediaRateLimit } from "@/lib/ratelimit";
import { studioPageRenderable } from "@inklee/shared/studio-page";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Stable public URLs for a published studio's media (go-live plan S2b).
//
// Why a proxy rather than signed URLs: an indexable page must not reference a
// URL that expires. The `studio-media` bucket stays PRIVATE (no policy
// change, no public copy); this route re-checks the render gate on every
// request, so a studio that unpublishes stops serving its images to new
// requests immediately (already-cached copies expire within the window below).
// If proxy bandwidth ever matters, the alternative is writing a public-bucket
// copy at publish time.

const STUDIO_MEDIA_BUCKET = "studio-media";
// Revocation window, chosen deliberately: unpublishing, an admin hide, or a
// takedown stops NEW fetches immediately (the gate is re-checked per request),
// but an intermediary may keep serving an already-cached image for up to this
// long. Kept to an hour fresh so a delisting is honored the same hour, which
// is the window we are willing to defend on a compliance surface.
const CACHE_HEADER = "public, max-age=300, s-maxage=3600";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ studioId: string; file: string }> },
) {
  // Dark with the rest of the public surface: nothing new is reachable while
  // the flag is off (owners keep viewing their media through signed URLs).
  if (!publicMapEnabled()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const { studioId, file } = await params;
  // Cheap structural rejects BEFORE any database work: Next has already
  // decoded the route params, so `file` is the literal object name. The path
  // is always "{studioId}/{file}"; reject anything that could climb out of
  // the studio's own prefix.
  const decoded = file;
  if (
    !UUID_RE.test(studioId) ||
    !decoded ||
    decoded.includes("/") ||
    decoded.includes("\\") ||
    decoded.includes("..")
  ) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Per-IP ceiling, refuse before work: this route is anonymous, service-role
  // and DB-backed, so it carries the same abuse control as every other public
  // map read (the S1 invariant).
  const { allowed } = await checkStudioMediaRateLimit(
    getClientIp(request.headers),
  );
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { data: studio } = await serviceClient
    .from("studio_profiles")
    .select("id, publication_status")
    .eq("id", studioId)
    .maybeSingle();
  if (!studio) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const { data: location } = await serviceClient
    .from("map_locations")
    .select("claim_status, moderation_status")
    .eq("studio_profile_id", studioId)
    .maybeSingle();
  if (
    !location ||
    !studioPageRenderable({
      claimStatus: location.claim_status as string,
      moderationStatus: location.moderation_status as string,
      publicationStatus: studio.publication_status as string,
    })
  ) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // The object must belong to THIS studio (path prefix) and be a row we know
  // about: the logo or one of its photos. An arbitrary object name in the
  // studio's prefix is refused rather than streamed.
  const path = `${studioId}/${decoded}`;
  const [{ data: logoRow }, { data: photoRow }] = await Promise.all([
    serviceClient
      .from("studio_profiles")
      .select("id")
      .eq("id", studioId)
      .eq("logo_path", path)
      .maybeSingle(),
    serviceClient
      .from("studio_photos")
      .select("id")
      .eq("studio_profile_id", studioId)
      .eq("storage_path", path)
      .maybeSingle(),
  ]);
  if (!logoRow && !photoRow) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data: blob, error } = await serviceClient.storage
    .from(STUDIO_MEDIA_BUCKET)
    .download(path);
  if (error || !blob) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return new NextResponse(blob.stream() as unknown as BodyInit, {
    headers: {
      "Content-Type": blob.type || "image/webp",
      "Cache-Control": CACHE_HEADER,
    },
  });
}
