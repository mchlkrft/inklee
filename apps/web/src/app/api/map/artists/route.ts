import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";
import { tattooMapEnabled } from "@/lib/map-features";
import {
  MIN_ANON_ARTIST_COUNT,
  aggregateArtistCities,
  type ArtistPresenceRow,
  type PublicArtistCity,
} from "@inklee/shared/map-directory";

export const runtime = "nodejs";

export type MapArtistsResponse = {
  cities: PublicArtistCity[];
};

// City-level artists-in-town aggregates (Phase 2 slice 2). Consent-gated
// (only map_visibility != 'off' rows are ever read), floored at
// MIN_ANON_ARTIST_COUNT per city (Q13), and the named list respects account
// blocks in both directions. City count is small, so no viewport filtering:
// one response covers the map and the client slices by view.
export async function GET() {
  if (!tattooMapEnabled()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [
    { data: presenceData, error },
    { data: blockData, error: blockError },
  ] = await Promise.all([
    serviceClient
      .from("profiles")
      .select(
        "id, display_name, slug, map_visibility, looking_for_guest_spots, map_city_label, map_city_place_id, map_city_lat, map_city_lng",
      )
      .in("map_visibility", ["city_only", "listed"])
      .eq("account_status", "active")
      .not("map_city_lat", "is", null)
      // Explicit ceiling: PostgREST caps at 1000 silently otherwise, which
      // would make city counts nondeterministically undercount at scale.
      .limit(10000),
    // Blocks in BOTH directions hide names (never counts): rows where the
    // viewer blocked someone, and rows where someone blocked the viewer.
    serviceClient
      .from("account_blocks")
      .select("blocker_user_id, blocked_user_id")
      .or(`blocker_user_id.eq.${user.id},blocked_user_id.eq.${user.id}`),
  ]);
  // Fail CLOSED on both: a failed block query must never leak names the
  // viewer blocked (or that blocked the viewer).
  if (error || blockError) {
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  const excludedIds = new Set<string>();
  for (const b of blockData ?? []) {
    if (b.blocker_user_id === user.id)
      excludedIds.add(b.blocked_user_id as string);
    if (b.blocked_user_id === user.id)
      excludedIds.add(b.blocker_user_id as string);
  }

  const cities = aggregateArtistCities(
    (presenceData ?? []) as ArtistPresenceRow[],
    { floor: MIN_ANON_ARTIST_COUNT, excludedIds },
  );
  const body: MapArtistsResponse = { cities };
  return NextResponse.json(body);
}
