import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase/service";
import { mapPinsV2Enabled } from "@/lib/map-features";
import {
  MAP_LOCATION_CATEGORIES,
  parseMapBBox,
  toPublicMapPin,
  type MapLocationCategory,
  type MapLocationRowForPin,
  type PublicMapPin,
} from "@inklee/shared/map-directory";
import { activeSignalsByLocation } from "@/lib/server/studio-signals";
import {
  resolveMapApiAccess,
  PUBLIC_MAP_CACHE_HEADERS,
  AUTHED_MAP_CACHE_HEADERS,
} from "@/lib/server/map-public-access";

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

// Dual-plane since go-live plan S1: signed-in artists get the authed plane
// (unchanged), anonymous visitors get the public plane while
// publicMapEnabled() is on (rate limited, CDN-cacheable), and are refused
// exactly as before otherwise. The pins body is viewer-independent by
// construction (toPublicMapPin), so both planes share it; only headers differ.
// Reads go through the service client + the tested public shaper, never
// through client-side table access (house RLS rule).
export async function GET(request: Request) {
  const access = await resolveMapApiAccess(request, "pins");
  if (access.kind === "refused") {
    return access.response;
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

  // Perf hardening (Slice 2, migration 0101): route to the index-using v2 RPCs
  // when MAP_PINS_V2 is on. v2 is byte-identical to v1 (same grid sample + fair
  // truncation, plus an exact BETWEEN), so the response shape is unchanged;
  // fails closed to the proven v1 functions.
  const useV2 = mapPinsV2Enabled();
  const [{ data, error }, { data: totalInView }] = await Promise.all([
    serviceClient.rpc(useV2 ? "map_pins_in_view_v2" : "map_pins_in_view", {
      p_west: bbox.west,
      p_south: bbox.south,
      p_east: bbox.east,
      p_north: bbox.north,
      p_zoom: zoom,
      p_limit: PIN_LIMIT,
    }),
    serviceClient.rpc(
      useV2 ? "map_pins_in_view_count_v2" : "map_pins_in_view_count",
      {
        p_west: bbox.west,
        p_south: bbox.south,
        p_east: bbox.east,
        p_north: bbox.north,
      },
    ),
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
  return NextResponse.json(body, {
    headers:
      access.kind === "public"
        ? PUBLIC_MAP_CACHE_HEADERS
        : AUTHED_MAP_CACHE_HEADERS,
  });
}
