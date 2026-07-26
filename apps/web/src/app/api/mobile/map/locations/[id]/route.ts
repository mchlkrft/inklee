import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { getMapLocationDetail } from "@/lib/server/map-location-detail";
import type { MobileMapLocationDetailResponse } from "@inklee/shared/mobile-api";
import { mapMobileGate } from "../../_lib";

export const runtime = "nodejs";

// Native twin of GET /api/map/locations/[id]: the ONE detail read-model
// (approved rows only, fail closed), including the viewer's watched flag.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = mapMobileGate();
  if (gate) return gate;
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);

  const { id } = await params;
  const detail = await getMapLocationDetail(id, auth.userId);
  if (!detail) {
    return mobileError(404, "This place is not on the map.", "not_found");
  }
  return mobileOk({ detail } satisfies MobileMapLocationDetailResponse);
}
