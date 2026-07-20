"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { brandMapStyle, type MapScheme } from "@inklee/shared/map-style";

// Map style lab (admin/dev only): tune the branded basemap, the marker
// geometry AND the clustering behaviour for both schemes side by side
// against real tiles, then copy the printed blocks into the source. Nothing
// here writes to the app; it is a design surface, not a setting.

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

// Marker geometry and clustering are scheme-independent (production uses
// one set for light and dark), so they live outside the per-scheme palettes.
type Geom = {
  pinRadiusFar: number; // radius at zoom 4
  pinRadiusNear: number; // radius at zoom 12
  pinStroke: number; // border width, unclaimed
  pinStrokeClaimed: number; // border width, claimed studios
  ringGap: number; // clear space between pin edge and signal ring
  ringStroke: number; // signal ring thickness
  ringMinzoom: number; // zoom at which the ring appears
  // Clustering behaviour (source options; changing these rebuilds the source).
  clusterRadiusPx: number; // grouping radius in screen pixels
  clusterMaxZoom: number; // above this zoom every pin stands alone
  clusterMinPoints: number; // pins needed before a bubble forms
  // Bubble appearance.
  clusterStepMedium: number; // count at which the bubble grows once
  clusterStepLarge: number; // count at which it grows again
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

type SampleFeature = GeoJSON.Feature<
  GeoJSON.Point,
  { category: string; claimed: boolean; hasSignal: boolean }
>;
type SampleData = GeoJSON.FeatureCollection<
  GeoJSON.Point,
  { category: string; claimed: boolean; hasSignal: boolean }
>;

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

type GeomField = {
  key: keyof Geom;
  label: string;
  min: number;
  max: number;
  step: number;
  group: "pin" | "ring" | "clustering" | "bubble";
  hint?: string;
};

const GEOM_FIELDS: GeomField[] = [
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
    key: "clusterRadiusPx",
    label: "Grouping radius",
    min: 10,
    max: 120,
    step: 2,
    group: "clustering",
    hint: "Screen pixels. Larger groups pins that are further apart.",
  },
  {
    key: "clusterMaxZoom",
    label: "Cluster up to zoom",
    min: 4,
    max: 18,
    step: 1,
    group: "clustering",
    hint: "Above this zoom every pin stands alone.",
  },
  {
    key: "clusterMinPoints",
    label: "Minimum pins",
    min: 2,
    max: 10,
    step: 1,
    group: "clustering",
    hint: "Fewer than this stay individual pins.",
  },
  {
    key: "clusterRadiusSmall",
    label: "Bubble, small",
    min: 8,
    max: 30,
    step: 1,
    group: "bubble",
  },
  {
    key: "clusterStepMedium",
    label: "Grows at",
    min: 3,
    max: 60,
    step: 1,
    group: "bubble",
  },
  {
    key: "clusterRadiusMedium",
    label: "Bubble, medium",
    min: 10,
    max: 40,
    step: 1,
    group: "bubble",
  },
  {
    key: "clusterStepLarge",
    label: "Grows again at",
    min: 10,
    max: 300,
    step: 5,
    group: "bubble",
  },
  {
    key: "clusterRadiusLarge",
    label: "Bubble, large",
    min: 12,
    max: 50,
    step: 1,
    group: "bubble",
  },
  {
    key: "clusterStroke",
    label: "Bubble border",
    min: 0,
    max: 6,
    step: 0.25,
    group: "bubble",
  },
  {
    key: "clusterTextSize",
    label: "Number size",
    min: 8,
    max: 20,
    step: 1,
    group: "bubble",
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
  clusterRadiusPx: 44,
  clusterMaxZoom: 13,
  clusterMinPoints: 2,
  clusterStepMedium: 10,
  clusterStepLarge: 50,
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

// Zoom-interpolated radii, exactly like production. The ring derives from
// the pin so "gap" stays honest at every zoom level.
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
    g.clusterStepMedium,
    g.clusterRadiusMedium,
    g.clusterStepLarge,
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

// Deterministic pseudo-random so two runs of the lab are comparable.
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

// A city-shaped scatter: two dense cores, a mid band and sparse outskirts,
// so clustering settings actually show their effect.
function syntheticPins(center: [number, number]): SampleData {
  const [lng, lat] = center;
  const rnd = seeded(1337);
  const cats = [
    "tattoo_studio",
    "tattoo_studio",
    "tattoo_studio",
    "private_studio",
    "piercing_studio",
    "supply_shop",
  ];
  const features: SampleFeature[] = [];
  const blob = (dx: number, dy: number, spread: number, count: number) => {
    for (let i = 0; i < count; i++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * spread;
      features.push({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [
            lng + dx + Math.cos(a) * r * 1.6,
            lat + dy + Math.sin(a) * r,
          ],
        },
        properties: {
          category: cats[Math.floor(rnd() * cats.length)],
          claimed: rnd() < 0.22,
          hasSignal: rnd() < 0.12,
        },
      });
    }
  };
  blob(0.004, 0.002, 0.006, 45);
  blob(-0.021, 0.011, 0.005, 28);
  blob(0.026, -0.013, 0.009, 22);
  blob(0, 0, 0.05, 40);
  return { type: "FeatureCollection", features };
}

function LabMap({
  scheme,
  ink,
  pins,
  geom,
  data,
  center,
  onMove,
}: {
  scheme: MapScheme;
  ink: Ink;
  pins: Pins;
  geom: Geom;
  data: SampleData;
  center: { lng: number; lat: number; zoom: number };
  onMove: (v: { lng: number; lat: number; zoom: number }) => void;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const ready = useRef(false);
  const moving = useRef(false);
  // Latest values for handlers bound once. Kept fresh in an effect (never
  // written during render).
  const live = useRef({ pins, geom, data });
  useEffect(() => {
    live.current = { pins, geom, data };
  }, [pins, geom, data]);

  // Source options are immutable in MapLibre, so any clustering change
  // rebuilds the source and its layers.
  const clusterKey = `${geom.clusterRadiusPx}|${geom.clusterMaxZoom}|${geom.clusterMinPoints}`;

  const build = useCallback((map: maplibregl.Map) => {
    const { pins: p, geom: g, data: d } = live.current;
    map.addSource("sample", {
      type: "geojson",
      data: d,
      cluster: true,
      clusterRadius: g.clusterRadiusPx,
      clusterMaxZoom: g.clusterMaxZoom,
      clusterMinPoints: g.clusterMinPoints,
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
  }, []);

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
      build(map);
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

  // Clustering options changed: tear the source down and rebuild it.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready.current || !map.getSource("sample")) return;
    for (const id of ["s-pins", "s-cluster-count", "s-clusters", "s-signal"]) {
      if (map.getLayer(id)) map.removeLayer(id);
    }
    map.removeSource("sample");
    build(map);
  }, [clusterKey, build]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready.current) return;
    const source = map.getSource("sample") as
      | maplibregl.GeoJSONSource
      | undefined;
    source?.setData(data);
  }, [data]);

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
  field,
  value,
  onChange,
}: {
  field: GeomField;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block text-xs" title={field.hint}>
      <span className="flex items-center gap-2">
        <span className="w-28 shrink-0 text-muted-foreground">
          {field.label}
        </span>
        <input
          type="range"
          min={field.min}
          max={field.max}
          step={field.step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-7 w-full cursor-pointer accent-brand-mustard"
        />
        <input
          type="number"
          min={field.min}
          max={field.max}
          step={field.step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-14 shrink-0 rounded-md border border-border bg-background px-1.5 py-1 text-right font-mono text-[11px] text-foreground"
        />
      </span>
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
  const [useLive, setUseLive] = useState(false);
  const [liveData, setLiveData] = useState<SampleData | null>(null);
  const [liveNote, setLiveNote] = useState<string | null>(null);

  const synthetic = useMemo(() => syntheticPins([13.405, 52.52]), []);
  const data = useLive && liveData ? liveData : synthetic;

  // Live pins: the real viewport from the map API, so clustering can be
  // judged against actual studio density instead of a synthetic scatter.
  useEffect(() => {
    if (!useLive) return;
    const abort = new AbortController();
    const t = setTimeout(() => {
      const dLat = 0.09;
      const dLng = 0.16;
      const params = new URLSearchParams({
        west: String(center.lng - dLng),
        south: String(center.lat - dLat),
        east: String(center.lng + dLng),
        north: String(center.lat + dLat),
      });
      fetch(`/api/map/locations?${params.toString()}`, {
        signal: abort.signal,
      })
        .then((r) => (r.ok ? r.json() : null))
        .then(
          (
            body: {
              pins: Array<{
                lat: number;
                lng: number;
                category: string;
                claimed: boolean;
                signal: string | null;
              }>;
            } | null,
          ) => {
            if (!body) {
              setLiveNote("Could not load live pins.");
              return;
            }
            setLiveNote(`${body.pins.length} live pins in view`);
            setLiveData({
              type: "FeatureCollection",
              features: body.pins.map((p) => ({
                type: "Feature" as const,
                geometry: {
                  type: "Point" as const,
                  coordinates: [p.lng, p.lat],
                },
                properties: {
                  category: p.category,
                  claimed: p.claimed,
                  hasSignal: p.signal !== null,
                },
              })),
            });
          },
        )
        .catch(() => {
          // Aborted or offline: keep whatever is on screen.
        });
    }, 350);
    return () => {
      abort.abort();
      clearTimeout(t);
    };
  }, [useLive, center]);

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

  const geomGroup = (group: GeomField["group"]) =>
    GEOM_FIELDS.filter((f) => f.group === group).map((f) => (
      <SliderRow
        key={f.key}
        field={f}
        value={geom[f.key]}
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

// source "pins"
cluster: true,
clusterRadius: ${geom.clusterRadiusPx},
clusterMaxZoom: ${geom.clusterMaxZoom},
clusterMinPoints: ${geom.clusterMinPoints},

// pin-points
"circle-radius": ["interpolate", ["linear"], ["zoom"], 4, ${geom.pinRadiusFar}, 12, ${geom.pinRadiusNear}],
"circle-stroke-width": ["case", ["get", "claimed"], ${geom.pinStrokeClaimed}, ${geom.pinStroke}],

// signal-rings (radius = pin + ${geom.ringGap} gap)
minzoom: ${geom.ringMinzoom},
"circle-radius": ["interpolate", ["linear"], ["zoom"], 4, ${geom.pinRadiusFar + geom.ringGap}, 12, ${geom.pinRadiusNear + geom.ringGap}],
"circle-stroke-width": ${geom.ringStroke},
"circle-stroke-color": light "${lightPins.signalRing}" / dark "${darkPins.signalRing}",

// clusters
"circle-radius": ["step", ["get", "point_count"], ${geom.clusterRadiusSmall}, ${geom.clusterStepMedium}, ${geom.clusterRadiusMedium}, ${geom.clusterStepLarge}, ${geom.clusterRadiusLarge}],
"circle-stroke-width": ${geom.clusterStroke},
"text-size": ${geom.clusterTextSize},

// mapInk(): dark planned ${darkPins.cluster}, onActive ${darkPins.clusterText}, markerBorder ${darkPins.markerBorder}
//           light planned ${lightPins.cluster}, onActive ${lightPins.clusterText}, markerBorder ${lightPins.markerBorder}`;
  }, [light, dark, lightPins, darkPins, geom]);

  const chip = (active: boolean) =>
    `rounded-full px-3 py-1 text-xs transition-colors ${
      active
        ? "bg-foreground text-background"
        : "bg-muted text-muted-foreground hover:text-foreground"
    }`;

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-foreground">Map style lab</h1>
        <p className="text-sm text-muted-foreground">
          Both schemes, live, on real tiles. Pan or zoom either map and they
          stay in sync. Marker sizes and clustering are zoom-dependent, so judge
          them at the zoom you care about. Nothing here changes the app: when a
          look is right, copy the block at the bottom.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.name}
            type="button"
            onClick={() => applyPreset(p)}
            title={p.note}
            className={chip(false)}
          >
            {p.name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setGeom({ ...DEFAULT_GEOM })}
          className={chip(false)}
        >
          Reset geometry
        </button>
        <button
          type="button"
          onClick={() => setUseLive((v) => !v)}
          className={chip(useLive)}
          title="Load the real studios in this viewport instead of the synthetic scatter"
        >
          {useLive ? "Live pins" : "Sample pins"}
        </button>
        <span className="ml-auto font-mono text-xs text-muted-foreground">
          {useLive && liveNote ? `${liveNote} · ` : ""}
          zoom {center.zoom.toFixed(1)}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <LabMap
          scheme="light"
          ink={light}
          pins={lightPins}
          geom={geom}
          data={data}
          center={center}
          onMove={setCenter}
        />
        <LabMap
          scheme="dark"
          ink={dark}
          pins={darkPins}
          geom={geom}
          data={data}
          center={center}
          onMove={setCenter}
        />
      </div>

      <section className="space-y-3 rounded-2xl border border-border p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-foreground">
            Markers and clustering
          </span>
          <span className="text-xs text-muted-foreground">
            shared by both schemes
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-foreground">Pin</p>
            {geomGroup("pin")}
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-foreground">Signal ring</p>
            {geomGroup("ring")}
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-foreground">
              Clustering behaviour
            </p>
            {geomGroup("clustering")}
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-foreground">
              Cluster bubble
            </p>
            {geomGroup("bubble")}
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
              className={chip(editing === s)}
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
