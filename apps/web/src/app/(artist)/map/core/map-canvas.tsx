"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  brandMapStyle,
  mapInk,
  type MapScheme,
} from "@inklee/shared/map-style";
import {
  type MapLocationCategory,
  type PublicArtistCity,
  type PublicMapPin,
} from "@inklee/shared/map-directory";
import type { TravelMapStop } from "@inklee/shared/travel-map";
import type { MapFilterKind, MapViewport } from "@inklee/shared/map-core-state";

// The ONE rendering engine for the map redesign. This is the discovery map's
// proven, founder-tuned MapLibre setup (2026-07-20 colors, no client
// clustering, the Q7 signal ring, labels minzoom 10) lifted verbatim out of
// the boxed discovery-map-client into a reusable canvas that reports viewport
// changes and selections up, and exposes an imperative flyTo. Every shell
// (immersive, and later public) renders through this one component; the boxed
// discovery-map-client stays as the flag-off path until this is verified, then
// retires.

// Category ink on the branded base (dark: mustard/rosa/bone; light: charcoal
// family). Kept in lockstep with the legacy client until it is removed.
const CATEGORY_COLOR_DARK: Record<MapLocationCategory, string> = {
  tattoo_studio: "#e9b22b",
  private_studio: "#db88b9",
  piercing_studio: "#8a8a8a",
  supply_shop: "#8a8a8a",
  other: "#8a8a8a",
};
const CATEGORY_COLOR_LIGHT: Record<MapLocationCategory, string> = {
  tattoo_studio: "#1e1e1e",
  private_studio: "#db88b9",
  piercing_studio: "#6b6b6b",
  supply_shop: "#6b6b6b",
  other: "#6b6b6b",
};

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
        hasSignal: p.signal !== null,
      },
    })),
  };
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export type MapCanvasHandle = {
  /** Ease to a point (search hit, deep link, list row). Honors reduced motion. */
  flyTo: (lng: number, lat: number, zoom?: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
};

export type MapCanvasStats = {
  visibleCount: number;
  total: number;
  capped: boolean;
};

type Props = {
  /** Dark/light basemap. The shell remounts the canvas (key=scheme) on toggle. */
  scheme: MapScheme;
  /** Camera at mount (from the URL). Read once; later moves flow via onViewChange. */
  initialView: MapViewport;
  filter: MapFilterKind;
  watched: ReadonlySet<string>;
  journey: TravelMapStop[];
  showJourney: boolean;
  artistCities: PublicArtistCity[];
  onSelectPin: (pin: PublicMapPin) => void;
  onSelectCity: (city: PublicArtistCity) => void;
  onViewChange: (view: MapViewport) => void;
  onStats: (stats: MapCanvasStats) => void;
  /** The current filtered in-view pins, so the list view shares one dataset. */
  onPins: (pins: PublicMapPin[]) => void;
};

function MapCanvasInner(
  {
    scheme,
    initialView,
    filter,
    watched,
    journey,
    showJourney,
    artistCities,
    onSelectPin,
    onSelectCity,
    onViewChange,
    onStats,
    onPins,
  }: Props,
  ref: React.Ref<MapCanvasHandle>,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const pinsRef = useRef<PublicMapPin[]>([]);
  const [pins, setPins] = useState<PublicMapPin[]>([]);
  const [capped, setCapped] = useState(false);
  const [totalInView, setTotalInView] = useState(0);
  const [styleReady, setStyleReady] = useState(false);

  // Event handlers are bound once at map init; the latest callbacks + data are
  // read through refs at event time (the discovery-map pattern).
  const artistCitiesRef = useRef<PublicArtistCity[]>([]);
  const onSelectPinRef = useRef(onSelectPin);
  const onSelectCityRef = useRef(onSelectCity);
  const onViewChangeRef = useRef(onViewChange);
  const onStatsRef = useRef(onStats);
  const onPinsRef = useRef(onPins);
  useEffect(() => {
    pinsRef.current = pins;
  }, [pins]);
  useEffect(() => {
    artistCitiesRef.current = artistCities;
  }, [artistCities]);
  useEffect(() => {
    onSelectPinRef.current = onSelectPin;
    onSelectCityRef.current = onSelectCity;
    onViewChangeRef.current = onViewChange;
    onStatsRef.current = onStats;
    onPinsRef.current = onPins;
  });

  useImperativeHandle(
    ref,
    () => ({
      flyTo: (lng: number, lat: number, zoom?: number) => {
        const map = mapRef.current;
        if (!map) return;
        map.easeTo({
          center: [lng, lat],
          zoom: zoom ?? Math.max(map.getZoom(), 14),
          duration: prefersReducedMotion() ? 0 : 800,
        });
      },
      zoomIn: () => {
        mapRef.current?.zoomIn({ duration: prefersReducedMotion() ? 0 : 300 });
      },
      zoomOut: () => {
        mapRef.current?.zoomOut({ duration: prefersReducedMotion() ? 0 : 300 });
      },
    }),
    [],
  );

  const visiblePins = useMemo(() => {
    if (filter === "all") return pins;
    if (filter === "watched") return pins.filter((p) => watched.has(p.id));
    if (filter === "signals") return pins.filter((p) => p.signal !== null);
    return pins.filter((p) => p.category === filter);
  }, [pins, filter, watched]);

  // Report the visible/total/capped stats up for the footer text. Callbacks
  // read through a ref so a new function identity each render can't loop.
  useEffect(() => {
    onStatsRef.current({
      visibleCount: visiblePins.length,
      total: totalInView,
      capped,
    });
  }, [visiblePins.length, totalInView, capped]);

  // Share the exact filtered in-view pins with the shell so the list view uses
  // one dataset (one query, one filter) with the map.
  useEffect(() => {
    onPinsRef.current(visiblePins);
  }, [visiblePins]);

  // Map init: one effect, cleanup on unmount. Data refresh on moveend; filters
  // re-slice the last fetch (no refetch on a chip toggle).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const isDark = scheme === "dark";
    const ink = mapInk(scheme);
    const categoryColors = isDark ? CATEGORY_COLOR_DARK : CATEGORY_COLOR_LIGHT;

    const map = new maplibregl.Map({
      container,
      // The shell renders a custom attribution pill (so it aligns with the
      // in-view count and the map/list toggle); disable the built-in one.
      attributionControl: false,
      style: brandMapStyle(scheme) as maplibregl.StyleSpecification,
      center: [initialView.lng, initialView.lat],
      zoom: initialView.zoom,
    });
    mapRef.current = map;

    let abort: AbortController | null = null;
    let debounce: ReturnType<typeof setTimeout> | null = null;

    const fetchViewport = () => {
      const b = map.getBounds();
      abort?.abort();
      abort = new AbortController();
      // MapLibre bounds come back with UNWRAPPED longitudes; wrap each edge and
      // fall back to the full range across the antimeridian / whole world.
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
        zoom: String(map.getZoom()),
      });
      fetch(`/api/map/locations?${params.toString()}`, {
        signal: abort.signal,
      })
        .then((r) => (r.ok ? r.json() : null))
        .then(
          (
            body: {
              pins: PublicMapPin[];
              capped: boolean;
              total?: number;
            } | null,
          ) => {
            if (!body) return;
            setPins(body.pins);
            setCapped(body.capped);
            setTotalInView(body.total ?? body.pins.length);
          },
        )
        .catch(() => {
          // Aborted or offline: keep the last data on screen.
        });
    };
    const scheduleFetch = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(fetchViewport, 300);
    };

    const emitViewChange = () => {
      const c = map.getCenter();
      onViewChangeRef.current({ lng: c.lng, lat: c.lat, zoom: map.getZoom() });
    };

    map.on("load", () => {
      setStyleReady(true);
      // Founder call 2026-07-20: no client-side clustering. The server samples
      // one representative studio per grid cell (grid sized by zoom).
      map.addSource("pins", {
        type: "geojson",
        data: pinsToGeoJSON([]),
        cluster: false,
      });
      // Temporary-signal ring (Q7): a rosa halo behind the pin, zoomed-in only.
      map.addLayer({
        id: "signal-rings",
        type: "circle",
        source: "pins",
        filter: [
          "all",
          ["!", ["has", "point_count"]],
          ["==", ["get", "hasSignal"], true],
        ],
        minzoom: 12,
        paint: {
          "circle-color": "rgba(0,0,0,0)",
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 6, 12, 7],
          "circle-stroke-width": 4,
          "circle-stroke-color": "rgba(219,136,185,0.8)",
        },
      });
      map.addLayer({
        id: "pin-points",
        type: "circle",
        source: "pins",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": [
            "match",
            ["get", "category"],
            ...Object.entries(categoryColors).flat(),
            ink.planned,
          ] as unknown as maplibregl.DataDrivenPropertyValueSpecification<string>,
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 6, 12, 7],
          "circle-stroke-width": 0,
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

      // Artists-in-town city badges: rosa circles with the anonymous count.
      map.addSource("artist-cities", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "artist-city-circles",
        type: "circle",
        source: "artist-cities",
        paint: {
          "circle-color": "#db88b9",
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["get", "count"],
            3,
            10,
            30,
            18,
          ],
          "circle-opacity": 0.85,
          "circle-stroke-width": 1.5,
          "circle-stroke-color": ink.markerBorder,
        },
      });
      map.addLayer({
        id: "artist-city-counts",
        type: "symbol",
        source: "artist-cities",
        layout: {
          "text-field": ["get", "count"],
          "text-font": ["Open Sans Regular"],
          "text-size": 11,
          "text-allow-overlap": true,
        },
        paint: { "text-color": "#1e1e1e" },
      });
      map.on("click", "artist-city-circles", (e) => {
        const feature = e.features?.[0];
        if (!feature) return;
        const key = feature.properties?.cityKey as string | undefined;
        const city = artistCitiesRef.current.find((c) => c.cityKey === key);
        if (city) onSelectCityRef.current(city);
      });
      map.on("mouseenter", "artist-city-circles", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "artist-city-circles", () => {
        map.getCanvas().style.cursor = "";
      });

      // City badges render on top and win clicks: the pin handler bails when a
      // city badge sits under the cursor.
      const cityBadgeUnderCursor = (point: maplibregl.PointLike) =>
        map.queryRenderedFeatures(point, {
          layers: ["artist-city-circles"],
        }).length > 0;

      map.on("click", "pin-points", (e) => {
        if (cityBadgeUnderCursor(e.point)) return;
        const feature = e.features?.[0];
        if (!feature) return;
        const id = feature.properties?.id as string | undefined;
        const pin = pinsRef.current.find((p) => p.id === id);
        if (pin) onSelectPinRef.current(pin);
      });
      map.on("mouseenter", "pin-points", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "pin-points", () => {
        map.getCanvas().style.cursor = "";
      });

      map.on("moveend", () => {
        scheduleFetch();
        emitViewChange();
      });
      fetchViewport();
    });

    return () => {
      abort?.abort();
      if (debounce) clearTimeout(debounce);
      map.remove();
      mapRef.current = null;
    };
    // Created once; state flows in through refs and the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Push the artist city aggregates into their source.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    const source = map.getSource("artist-cities") as
      | maplibregl.GeoJSONSource
      | undefined;
    source?.setData({
      type: "FeatureCollection",
      features: artistCities.map((c) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [c.lng, c.lat] },
        properties: { cityKey: c.cityKey, count: c.count },
      })),
    });
  }, [artistCities, styleReady]);

  // Journey overlay: a simple line through the artist's own stops.
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

  return (
    <div ref={containerRef} className="h-full w-full" aria-label="Tattoo map" />
  );
}

const MapCanvas = forwardRef<MapCanvasHandle, Props>(MapCanvasInner);
export default MapCanvas;
