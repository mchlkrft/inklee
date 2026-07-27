import { NextResponse } from "next/server";
import {
  getMapLocationDetail,
  getPublicMapLocationDetail,
} from "@/lib/server/map-location-detail";
import {
  resolveMapApiAccess,
  PUBLIC_MAP_CACHE_HEADERS,
  AUTHED_MAP_CACHE_HEADERS,
} from "@/lib/server/map-public-access";

export const runtime = "nodejs";

// Single map-location detail for the in-canvas panel. Dual-plane since
// go-live plan S1: the plane split is decided by the capability object, not an
// ad-hoc user check. The authed plane gets the composed detail (shared payload
// + viewer decoration: watched, ownStudio) exactly as before; the public plane
// gets the viewer-independent shared payload, which STRUCTURALLY cannot carry
// viewer data, so it is safe to shared-cache.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await resolveMapApiAccess(request, "detail");
  if (access.kind === "refused") {
    return access.response;
  }
  const { id } = await params;

  // Headers follow the PLANE (access.kind), never the body branch: an authed
  // response must stay private/no-store even if a future capability shape
  // serves an authed viewer the shared payload (canSeePersonalOverlays=false
  // does not exist today, but the invariant must hold by construction, not by
  // accident of current capability values).
  const headers =
    access.kind === "public"
      ? PUBLIC_MAP_CACHE_HEADERS
      : AUTHED_MAP_CACHE_HEADERS;

  const detail =
    access.kind === "authed" && access.capabilities.canSeePersonalOverlays
      ? await getMapLocationDetail(id, access.userId)
      : await getPublicMapLocationDetail(id);
  if (!detail) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ detail }, { headers });
}
