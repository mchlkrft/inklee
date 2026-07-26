import { serviceClient } from "@/lib/supabase/service";
import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { submitGuestSpotRequestCore } from "@/lib/server/guest-spots";
import type { GuestSpotRequestInput } from "@inklee/shared/guest-spots";
import type { MobileGuestSpotRequestResult } from "@inklee/shared/mobile-api";
import { mapMobileGate } from "../../../_lib";

export const runtime = "nodejs";

// Guest-spot request from a map pin: resolve the APPROVED location to its
// studio profile, then the SAME core the web /map/[id]/request form submits
// (which re-validates input, published+accepting, own-studio, the one-open-
// request rule, and the daily rate limit).
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = mapMobileGate();
  if (gate) return gate;
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);

  const { id } = await params;
  const { data: location } = await serviceClient
    .from("map_locations")
    .select("id, studio_profile_id")
    .eq("id", id)
    .eq("moderation_status", "approved")
    .maybeSingle();
  const studioProfileId = location?.studio_profile_id as string | null;
  if (!studioProfileId) {
    return mobileError(404, "This place is not taking requests.", "not_found");
  }

  let body: Partial<GuestSpotRequestInput>;
  try {
    body = (await req.json()) as Partial<GuestSpotRequestInput>;
  } catch {
    return mobileError(400, "Invalid request body.");
  }
  const input: GuestSpotRequestInput = {
    startDate: String(body.startDate ?? ""),
    endDate: String(body.endDate ?? body.startDate ?? ""),
    dateFlexibility: String(
      body.dateFlexibility ?? "exact",
    ) as GuestSpotRequestInput["dateFlexibility"],
    socialLink: String(body.socialLink ?? ""),
    introduction: String(body.introduction ?? ""),
    expectedClients: body.expectedClients ? String(body.expectedClients) : null,
    equipmentNeeds: body.equipmentNeeds ? String(body.equipmentNeeds) : null,
  };

  const result = await submitGuestSpotRequestCore(
    auth.userId,
    studioProfileId,
    input,
  );
  if (result.error || !result.requestId) {
    return mobileError(400, result.error ?? "Could not send the request.");
  }
  return mobileOk({
    requestId: result.requestId,
  } satisfies MobileGuestSpotRequestResult);
}
