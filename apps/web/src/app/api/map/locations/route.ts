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
// One studio per grid cell, so this is a ceiling on the SAMPLE, not a
// truncation of the viewport: every populated cell is represented.
const PIN_LIMIT = 3000;

export type MapLocationsResponse = {
  pins: PublicMapPin[];
  capped: boolean;
  /** Approved studios actually inside the viewport. */
  total: number;
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

  // Zoom drives the sampling grid: a plain LIMIT returned rows in index
  // order, which at country zoom meant the southernmost studios only.
  const zoomParam = Number(url.searchParams.get("zoom"));
  const zoom = Number.isFinite(zoomParam)
    ? Math.min(22, Math.max(0, zoomParam))
    : 3;

  const [{ data, error }, { data: totalInView }] = await Promise.all([
    serviceClient.rpc("map_pins_in_view", {
      p_west: bbox.west,
      p_south: bbox.south,
      p_east: bbox.east,
      p_north: bbox.north,
      p_zoom: zoom,
      p_limit: PIN_LIMIT,
    }),
    serviceClient.rpc("map_pins_in_view_count", {
      p_west: bbox.west,
      p_south: bbox.south,
      p_east: bbox.east,
      p_north: bbox.north,
    }),
  ]);
  if (error) {
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  const all = (data ?? []) as MapLocationRowForPin[];
  // Category filtering stays client-visible but is applied after sampling so
  // the grid keeps its even spread.
  const rows = category ? all.filter((r) => r.category === category) : all;
  // Active temporary signals decorate their pins (the zoomed-in ring, Q7).
  const signals = await activeSignalsByLocation(rows.map((r) => r.id));
  const pins = rows
    .map((row) => toPublicMapPin(row, signals.get(row.id) ?? null))
    .filter((p): p is PublicMapPin => p !== null);
  const total = Number(totalInView ?? pins.length);
  const body: MapLocationsResponse = {
    pins,
    capped: total > pins.length,
    total,
  };
  return NextResponse.json(body);
}
