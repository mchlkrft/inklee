import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import type { MobileMapWatchedResponse } from "@inklee/shared/mobile-api";
import { mapMobileGate } from "../_lib";

export const runtime = "nodejs";

// The viewer's watched map-location ids (the personal plane; own-row RLS via
// the authed client). Feeds the watched filter + list badges on the native map.
export async function GET(req: Request) {
  const gate = mapMobileGate();
  if (gate) return gate;
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);

  const { data, error } = await auth.supabase
    .from("watched_studios")
    .select("map_location_id")
    .eq("artist_user_id", auth.userId);
  if (error) return mobileError(500, "Could not load your watched list.");

  const ids = (data ?? []).map((r) => r.map_location_id as string);
  return mobileOk({ ids } satisfies MobileMapWatchedResponse);
}
