import { serviceClient } from "@/lib/supabase/service";
import { mapPinsV2Enabled } from "@/lib/map-features";
import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { activeSignalsByLocation } from "@/lib/server/studio-signals";
import {
  MAP_LOCATION_CATEGORIES,
  parseMapBBox,
  toPublicMapPin,
  type MapLocationCategory,
  type MapLocationRowForPin,
  type PublicMapPin,
} from "@inklee/shared/map-directory";
import type { MobileMapLocationsResponse } from "@inklee/shared/mobile-api";
import { mapMobileGate } from "../_lib";

export const runtime = "nodejs";

// Native twin of GET /api/map/locations (same RPCs, same shaper, same grid
// sampling) with the Bearer auth + mobile envelope. One studio per zoom-sized
// grid cell; PIN_LIMIT caps the SAMPLE, not the viewport.
const PIN_LIMIT = 3000;

export async function GET(req: Request) {
  const gate = mapMobileGate();
  if (gate) return gate;
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);

  const url = new URL(req.url);
  const bbox = parseMapBBox({
    west: url.searchParams.get("west"),
    south: url.searchParams.get("south"),
    east: url.searchParams.get("east"),
    north: url.searchParams.get("north"),
  });
  if (!bbox) return mobileError(400, "Invalid map area.", "invalid_bbox");

  const category = url.searchParams.get("category");
  if (
    category &&
    !MAP_LOCATION_CATEGORIES.includes(category as MapLocationCategory)
  ) {
    return mobileError(400, "Unknown category.", "invalid_category");
  }

  const zoomParam = Number(url.searchParams.get("zoom"));
  const zoom = Number.isFinite(zoomParam)
    ? Math.min(22, Math.max(0, zoomParam))
    : 3;

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
  if (error) return mobileError(500, "Could not load the map.", "query_failed");

  const all = (data ?? []) as MapLocationRowForPin[];
  const rows = category ? all.filter((r) => r.category === category) : all;
  const signals = await activeSignalsByLocation(rows.map((r) => r.id));
  const pins = rows
    .map((row) => toPublicMapPin(row, signals.get(row.id) ?? null))
    .filter((p): p is PublicMapPin => p !== null);
  const total = Number(totalInView ?? pins.length);
  const body: MobileMapLocationsResponse = {
    pins,
    capped: total > pins.length,
    total,
  };
  return mobileOk(body);
}
