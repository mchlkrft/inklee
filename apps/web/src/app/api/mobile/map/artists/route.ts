import { serviceClient } from "@/lib/supabase/service";
import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import {
  aggregateArtistCities,
  MIN_ANON_ARTIST_COUNT,
  type ArtistPresenceRow,
} from "@inklee/shared/map-directory";
import type { MobileMapArtistsResponse } from "@inklee/shared/mobile-api";
import { mapMobileGate } from "../_lib";

export const runtime = "nodejs";

// Native twin of GET /api/map/artists: consent-gated, floored city aggregation
// with block filtering in both directions. Fails CLOSED on either read error.
export async function GET(req: Request) {
  const gate = mapMobileGate();
  if (gate) return gate;
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);

  const [profilesRes, blocksRes] = await Promise.all([
    serviceClient
      .from("profiles")
      .select(
        "id, display_name, slug, map_visibility, looking_for_guest_spots, map_city_label, map_city_place_id, map_city_lat, map_city_lng",
      )
      .in("map_visibility", ["city_only", "listed"])
      .eq("account_status", "active")
      .not("map_city_lat", "is", null)
      .limit(10000),
    serviceClient
      .from("account_blocks")
      .select("blocker_user_id, blocked_user_id")
      .or(
        `blocker_user_id.eq.${auth.userId},blocked_user_id.eq.${auth.userId}`,
      ),
  ]);
  if (profilesRes.error || blocksRes.error) {
    return mobileError(500, "Could not load artists.", "query_failed");
  }

  const excludedIds = new Set<string>();
  for (const b of blocksRes.data ?? []) {
    const blocker = b.blocker_user_id as string;
    const blocked = b.blocked_user_id as string;
    excludedIds.add(blocker === auth.userId ? blocked : blocker);
  }

  const cities = aggregateArtistCities(
    (profilesRes.data ?? []) as ArtistPresenceRow[],
    { floor: MIN_ANON_ARTIST_COUNT, excludedIds },
  );
  return mobileOk({ cities } satisfies MobileMapArtistsResponse);
}
