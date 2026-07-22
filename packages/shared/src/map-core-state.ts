// One shared map core: framework-free state contracts (map redesign Slice 1).
//
// The public map and the logged-in map are capability layers over ONE core,
// not two map products. This module is that core's shared vocabulary: one
// viewport model, one filter state, one selected-place model, one URL-state
// codec, one permission boundary. Pure and platform-neutral (web + mobile
// import it): no React, no DOM, no maplibre. The rendering engine, shells, and
// API handlers all agree on these shapes.

import {
  MAP_LOCATION_CATEGORIES,
  type MapLocationCategory,
} from "./map-directory";

// ---------------------------------------------------------------------------
// One viewport model. A shareable center + zoom; the rendering engine derives
// its own bbox from this (the viewport query still sends bbox — see the
// map-directory MapBBox helpers). Center + zoom is what belongs in a URL: it
// is stable across window sizes, where a raw bbox is not.

export type MapViewport = { lng: number; lat: number; zoom: number };

// Matches the discovery map's historical initial camera (Berlin, world-ish).
export const DEFAULT_MAP_VIEWPORT: MapViewport = {
  lng: 13.405,
  lat: 52.52,
  zoom: 3,
};

// ---------------------------------------------------------------------------
// One filter state. Mirrors the discovery chip set exactly so the same state
// drives the map AND (later) the list, with no second filtering path. Category
// values come from the single map-directory vocabulary.

export const MAP_FILTER_KINDS = [
  "all",
  ...MAP_LOCATION_CATEGORIES,
  "watched",
  "signals",
] as const;
export type MapFilterKind = (typeof MAP_FILTER_KINDS)[number];

export function isMapFilterKind(value: string): value is MapFilterKind {
  return (MAP_FILTER_KINDS as readonly string[]).includes(value);
}

/** The category a filter narrows to, or null for the non-category kinds. */
export function filterCategory(
  filter: MapFilterKind,
): MapLocationCategory | null {
  return (MAP_LOCATION_CATEGORIES as readonly string[]).includes(filter)
    ? (filter as MapLocationCategory)
    : null;
}

// ---------------------------------------------------------------------------
// One public/private permission boundary, expressed as a capability object the
// shell hands the core. The SAME core renders for every audience; only these
// booleans differ. A public (anonymous) plane can never watch, apply, claim,
// see personal overlays, or see named artists; the logged-in artist plane can.
// This is a contract, not an enforcement point: the server still gates every
// mutation. It exists so shells cannot each invent their own capability logic.

export type MapCapabilities = {
  /** Anonymous visitor plane (no viewer identity). */
  isPublic: boolean;
  canWatch: boolean;
  canApplyGuest: boolean;
  canClaim: boolean;
  /** Watched pins + the personal journey overlay. Never on the public plane. */
  canSeePersonalOverlays: boolean;
  /** Named (vs counts-only) artist presence. Gated by consent on the public plane. */
  canSeeNamedArtists: boolean;
  viewerId: string | null;
};

export const PUBLIC_MAP_CAPABILITIES: MapCapabilities = {
  isPublic: true,
  canWatch: false,
  canApplyGuest: false,
  canClaim: false,
  canSeePersonalOverlays: false,
  canSeeNamedArtists: false,
  viewerId: null,
};

/** Capabilities for a signed-in artist viewing the logged-in shell. */
export function artistMapCapabilities(viewerId: string): MapCapabilities {
  return {
    isPublic: false,
    canWatch: true,
    canApplyGuest: true,
    canClaim: true,
    canSeePersonalOverlays: true,
    canSeeNamedArtists: true,
    viewerId,
  };
}

// ---------------------------------------------------------------------------
// One URL-state model. Center + zoom + filter + selected place, round-tripped
// through the query string so a viewport is shareable and the browser back
// button can close a selection before it leaves the map. Personal data (watch,
// trips, applications) is NEVER encoded here: a deep link must be
// reconstructable by any visitor.
//
// Params: ll=<lat>,<lng>  z=<zoom>  f=<filter>  sel=<locationId>
// (filter omitted when "all"; sel omitted when none — the default URL is bare.)

export type MapUrlState = {
  viewport: MapViewport;
  filter: MapFilterKind;
  selectedId: string | null;
};

export const DEFAULT_MAP_URL_STATE: MapUrlState = {
  viewport: DEFAULT_MAP_VIEWPORT,
  filter: "all",
  selectedId: null,
};

const SELECTED_ID_MAX = 64;

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/** Serialize to a query string WITHOUT the leading "?" (empty for the default). */
export function encodeMapUrlState(state: MapUrlState): string {
  const params = new URLSearchParams();
  params.set(
    "ll",
    `${round(state.viewport.lat, 5)},${round(state.viewport.lng, 5)}`,
  );
  params.set("z", String(round(state.viewport.zoom, 2)));
  if (state.filter !== "all") params.set("f", state.filter);
  if (state.selectedId) params.set("sel", state.selectedId);
  return params.toString();
}

/**
 * Parse a query string (or URLSearchParams) into map state. Tolerant by
 * design: any missing or malformed field falls back to its default and clamps
 * into range, so a hand-edited or stale URL can never throw or place the camera
 * off the globe.
 */
export function decodeMapUrlState(input: string | URLSearchParams): MapUrlState {
  const params =
    typeof input === "string"
      ? new URLSearchParams(input.startsWith("?") ? input.slice(1) : input)
      : input;

  const viewport: MapViewport = { ...DEFAULT_MAP_VIEWPORT };
  const ll = params.get("ll");
  if (ll) {
    const [latStr, lngStr] = ll.split(",");
    const lat = Number(latStr);
    const lng = Number(lngStr);
    if (
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180
    ) {
      viewport.lat = lat;
      viewport.lng = lng;
    }
  }
  // Number(null) is 0, so an absent z must be handled before coercion (an
  // empty URL must keep the default zoom, not snap to 0).
  const rawZoom = params.get("z");
  if (rawZoom !== null) {
    const zoom = Number(rawZoom);
    if (Number.isFinite(zoom)) viewport.zoom = clamp(zoom, 0, 22);
  }

  const rawFilter = params.get("f");
  const filter: MapFilterKind =
    rawFilter && isMapFilterKind(rawFilter) ? rawFilter : "all";

  const rawSel = params.get("sel");
  const selectedId =
    rawSel && rawSel.length > 0 && rawSel.length <= SELECTED_ID_MAX
      ? rawSel
      : null;

  return { viewport, filter, selectedId };
}
