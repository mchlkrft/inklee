// Shared home (promoted from apps/mobile/src/lib/map-style.ts in Phase 2 of
// the 2.0 map track) so web and native render the SAME branded basemap; the
// mobile file re-exports from here.
export type MapScheme = "light" | "dark";
type Scheme = MapScheme;

// Branded MapLibre basemap (FU map redesign). We reuse CARTO's free OpenMapTiles
// vector source (the same tiles the old Voyager style pulled) but author our own
// brand-colored layers so the basemap reads as Inklee:
//   dark  = charcoal base, mustard/rosa structures
//   light = mustard base, charcoal structures
// Reusing the proven source URL + source-layer names means the geometry can't go
// blank; only our paint changes. Labels are a single non-critical place layer, so
// if the glyph font ever 404s the map still renders fine without them.
const CARTO_VECTOR_TILES =
  "https://tiles.basemaps.cartocdn.com/vector/carto.streets/v1/tiles.json";
const GLYPHS = "https://tiles.basemaps.cartocdn.com/fonts/{fontstack}/{range}.pbf";

type Ink = {
  bg: string;
  water: string;
  land: string;
  building: string;
  road: string;
  roadMinor: string;
  boundary: string;
  label: string;
  labelHalo: string;
};

// Founder-tuned 2026-07-20 in the style lab (/dev/map-style). Both schemes
// pull the basemap back so the markers carry the attention: water merges
// into the dark base, and roads read as a faint grid rather than structure.
const DARK: Ink = {
  bg: "#1e1e1e", // charcoal base
  water: "#1e1e1e",
  land: "#2e2e2e",
  building: "#2c2c2c",
  road: "rgba(233,178,43,0.2)",
  roadMinor: "rgba(233,178,43,0.4)",
  boundary: "#db88b9", // rosa borders
  label: "#e5e1d5",
  labelHalo: "#1e1e1e",
};

const LIGHT: Ink = {
  bg: "#e9b22b", // mustard base
  water: "#e7cf83",
  land: "#fee490",
  building: "rgba(30,30,30,0.2)",
  road: "rgba(30,30,30,0.4)",
  roadMinor: "rgba(30,30,30,0.2)",
  boundary: "#9f6587",
  label: "#1e1e1e",
  labelHalo: "rgba(233,178,43,0.85)",
};

// MapLibre style spec. Typed loosely: the RN mapStyle prop accepts a StyleJSON
// object, and the expression arrays don't line up with a hand-written TS type.
export function brandMapStyle(scheme: Scheme): object {
  const c = scheme === "dark" ? DARK : LIGHT;
  return {
    version: 8,
    name: `inklee-${scheme}`,
    glyphs: GLYPHS,
    sources: {
      carto: {
        type: "vector",
        url: CARTO_VECTOR_TILES,
        attribution:
          '&copy; <a href="https://carto.com/attributions">CARTO</a> &copy; OpenStreetMap contributors',
      },
    },
    layers: [
      { id: "background", type: "background", paint: { "background-color": c.bg } },
      {
        id: "landuse",
        type: "fill",
        source: "carto",
        "source-layer": "landuse",
        paint: { "fill-color": c.land, "fill-opacity": 0.5 },
      },
      {
        id: "park",
        type: "fill",
        source: "carto",
        "source-layer": "park",
        paint: { "fill-color": c.land, "fill-opacity": 0.45 },
      },
      {
        id: "water",
        type: "fill",
        source: "carto",
        "source-layer": "water",
        paint: { "fill-color": c.water },
      },
      {
        id: "building",
        type: "fill",
        source: "carto",
        "source-layer": "building",
        minzoom: 13,
        paint: { "fill-color": c.building, "fill-opacity": 0.7 },
      },
      {
        id: "road-minor",
        type: "line",
        source: "carto",
        "source-layer": "transportation",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": c.roadMinor,
          "line-width": ["interpolate", ["linear"], ["zoom"], 6, 0.4, 14, 1.6],
        },
      },
      {
        id: "road-major",
        type: "line",
        source: "carto",
        "source-layer": "transportation",
        filter: [
          "in",
          ["get", "class"],
          ["literal", ["motorway", "trunk", "primary", "secondary"]],
        ],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": c.road,
          "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.6, 14, 3],
        },
      },
      {
        id: "boundary",
        type: "line",
        source: "carto",
        "source-layer": "boundary",
        paint: {
          "line-color": c.boundary,
          "line-width": 1,
          "line-opacity": 0.6,
          "line-dasharray": [2, 2],
        },
      },
      {
        id: "place-labels",
        type: "symbol",
        source: "carto",
        "source-layer": "place",
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["Open Sans Regular"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 3, 11, 8, 14],
        },
        paint: {
          "text-color": c.label,
          "text-halo-color": c.labelHalo,
          "text-halo-width": 1.2,
        },
      },
    ],
  };
}

// Overlay colors (route lines + numbered stop markers) that must read on top of
// the branded base. Mustard markers vanish on the light mustard base, so in light
// mode the "active" ink flips to charcoal; in dark mode it stays mustard.
export type MapInk = {
  planned: string; // upcoming route line + active marker fill
  traveled: string; // visited route line + past marker fill
  onActive: string; // text/number on an active marker
  onPast: string; // text/number on a past marker
  markerBorder: string;
};

// Founder-tuned 2026-07-20: marker borders go transparent (the pins carry
// their own weight now), and the light "planned" ink softens to 50% so the
// route line and cluster fill stop competing with the mustard base.
export function mapInk(scheme: Scheme): MapInk {
  if (scheme === "dark") {
    return {
      planned: "#e9b22b",
      traveled: "#8a8a8a",
      onActive: "#1e1e1e",
      onPast: "#1e1e1e",
      markerBorder: "rgba(233,178,43,0)",
    };
  }
  return {
    planned: "rgba(30,30,30,0.5)",
    traveled: "rgba(30,30,30,0.5)",
    onActive: "#e5e1d5",
    onPast: "#e5e1d5",
    markerBorder: "rgba(30,30,30,0)",
  };
}
