import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";
import { tattooMapEnabled } from "@/lib/map-features";
import {
  MAP_LOCATION_CATEGORIES,
  parseMapBBox,
  toPublicMapPin,
  type MapLocationCategory,
  type MapLocationRowForPin,
  type PublicMapPin,
} from "@inklee/shared/map-directory";
import { activeSignalsByLocation } from "@/lib/server/studio-signals";

export const runtime = "nodejs";

// Viewport cap: the client is told when it hits this so it can prompt a
// zoom-in instead of silently truncating (marker budget, build plan Phase 2).
const PIN_LIMIT = 500;

export type MapLocationsResponse = {
  pins: PublicMapPin[];
  capped: boolean;
};

// Logged-in artists only (the map is not client-facing, scope section 1);
// reads go through the service client + the tested public shaper, never
// through client-side table access (house RLS rule).
export async function GET(request: Request) {
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

  const url = new URL(request.url);
  const bbox = parseMapBBox({
    west: url.searchParams.get("west"),
    south: url.searchParams.get("south"),
    east: url.searchParams.get("east"),
    north: url.searchParams.get("north"),
  });
  if (!bbox) {
    return NextResponse.json({ error: "invalid_bbox" }, { status: 400 });
  }
  const category = url.searchParams.get("category");
  if (
    category &&
    !MAP_LOCATION_CATEGORIES.includes(category as MapLocationCategory)
  ) {
    return NextResponse.json({ error: "invalid_category" }, { status: 400 });
  }

  let query = serviceClient
    .from("map_locations")
    .select(
      "id, name, category, display_latitude, display_longitude, city, country, claim_status, moderation_status",
    )
    .eq("moderation_status", "approved")
    .gte("display_latitude", bbox.south)
    .lte("display_latitude", bbox.north)
    .gte("display_longitude", bbox.west)
    .lte("display_longitude", bbox.east)
    .limit(PIN_LIMIT);
  if (category) query = query.eq("category", category);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  const rows = (data ?? []) as MapLocationRowForPin[];
  // Active temporary signals decorate their pins (the zoomed-in ring, Q7).
  const signals = await activeSignalsByLocation(rows.map((r) => r.id));
  const pins = rows
    .map((row) => toPublicMapPin(row, signals.get(row.id) ?? null))
    .filter((p): p is PublicMapPin => p !== null);
  const body: MapLocationsResponse = {
    pins,
    capped: rows.length >= PIN_LIMIT,
  };
  return NextResponse.json(body);
}
