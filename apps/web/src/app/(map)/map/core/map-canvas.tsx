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
import {
  normalizeViewportBounds,
  viewportRequestQuery,
  type MapFilterKind,
  type MapViewport,
} from "@inklee/shared/map-core-state";

// The ONE rendering engine for the map redesign. This is the discovery map's
// proven, founder-tuned MapLibre setup (2026-07-20 colors, no client
// clustering, the Q7 signal ring, labels minzoom 10) lifted verbatim out of
// the retired boxed discovery client into a reusable canvas that reports
// viewport changes and selections upward. The immersive shell is the only
// consumer today; the future public shell renders through this same core.

// Category ink on the branded base (dark: mustard/rosa/bone; light: charcoal
// family).
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
  /** Re-run the viewport fetch (the shell's retry after a failed load). */
  refetchPins: () => void;
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
  /**
   * Anonymous plane (go-live plan S2): the viewport fetch quantizes its
   * request URL (grid-snapped bounds, integer zoom) so the CDN-cached public
   * responses actually collide; the authed plane keeps raw bounds because its
   * responses are never shared-cached.
   */
  publicPlane: boolean;
  /**
   * Fired with true when a viewport fetch fails (non-ok or network), false on
   * the next success. The shell renders the retry state; the canvas keeps the
   * last data so the map never silently empties.
   */
  onPinsError?: (failed: boolean) => void;
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
    publicPlane,
    onPinsError,
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
  const onPinsErrorRef = useRef(onPinsError);
  // The viewport fetch is defined inside the init effect; the handle's
  // refetchPins reaches it through this ref.
  const fetchViewportRef = useRef<() => void>(() => {});
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
    onPinsErrorRef.current = onPinsError;
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
      refetchPins: () => {
        fetchViewportRef.current();
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
      // Touch-friendly: a two-finger pinch must never accidentally rotate or
      // pitch the map (there is no compass control to recover from it).
      dragRotate: false,
      pitchWithRotate: false,
    });
    map.touchZoomRotate.disableRotation();
    map.touchPitch.disable();
    // Keyboard rotate/pitch too (Shift+arrows): same no-compass invariant.
    map.keyboard.disableRotation();
    mapRef.current = map;

    let abort: AbortController | null = null;
    let debounce: ReturnType<typeof setTimeout> | null = null;

    const fetchViewport = () => {
      const b = map.getBounds();
      abort?.abort();
      abort = new AbortController();
      // MapLibre bounds come back with UNWRAPPED longitudes; the shared helper
      // wraps each edge, falls back to the full range across the antimeridian /
      // whole world, and clamps latitudes (same normalization as native).
      const nb = normalizeViewportBounds(
        b.getWest(),
        b.getSouth(),
        b.getEast(),
        b.getNorth(),
      );
      // Public plane: quantize the request so shared-cache keys collide
      // (grid-snapped superset bbox + integer zoom); extra pins land
      // offscreen. Authed plane: raw bounds, responses are never shared.
      const q = viewportRequestQuery(nb, map.getZoom(), publicPlane);
      const params = new URLSearchParams({
        west: String(q.west),
        south: String(q.south),
        east: String(q.east),
        north: String(q.north),
        zoom: String(q.zoom),
      });
      fetch(`/api/map/locations?${params.toString()}`, {
        signal: abort.signal,
      })
        .then((r) => {
          if (!r.ok) throw new Error(`pins_${r.status}`);
          return r.json();
        })
        .then(
          (body: { pins: PublicMapPin[]; capped: boolean; total?: number }) => {
            setPins(body.pins);
            setCapped(body.capped);
            setTotalInView(body.total ?? body.pins.length);
            onPinsErrorRef.current?.(false);
          },
        )
        .catch((err: unknown) => {
          // Aborted (a newer viewport superseded this fetch): not an error.
          if (err instanceof DOMException && err.name === "AbortError") return;
          // Keep the last data on screen, but SAY it failed: the silently
          // empty map was the historical failure mode (go-live plan S2).
          onPinsErrorRef.current?.(true);
        });
    };
    fetchViewportRef.current = fetchViewport;
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
      map.on("mouseenter", "artist-city-circles", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "artist-city-circles", () => {
        map.getCanvas().style.cursor = "";
      });
      map.on("mouseenter", "pin-points", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "pin-points", () => {
        map.getCanvas().style.cursor = "";
      });

      // ONE padded click handler for both layers. The rendered circles are only
      // ~12-18px, far under the ~44px touch guideline, so an exact layer hit
      // makes pins nearly untappable on phones. Selection order:
      //   1. a badge EXACTLY under the point keeps its render-on-top priority
      //      (the pre-padding behavior: a direct badge click always wins);
      //   2. otherwise query a padded box (12px on coarse pointers, 4px on
      //      mouse so desktop precision is preserved) across BOTH layers and
      //      pick the overall nearest feature — a nearby badge must not steal
      //      a click that lands closer to a pin.
      const selectCityFeature = (feature: maplibregl.MapGeoJSONFeature) => {
        const key = feature.properties?.cityKey as string | undefined;
        const city = artistCitiesRef.current.find((c) => c.cityKey === key);
        if (city) onSelectCityRef.current(city);
      };
      const selectPinFeature = (feature: maplibregl.MapGeoJSONFeature) => {
        const id = feature.properties?.id as string | undefined;
        const pin = pinsRef.current.find((p) => p.id === id);
        if (pin) onSelectPinRef.current(pin);
      };
      const nearestFeature = (
        features: maplibregl.MapGeoJSONFeature[],
        point: maplibregl.Point,
      ) => {
        let best: maplibregl.MapGeoJSONFeature | null = null;
        let bestDist = Infinity;
        for (const f of features) {
          if (f.geometry.type !== "Point") continue;
          const p = map.project(f.geometry.coordinates as [number, number]);
          const d = (p.x - point.x) ** 2 + (p.y - point.y) ** 2;
          if (d < bestDist) {
            bestDist = d;
            best = f;
          }
        }
        return best;
      };
      map.on("click", (e) => {
        const exactCity = map.queryRenderedFeatures(e.point, {
          layers: ["artist-city-circles"],
        });
        if (exactCity.length > 0) {
          selectCityFeature(exactCity[0]);
          return;
        }
        const pad = window.matchMedia?.("(pointer: coarse)").matches ? 12 : 4;
        const box: [maplibregl.PointLike, maplibregl.PointLike] = [
          [e.point.x - pad, e.point.y - pad],
          [e.point.x + pad, e.point.y + pad],
        ];
        const candidates = map.queryRenderedFeatures(box, {
          layers: ["artist-city-circles", "pin-points"],
        });
        const best = nearestFeature(candidates, e.point);
        if (!best) return;
        if (best.layer.id === "artist-city-circles") {
          selectCityFeature(best);
        } else {
          selectPinFeature(best);
        }
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
