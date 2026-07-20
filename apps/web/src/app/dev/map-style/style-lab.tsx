"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { brandMapStyle, type MapScheme } from "@inklee/shared/map-style";

// Map style lab (admin/dev only): tune the branded basemap AND the marker
// geometry for both schemes side by side against real tiles, then copy the
// printed blocks into the source. Nothing here writes to the app; it is a
// design surface, not a setting.

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

type Pins = {
  tattooStudio: string;
  privateStudio: string;
  piercingStudio: string;
  supplyShop: string;
  cluster: string;
  clusterText: string;
  markerBorder: string;
  signalRing: string;
};

// Marker geometry is scheme-independent (production uses one set of radii
// for light and dark), so it lives outside the per-scheme palettes.
type Geom = {
  pinRadiusFar: number; // radius at zoom 4
  pinRadiusNear: number; // radius at zoom 12
  pinStroke: number; // border width, unclaimed
  pinStrokeClaimed: number; // border width, claimed studios
  ringGap: number; // clear space between pin edge and signal ring
  ringStroke: number; // signal ring thickness
  ringMinzoom: number; // zoom at which the ring appears
  clusterRadiusSmall: number;
  clusterRadiusMedium: number;
  clusterRadiusLarge: number;
  clusterStroke: number;
  clusterTextSize: number;
};

type Preset = {
  name: string;
  note: string;
  light: Ink;
  dark: Ink;
  lightPins: Pins;
  darkPins: Pins;
};

const INK_TARGETS: Record<keyof Ink, Array<[string, string]>> = {
  bg: [["background", "background-color"]],
  land: [
    ["landuse", "fill-color"],
    ["park", "fill-color"],
  ],
  water: [["water", "fill-color"]],
  building: [["building", "fill-color"]],
  road: [["road-major", "line-color"]],
  roadMinor: [["road-minor", "line-color"]],
  boundary: [["boundary", "line-color"]],
  label: [["place-labels", "text-color"]],
  labelHalo: [["place-labels", "text-halo-color"]],
};

const INK_LABELS: Record<keyof Ink, string> = {
  bg: "Background",
  land: "Land and parks",
  water: "Water",
  building: "Buildings",
  road: "Major roads",
  roadMinor: "Minor roads",
  boundary: "Borders",
  label: "Labels",
  labelHalo: "Label halo",
};

const PIN_LABELS: Record<keyof Pins, string> = {
  tattooStudio: "Tattoo studio pin",
  privateStudio: "Private studio pin",
  piercingStudio: "Piercing studio pin",
  supplyShop: "Supply shop pin",
  cluster: "Cluster bubble",
  clusterText: "Cluster number",
  markerBorder: "Pin border",
  signalRing: "Signal ring",
};

const GEOM_FIELDS: Array<{
  key: keyof Geom;
  label: string;
  min: number;
  max: number;
  step: number;
  group: "pin" | "ring" | "cluster";
}> = [
  {
    key: "pinRadiusFar",
    label: "Size, zoomed out",
    min: 2,
    max: 12,
    step: 0.5,
    group: "pin",
  },
  {
    key: "pinRadiusNear",
    label: "Size, zoomed in",
    min: 3,
    max: 20,
    step: 0.5,
    group: "pin",
  },
  {
    key: "pinStroke",
    label: "Border",
    min: 0,
    max: 6,
    step: 0.25,
    group: "pin",
  },
  {
    key: "pinStrokeClaimed",
    label: "Border, claimed",
    min: 0,
    max: 8,
    step: 0.25,
    group: "pin",
  },
  {
    key: "ringGap",
    label: "Gap from pin",
    min: 0,
    max: 16,
    step: 0.5,
    group: "ring",
  },
  {
    key: "ringStroke",
    label: "Ring thickness",
    min: 0.5,
    max: 8,
    step: 0.25,
    group: "ring",
  },
  {
    key: "ringMinzoom",
    label: "Appears at zoom",
    min: 0,
    max: 16,
    step: 1,
    group: "ring",
  },
  {
    key: "clusterRadiusSmall",
    label: "Small",
    min: 8,
    max: 30,
    step: 1,
    group: "cluster",
  },
  {
    key: "clusterRadiusMedium",
    label: "Medium (10+)",
    min: 10,
    max: 40,
    step: 1,
    group: "cluster",
  },
  {
    key: "clusterRadiusLarge",
    label: "Large (50+)",
    min: 12,
    max: 50,
    step: 1,
    group: "cluster",
  },
  {
    key: "clusterStroke",
    label: "Border",
    min: 0,
    max: 6,
    step: 0.25,
    group: "cluster",
  },
  {
    key: "clusterTextSize",
    label: "Number size",
    min: 8,
    max: 20,
    step: 1,
    group: "cluster",
  },
];

// Production values as shipped, so the lab always opens on the real thing.
const DEFAULT_GEOM: Geom = {
  pinRadiusFar: 4,
  pinRadiusNear: 8,
  pinStroke: 1,
  pinStrokeClaimed: 2.5,
  ringGap: 4,
  ringStroke: 2.5,
  ringMinzoom: 10,
  clusterRadiusSmall: 14,
  clusterRadiusMedium: 18,
  clusterRadiusLarge: 24,
  clusterStroke: 2,
  clusterTextSize: 12,
};

const CURRENT: Preset = {
  name: "Current (shipped)",
  note: "What production renders today.",
  light: {
    bg: "#e9b22b",
    water: "#e7cf83",
    land: "#e6c352",
    building: "rgba(30,30,30,0.14)",
    road: "#1e1e1e",
    roadMinor: "rgba(30,30,30,0.4)",
    boundary: "#1e1e1e",
    label: "#1e1e1e",
    labelHalo: "rgba(233,178,43,0.85)",
  },
  dark: {
    bg: "#1e1e1e",
    water: "#151515",
    land: "#242424",
    building: "#2c2c2c",
    road: "#e9b22b",
    roadMinor: "rgba(233,178,43,0.45)",
    boundary: "#db88b9",
    label: "#e5e1d5",
    labelHalo: "#1e1e1e",
  },
  lightPins: {
    tattooStudio: "#1e1e1e",
    privateStudio: "#db88b9",
    piercingStudio: "#5b4a12",
    supplyShop: "#6b6b6b",
    cluster: "#1e1e1e",
    clusterText: "#e5e1d5",
    markerBorder: "#e5e1d5",
    signalRing: "#db88b9",
  },
  darkPins: {
    tattooStudio: "#e9b22b",
    privateStudio: "#db88b9",
    piercingStudio: "#e5e1d5",
    supplyShop: "#8a8a8a",
    cluster: "#e9b22b",
    clusterText: "#1e1e1e",
    markerBorder: "#1e1e1e",
    signalRing: "#db88b9",
  },
};

const MUTED: Preset = {
  name: "Muted brand",
  note: "Mustard becomes a tint instead of a flood; pins gain contrast.",
  light: {
    bg: "#f0e3c4",
    water: "#e3d6b0",
    land: "#ead9ae",
    building: "rgba(30,30,30,0.10)",
    road: "rgba(30,30,30,0.72)",
    roadMinor: "rgba(30,30,30,0.26)",
    boundary: "rgba(30,30,30,0.45)",
    label: "#2a2723",
    labelHalo: "rgba(240,227,196,0.9)",
  },
  dark: {
    bg: "#1c1c1c",
    water: "#141414",
    land: "#232323",
    building: "#282828",
    road: "rgba(233,178,43,0.62)",
    roadMinor: "rgba(233,178,43,0.20)",
    boundary: "rgba(219,136,185,0.45)",
    label: "#d8d3c6",
    labelHalo: "#151515",
  },
  lightPins: { ...CURRENT.lightPins },
  darkPins: { ...CURRENT.darkPins },
};

const PAPER: Preset = {
  name: "Paper",
  note: "Near-neutral canvas; every colored thing on screen is data.",
  light: {
    bg: "#f4f0e6",
    water: "#e4e0d3",
    land: "#ece7d8",
    building: "rgba(30,30,30,0.09)",
    road: "rgba(30,30,30,0.6)",
    roadMinor: "rgba(30,30,30,0.2)",
    boundary: "rgba(30,30,30,0.35)",
    label: "#33302a",
    labelHalo: "rgba(244,240,230,0.92)",
  },
  dark: {
    bg: "#191919",
    water: "#121212",
    land: "#1f1f1f",
    building: "#242424",
    road: "rgba(229,225,213,0.35)",
    roadMinor: "rgba(229,225,213,0.14)",
    boundary: "rgba(229,225,213,0.22)",
    label: "#cdc8bb",
    labelHalo: "#141414",
  },
  lightPins: { ...CURRENT.lightPins },
  darkPins: { ...CURRENT.darkPins },
};

const PRESETS = [CURRENT, MUTED, PAPER];

// Zoom-interpolated radii, exactly like production. The ring is derived from
// the pin so "gap" stays the honest control at every zoom level.
function pinRadiusExpr(g: Geom) {
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    4,
    g.pinRadiusFar,
    12,
    g.pinRadiusNear,
  ];
}
function ringRadiusExpr(g: Geom) {
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    4,
    g.pinRadiusFar + g.ringGap,
    12,
    g.pinRadiusNear + g.ringGap,
  ];
}
function clusterRadiusExpr(g: Geom) {
  return [
    "step",
    ["get", "point_count"],
    g.clusterRadiusSmall,
    10,
    g.clusterRadiusMedium,
    50,
    g.clusterRadiusLarge,
  ];
}
function pinColorExpr(p: Pins) {
  return [
    "match",
    ["get", "category"],
    "tattoo_studio",
    p.tattooStudio,
    "private_studio",
    p.privateStudio,
    "piercing_studio",
    p.piercingStudio,
    "supply_shop",
    p.supplyShop,
    p.tattooStudio,
  ];
}

// Enough synthetic pins to also produce a cluster, so cluster geometry is
// judgeable without hitting the live API.
function samplePins(center: [number, number]) {
  const [lng, lat] = center;
  const spread: Array<[number, number, string, boolean, boolean]> = [
    [0.012, 0.006, "tattoo_studio", true, true],
    [-0.014, 0.004, "tattoo_studio", false, false],
    [0.006, -0.011, "private_studio", true, false],
    [-0.008, -0.008, "piercing_studio", false, false],
    [0.02, -0.004, "supply_shop", false, false],
    [-0.02, 0.012, "tattoo_studio", false, true],
    [0.0305, 0.0182, "tattoo_studio", false, false],
    [0.0312, 0.0175, "tattoo_studio", false, false],
    [0.0299, 0.0189, "private_studio", false, false],
    [0.0308, 0.0193, "tattoo_studio", true, false],
  ];
  return {
    type: "FeatureCollection" as const,
    features: spread.map(([dx, dy, category, claimed, hasSignal], i) => ({
      type: "Feature" as const,
      id: i,
      geometry: { type: "Point" as const, coordinates: [lng + dx, lat + dy] },
      properties: { category, claimed, hasSignal },
    })),
  };
}

function LabMap({
  scheme,
  ink,
  pins,
  geom,
  center,
  onMove,
}: {
  scheme: MapScheme;
  ink: Ink;
  pins: Pins;
  geom: Geom;
  center: { lng: number; lat: number; zoom: number };
  onMove: (v: { lng: number; lat: number; zoom: number }) => void;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const ready = useRef(false);
  const moving = useRef(false);
  // Latest values for the load handler, which is bound once. Kept fresh in
  // an effect (never written during render) and declared before the map
  // effect so the initial value is already current when "load" fires.
  const live = useRef({ pins, geom });
  useEffect(() => {
    live.current = { pins, geom };
  }, [pins, geom]);

  useEffect(() => {
    if (!holder.current) return;
    const map = new maplibregl.Map({
      container: holder.current,
      style: brandMapStyle(scheme) as maplibregl.StyleSpecification,
      center: [center.lng, center.lat],
      zoom: center.zoom,
      attributionControl: false,
    });
    mapRef.current = map;
    map.on("load", () => {
      const p = live.current.pins;
      const g = live.current.geom;
      map.addSource("sample", {
        type: "geojson",
        data: samplePins([center.lng, center.lat]),
        cluster: true,
        clusterRadius: 44,
        clusterMaxZoom: 13,
      });
      map.addLayer({
        id: "s-signal",
        type: "circle",
        source: "sample",
        filter: [
          "all",
          ["!", ["has", "point_count"]],
          ["==", ["get", "hasSignal"], true],
        ],
        minzoom: g.ringMinzoom,
        paint: {
          "circle-color": "rgba(0,0,0,0)",
          "circle-radius": ringRadiusExpr(
            g,
          ) as unknown as maplibregl.DataDrivenPropertyValueSpecification<number>,
          "circle-stroke-width": g.ringStroke,
          "circle-stroke-color": p.signalRing,
        },
      });
      map.addLayer({
        id: "s-clusters",
        type: "circle",
        source: "sample",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": p.cluster,
          "circle-radius": clusterRadiusExpr(
            g,
          ) as unknown as maplibregl.DataDrivenPropertyValueSpecification<number>,
          "circle-stroke-width": g.clusterStroke,
          "circle-stroke-color": p.markerBorder,
        },
      });
      map.addLayer({
        id: "s-cluster-count",
        type: "symbol",
        source: "sample",
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": ["Open Sans Regular"],
          "text-size": g.clusterTextSize,
        },
        paint: { "text-color": p.clusterText },
      });
      map.addLayer({
        id: "s-pins",
        type: "circle",
        source: "sample",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": pinColorExpr(
            p,
          ) as unknown as maplibregl.DataDrivenPropertyValueSpecification<string>,
          "circle-radius": pinRadiusExpr(
            g,
          ) as unknown as maplibregl.DataDrivenPropertyValueSpecification<number>,
          "circle-stroke-width": [
            "case",
            ["get", "claimed"],
            g.pinStrokeClaimed,
            g.pinStroke,
          ] as unknown as maplibregl.DataDrivenPropertyValueSpecification<number>,
          "circle-stroke-color": p.markerBorder,
        },
      });
      ready.current = true;
    });
    map.on("moveend", () => {
      if (moving.current) return;
      const c = map.getCenter();
      onMove({ lng: c.lng, lat: c.lat, zoom: map.getZoom() });
    });
    return () => {
      ready.current = false;
      map.remove();
      mapRef.current = null;
    };
    // One instance per scheme; all styling flows in through the effects.
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready.current) return;
    for (const [key, targets] of Object.entries(INK_TARGETS)) {
      for (const [layer, prop] of targets) {
        if (map.getLayer(layer))
          map.setPaintProperty(layer, prop, ink[key as keyof Ink]);
      }
    }
  }, [ink]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready.current || !map.getLayer("s-pins")) return;
    map.setPaintProperty("s-signal", "circle-stroke-color", pins.signalRing);
    map.setPaintProperty("s-clusters", "circle-color", pins.cluster);
    map.setPaintProperty(
      "s-clusters",
      "circle-stroke-color",
      pins.markerBorder,
    );
    map.setPaintProperty("s-cluster-count", "text-color", pins.clusterText);
    map.setPaintProperty("s-pins", "circle-stroke-color", pins.markerBorder);
    map.setPaintProperty("s-pins", "circle-color", pinColorExpr(pins));
  }, [pins]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready.current || !map.getLayer("s-pins")) return;
    map.setPaintProperty("s-pins", "circle-radius", pinRadiusExpr(geom));
    map.setPaintProperty("s-pins", "circle-stroke-width", [
      "case",
      ["get", "claimed"],
      geom.pinStrokeClaimed,
      geom.pinStroke,
    ]);
    map.setPaintProperty("s-signal", "circle-radius", ringRadiusExpr(geom));
    map.setPaintProperty("s-signal", "circle-stroke-width", geom.ringStroke);
    map.setLayerZoomRange("s-signal", geom.ringMinzoom, 24);
    map.setPaintProperty(
      "s-clusters",
      "circle-radius",
      clusterRadiusExpr(geom),
    );
    map.setPaintProperty(
      "s-clusters",
      "circle-stroke-width",
      geom.clusterStroke,
    );
    map.setLayoutProperty("s-cluster-count", "text-size", geom.clusterTextSize);
  }, [geom]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const c = map.getCenter();
    if (
      Math.abs(c.lng - center.lng) < 1e-6 &&
      Math.abs(c.lat - center.lat) < 1e-6 &&
      Math.abs(map.getZoom() - center.zoom) < 1e-6
    )
      return;
    moving.current = true;
    map.jumpTo({ center: [center.lng, center.lat], zoom: center.zoom });
    moving.current = false;
  }, [center]);

  return (
    <div className="space-y-1">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {scheme}
      </p>
      <div
        ref={holder}
        className="h-[360px] w-full overflow-hidden rounded-xl border border-border"
      />
    </div>
  );
}

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  // MapLibre accepts rgba() strings, which <input type=color> cannot show;
  // the text field stays authoritative so alpha values survive editing.
  const hex = /^#[0-9a-f]{6}$/i.test(value) ? value : "#000000";
  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="w-28 shrink-0 text-muted-foreground">{label}</span>
      <input
        type="color"
        value={hex}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 w-9 shrink-0 cursor-pointer rounded border border-border bg-transparent"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        className="w-full rounded-md border border-border bg-background px-2 py-1 font-mono text-[11px] text-foreground"
      />
    </label>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="w-28 shrink-0 text-muted-foreground">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-7 w-full cursor-pointer accent-brand-mustard"
      />
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-14 shrink-0 rounded-md border border-border bg-background px-1.5 py-1 text-right font-mono text-[11px] text-foreground"
      />
    </label>
  );
}

export default function StyleLab() {
  const [light, setLight] = useState<Ink>({ ...CURRENT.light });
  const [dark, setDark] = useState<Ink>({ ...CURRENT.dark });
  const [lightPins, setLightPins] = useState<Pins>({ ...CURRENT.lightPins });
  const [darkPins, setDarkPins] = useState<Pins>({ ...CURRENT.darkPins });
  const [geom, setGeom] = useState<Geom>({ ...DEFAULT_GEOM });
  const [editing, setEditing] = useState<MapScheme>("light");
  const [center, setCenter] = useState({ lng: 13.405, lat: 52.52, zoom: 12 });

  const ink = editing === "light" ? light : dark;
  const setInk = editing === "light" ? setLight : setDark;
  const pins = editing === "light" ? lightPins : darkPins;
  const setPins = editing === "light" ? setLightPins : setDarkPins;

  const applyPreset = (p: Preset) => {
    setLight({ ...p.light });
    setDark({ ...p.dark });
    setLightPins({ ...p.lightPins });
    setDarkPins({ ...p.darkPins });
  };

  const geomGroup = (group: "pin" | "ring" | "cluster") =>
    GEOM_FIELDS.filter((f) => f.group === group).map((f) => (
      <SliderRow
        key={f.key}
        label={f.label}
        value={geom[f.key]}
        min={f.min}
        max={f.max}
        step={f.step}
        onChange={(v) => setGeom({ ...geom, [f.key]: v })}
      />
    ));

  const snippet = useMemo(() => {
    const fmt = (o: Record<string, string>) =>
      Object.entries(o)
        .map(([k, v]) => `  ${k}: "${v}",`)
        .join("\n");
    return `// packages/shared/src/map-style.ts
const DARK: Ink = {
${fmt(dark)}
};

const LIGHT: Ink = {
${fmt(light)}
};

// apps/web/src/app/(artist)/map/discovery-map-client.tsx
const CATEGORY_COLOR_DARK = {
  tattoo_studio: "${darkPins.tattooStudio}",
  private_studio: "${darkPins.privateStudio}",
  piercing_studio: "${darkPins.piercingStudio}",
  supply_shop: "${darkPins.supplyShop}",
  other: "${darkPins.supplyShop}",
};
const CATEGORY_COLOR_LIGHT = {
  tattoo_studio: "${lightPins.tattooStudio}",
  private_studio: "${lightPins.privateStudio}",
  piercing_studio: "${lightPins.piercingStudio}",
  supply_shop: "${lightPins.supplyShop}",
  other: "${lightPins.supplyShop}",
};

// pin-points
"circle-radius": ["interpolate", ["linear"], ["zoom"], 4, ${geom.pinRadiusFar}, 12, ${geom.pinRadiusNear}],
"circle-stroke-width": ["case", ["get", "claimed"], ${geom.pinStrokeClaimed}, ${geom.pinStroke}],

// signal-rings (minzoom ${geom.ringMinzoom}; radius = pin + ${geom.ringGap} gap)
minzoom: ${geom.ringMinzoom},
"circle-radius": ["interpolate", ["linear"], ["zoom"], 4, ${geom.pinRadiusFar + geom.ringGap}, 12, ${geom.pinRadiusNear + geom.ringGap}],
"circle-stroke-width": ${geom.ringStroke},
"circle-stroke-color": "${lightPins.signalRing}" / dark "${darkPins.signalRing}",

// clusters
"circle-radius": ["step", ["get", "point_count"], ${geom.clusterRadiusSmall}, 10, ${geom.clusterRadiusMedium}, 50, ${geom.clusterRadiusLarge}],
"circle-stroke-width": ${geom.clusterStroke},
"text-size": ${geom.clusterTextSize},

// mapInk(): dark planned ${darkPins.cluster}, onActive ${darkPins.clusterText}, markerBorder ${darkPins.markerBorder}
//           light planned ${lightPins.cluster}, onActive ${lightPins.clusterText}, markerBorder ${lightPins.markerBorder}`;
  }, [light, dark, lightPins, darkPins, geom]);

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-foreground">Map style lab</h1>
        <p className="text-sm text-muted-foreground">
          Both schemes, live, on real tiles. Pan or zoom either map and they
          stay in sync. Marker sizes are zoom-dependent, so judge them at the
          zoom you care about. Nothing here changes the app: when a look is
          right, copy the block at the bottom.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.name}
            type="button"
            onClick={() => applyPreset(p)}
            title={p.note}
            className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {p.name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setGeom({ ...DEFAULT_GEOM })}
          className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Reset geometry
        </button>
        <span className="ml-auto font-mono text-xs text-muted-foreground">
          zoom {center.zoom.toFixed(1)}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <LabMap
          scheme="light"
          ink={light}
          pins={lightPins}
          geom={geom}
          center={center}
          onMove={setCenter}
        />
        <LabMap
          scheme="dark"
          ink={dark}
          pins={darkPins}
          geom={geom}
          center={center}
          onMove={setCenter}
        />
      </div>

      <section className="space-y-3 rounded-2xl border border-border p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-foreground">
            Marker geometry
          </span>
          <span className="text-xs text-muted-foreground">
            shared by both schemes
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-foreground">Pin</p>
            {geomGroup("pin")}
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-foreground">Signal ring</p>
            {geomGroup("ring")}
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-foreground">Cluster</p>
            {geomGroup("cluster")}
          </div>
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-border p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-foreground">Colors</span>
          {(["light", "dark"] as MapScheme[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setEditing(s)}
              className={`rounded-full px-3 py-1 text-xs transition-colors ${
                editing === s
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-foreground">Basemap</p>
            {(Object.keys(INK_LABELS) as Array<keyof Ink>).map((key) => (
              <ColorRow
                key={key}
                label={INK_LABELS[key]}
                value={ink[key]}
                onChange={(v) => setInk({ ...ink, [key]: v })}
              />
            ))}
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-foreground">Markers</p>
            {(Object.keys(PIN_LABELS) as Array<keyof Pins>).map((key) => (
              <ColorRow
                key={key}
                label={PIN_LABELS[key]}
                value={pins[key]}
                onChange={(v) => setPins({ ...pins, [key]: v })}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-2 rounded-2xl border border-border p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-foreground">
            Paste into the source
          </p>
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(snippet)}
            className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted/30"
          >
            Copy
          </button>
        </div>
        <pre className="max-h-64 overflow-auto rounded-md bg-muted/40 p-3 font-mono text-[11px] leading-relaxed text-foreground">
          {snippet}
        </pre>
      </section>
    </div>
  );
}
