"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { brandMapStyle, mapInk } from "@inklee/shared/map-style";
import {
  MAP_LOCATION_CATEGORY_LABELS,
  type MapLocationCategory,
  type PublicMapPin,
} from "@inklee/shared/map-directory";
import type { TravelMapStop } from "@inklee/shared/travel-map";
import { toggleWatchAction } from "./actions";

// Category ink on the branded base (dark: mustard/rosa/bone; light: charcoal
// family). Claimed studios get the accent stroke.
const CATEGORY_COLOR_DARK: Record<MapLocationCategory, string> = {
  tattoo_studio: "#e9b22b",
  private_studio: "#db88b9",
  piercing_studio: "#e5e1d5",
  supply_shop: "#8a8a8a",
  other: "#8a8a8a",
};
const CATEGORY_COLOR_LIGHT: Record<MapLocationCategory, string> = {
  tattoo_studio: "#1e1e1e",
  private_studio: "#db88b9",
  piercing_studio: "#5b4a12",
  supply_shop: "#6b6b6b",
  other: "#6b6b6b",
};

function isDarkSurface(value: string): boolean {
  const hex = value.trim().replace("#", "");
  if (hex.length < 6) return false;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
}

function pinsToGeoJSON(pins: PublicMapPin[]) {
  return {
    type: "FeatureCollection" as const,
    features: pins.map((p) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
      properties: {
        id: p.id,
        name: p.name,
        category: p.category,
        claimed: p.claimed,
      },
    })),
  };
}

type Filter = "all" | MapLocationCategory | "watched";

export default function DiscoveryMapClient({
  journey,
  watchedIds: initialWatched,
}: {
  journey: TravelMapStop[];
  watchedIds: string[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const pinsRef = useRef<PublicMapPin[]>([]);
  const [pins, setPins] = useState<PublicMapPin[]>([]);
  const [capped, setCapped] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [showJourney, setShowJourney] = useState(false);
  const [selected, setSelected] = useState<PublicMapPin | null>(null);
  const [styleReady, setStyleReady] = useState(false);
  const [watched, setWatched] = useState<Set<string>>(
    () => new Set(initialWatched),
  );
  const [watchError, setWatchError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // The pin click handler (bound once at map init) reads the latest pins
  // through this ref at event time.
  useEffect(() => {
    pinsRef.current = pins;
  }, [pins]);

  const visiblePins = useMemo(() => {
    if (filter === "all") return pins;
    if (filter === "watched") return pins.filter((p) => watched.has(p.id));
    return pins.filter((p) => p.category === filter);
  }, [pins, filter, watched]);

  // Map init: one effect, cleanup on unmount. Data refresh happens on
  // moveend via the fetch below; filters re-slice the last fetch.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const isDark = isDarkSurface(
      getComputedStyle(container).getPropertyValue("--background"),
    );
    const scheme = isDark ? "dark" : "light";
    const ink = mapInk(scheme);
    const categoryColors = isDark ? CATEGORY_COLOR_DARK : CATEGORY_COLOR_LIGHT;

    const map = new maplibregl.Map({
      container,
      style: brandMapStyle(scheme) as maplibregl.StyleSpecification,
      center: [13.405, 52.52],
      zoom: 3,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl());

    let abort: AbortController | null = null;
    let debounce: ReturnType<typeof setTimeout> | null = null;

    const fetchViewport = () => {
      const b = map.getBounds();
      abort?.abort();
      abort = new AbortController();
      // Always fetch every category in the viewport and slice client-side:
      // filter chips then never need a refetch, and a category switch can
      // never re-slice an already-narrowed dataset into false emptiness.
      //
      // MapLibre bounds come back with UNWRAPPED longitudes (panning across
      // the date line keeps growing them), so wrap each edge; a viewport
      // that spans the antimeridian or the whole world falls back to the
      // full longitude range (over-fetch, capped server-side) instead of a
      // west >= east box the API would reject.
      const wrapLng = (l: number) => ((((l + 180) % 360) + 360) % 360) - 180;
      let west = wrapLng(b.getWest());
      let east = wrapLng(b.getEast());
      if (b.getEast() - b.getWest() >= 360 || west >= east) {
        west = -180;
        east = 180;
      }
      const params = new URLSearchParams({
        west: String(west),
        south: String(Math.max(-90, b.getSouth())),
        east: String(east),
        north: String(Math.min(90, b.getNorth())),
      });
      fetch(`/api/map/locations?${params.toString()}`, {
        signal: abort.signal,
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((body: { pins: PublicMapPin[]; capped: boolean } | null) => {
          if (!body) return;
          setPins(body.pins);
          setCapped(body.capped);
        })
        .catch(() => {
          // Aborted or offline: keep the last data on screen.
        });
    };
    const scheduleFetch = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(fetchViewport, 300);
    };

    map.on("load", () => {
      setStyleReady(true);
      map.addSource("pins", {
        type: "geojson",
        data: pinsToGeoJSON([]),
        cluster: true,
        clusterRadius: 44,
        clusterMaxZoom: 13,
      });
      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "pins",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": ink.planned,
          "circle-radius": ["step", ["get", "point_count"], 14, 10, 18, 50, 24],
          "circle-stroke-width": 2,
          "circle-stroke-color": ink.markerBorder,
        },
      });
      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "pins",
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": ["Open Sans Regular"],
          "text-size": 12,
        },
        paint: { "text-color": ink.onActive },
      });
      map.addLayer({
        id: "pin-points",
        type: "circle",
        source: "pins",
        filter: ["!", ["has", "point_count"]],
        paint: {
          // A valid MapLibre match expression; the spread defeats the
          // library's tuple typing, hence the cast.
          "circle-color": [
            "match",
            ["get", "category"],
            ...Object.entries(categoryColors).flat(),
            ink.planned,
          ] as unknown as maplibregl.DataDrivenPropertyValueSpecification<string>,
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 4, 12, 8],
          "circle-stroke-width": ["case", ["get", "claimed"], 2.5, 1],
          "circle-stroke-color": ink.markerBorder,
        },
      });
      map.addLayer({
        id: "pin-labels",
        type: "symbol",
        source: "pins",
        filter: ["!", ["has", "point_count"]],
        minzoom: 10,
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["Open Sans Regular"],
          "text-size": 11,
          "text-offset": [0, 1.1],
          "text-anchor": "top",
          "text-optional": true,
        },
        paint: {
          "text-color": isDark ? "#e5e1d5" : "#1e1e1e",
          "text-halo-color": isDark ? "#1e1e1e" : "rgba(233,178,43,0.85)",
          "text-halo-width": 1.1,
        },
      });

      map.on("click", "clusters", (e) => {
        const feature = e.features?.[0];
        if (!feature) return;
        map.easeTo({
          center: (feature.geometry as GeoJSON.Point).coordinates as [
            number,
            number,
          ],
          zoom: map.getZoom() + 2,
        });
      });
      map.on("click", "pin-points", (e) => {
        const feature = e.features?.[0];
        if (!feature) return;
        const id = feature.properties?.id as string | undefined;
        const pin = pinsRef.current.find((p) => p.id === id);
        if (pin) {
          setSelected(pin);
          setWatchError(null);
        }
      });
      for (const layer of ["clusters", "pin-points"]) {
        map.on("mouseenter", layer, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", layer, () => {
          map.getCanvas().style.cursor = "";
        });
      }

      map.on("moveend", scheduleFetch);
      fetchViewport();
    });

    return () => {
      abort?.abort();
      if (debounce) clearTimeout(debounce);
      map.remove();
      mapRef.current = null;
    };
    // The map instance is created once; filter/watch state flows in through
    // refs and the data effect below.
  }, []);

  // Push the filtered pins into the source whenever the slice changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const source = map.getSource("pins") as
      | maplibregl.GeoJSONSource
      | undefined;
    source?.setData(pinsToGeoJSON(visiblePins));
  }, [visiblePins]);

  // Journey overlay: a simple line through the artist's own stops. Gated on
  // styleReady (set in the load handler) so a toggle during the initial
  // style load still renders once the map is ready.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    const stops = journey.filter(
      (s) => Number.isFinite(s.latitude) && Number.isFinite(s.longitude),
    );
    const existingLine = map.getLayer("journey-line");
    if (!showJourney || stops.length === 0) {
      if (existingLine) {
        map.removeLayer("journey-line");
        map.removeLayer("journey-points");
        map.removeSource("journey");
      }
      return;
    }
    if (existingLine) return;
    map.addSource("journey", {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: [
          // A LineString needs 2+ positions; a single stop stays a lone dot.
          ...(stops.length >= 2
            ? [
                {
                  type: "Feature" as const,
                  geometry: {
                    type: "LineString" as const,
                    coordinates: stops.map((s) => [s.longitude, s.latitude]),
                  },
                  properties: {},
                },
              ]
            : []),
          ...stops.map((s) => ({
            type: "Feature" as const,
            geometry: {
              type: "Point" as const,
              coordinates: [s.longitude, s.latitude],
            },
            properties: { name: s.name },
          })),
        ],
      },
    });
    map.addLayer({
      id: "journey-line",
      type: "line",
      source: "journey",
      filter: ["==", ["geometry-type"], "LineString"],
      paint: {
        "line-color": "#db88b9",
        "line-width": 2,
        "line-dasharray": [2, 1.5],
        "line-opacity": 0.9,
      },
    });
    map.addLayer({
      id: "journey-points",
      type: "circle",
      source: "journey",
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-color": "#db88b9",
        "circle-radius": 5,
        "circle-stroke-width": 1.5,
        "circle-stroke-color": "#1e1e1e",
      },
    });
  }, [showJourney, journey, styleReady]);

  const toggleWatch = (pin: PublicMapPin) => {
    setWatchError(null);
    startTransition(async () => {
      const result = await toggleWatchAction(pin.id);
      if (result.error) {
        setWatchError(result.error);
        return;
      }
      setWatched((prev) => {
        const next = new Set(prev);
        if (result.watched) next.add(pin.id);
        else next.delete(pin.id);
        return next;
      });
    });
  };

  const chip = (active: boolean) =>
    `rounded-full px-3 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
      active
        ? "bg-foreground text-background"
        : "bg-muted text-muted-foreground hover:text-foreground"
    }`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          className={chip(filter === "all")}
          onClick={() => setFilter("all")}
        >
          Everything
        </button>
        {(
          Object.entries(MAP_LOCATION_CATEGORY_LABELS) as Array<
            [MapLocationCategory, string]
          >
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={chip(filter === key)}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          className={chip(filter === "watched")}
          onClick={() => setFilter("watched")}
        >
          Watched
        </button>
        {journey.length > 0 ? (
          <button
            type="button"
            className={chip(showJourney)}
            onClick={() => setShowJourney((v) => !v)}
            aria-pressed={showJourney}
          >
            My trips
          </button>
        ) : null}
      </div>

      <div className="relative">
        <div
          ref={containerRef}
          className="h-[420px] w-full overflow-hidden rounded-2xl border border-border sm:h-[520px]"
          aria-label="Tattoo map"
        />
        {selected ? (
          <div className="absolute bottom-3 left-3 right-3 max-w-sm space-y-2 rounded-xl border border-border bg-background/95 p-3 shadow-lg backdrop-blur sm:right-auto">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {selected.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {MAP_LOCATION_CATEGORY_LABELS[selected.category]}
                  {selected.city ? ` · ${selected.city}` : ""}
                  {selected.claimed ? " · claimed" : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelected(null);
                  setWatchError(null);
                }}
                aria-label="Close"
                className="rounded-md px-1.5 text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>
            {watchError ? (
              <p className="text-xs text-brand-red">{watchError}</p>
            ) : null}
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => toggleWatch(selected)}
                className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted/30 disabled:opacity-50"
              >
                {watched.has(selected.id) ? "Watching ✓" : "Watch"}
              </button>
              <Link
                href={`/map/${selected.id}`}
                className="rounded-md bg-foreground px-3 py-1.5 text-xs text-background transition-opacity hover:opacity-90"
              >
                View details
              </Link>
            </div>
          </div>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">
        {visiblePins.length} {visiblePins.length === 1 ? "place" : "places"} in
        view
        {capped ? " (dense area, zoom in to see everything)" : ""}
        {filter === "watched" && visiblePins.length === 0
          ? " · watch studios from their pins to collect them here"
          : ""}
      </p>
    </div>
  );
}
