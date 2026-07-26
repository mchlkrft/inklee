import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Linking,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  Camera,
  GeoJSONSource,
  Layer,
  Map as MLMap,
  type PressEventWithFeatures,
} from "@maplibre/maplibre-react-native";
import type { NativeSyntheticEvent } from "react-native";
import { Eye, Search, SlidersHorizontal, X } from "lucide-react-native";
import {
  MAP_LOCATION_CATEGORY_LABELS,
  type PublicArtistCity,
  type PublicMapPin,
} from "@inklee/shared/map-directory";
import {
  DEFAULT_MAP_VIEWPORT,
  MAP_FILTER_KINDS,
  filterCategory,
  normalizeViewportBounds,
  type MapFilterKind,
} from "@inklee/shared/map-core-state";
import {
  STUDIO_SIGNAL_LABELS,
  isStudioSignalType,
} from "@inklee/shared/studio-signals";
import type {
  MobileMapArtistsResponse,
  MobileMapLocationsResponse,
  MobileMapSearchResponse,
  MobileMapWatchedResponse,
  MobileMapWatchResult,
} from "@inklee/shared/mobile-api";
import { Screen } from "@/components/Screen";
import { AdaptiveSheet } from "@/components/AdaptiveSheet";
import { useQueryClient } from "@tanstack/react-query";
import {
  apiGet,
  apiPost,
  invalidateByPathPrefix,
  useApiQuery,
} from "@/lib/api";
import { useCapability } from "@/lib/capabilities";
import { brandMapStyle } from "@/lib/map-style";
import { useColors, useThemePreference } from "@/lib/theme";
import MapDetailSheet from "@/components/map/MapDetailSheet";

// The native tattoo map (discovery surface): the same shared map core the web
// immersive shell renders — one basemap (brandMapStyle), one pin vocabulary
// (PublicMapPin + categories + signals), one filter model (MapFilterKind) —
// as a thin native capability shell. Personal travel stays on its own screen
// (travel/map); this screen is the 71k-studio directory. Killable via the
// tattoo_map capability (client hides, server refuses).

const FILTER_LABELS: Record<MapFilterKind, string> = {
  all: "Everything",
  tattoo_studio: MAP_LOCATION_CATEGORY_LABELS.tattoo_studio,
  private_studio: MAP_LOCATION_CATEGORY_LABELS.private_studio,
  piercing_studio: MAP_LOCATION_CATEGORY_LABELS.piercing_studio,
  supply_shop: MAP_LOCATION_CATEGORY_LABELS.supply_shop,
  other: MAP_LOCATION_CATEGORY_LABELS.other,
  watched: "Watched",
  signals: "Signals",
};

// Category ink, kept in lockstep with the web canvas (core/map-canvas.tsx).
const CATEGORY_COLOR_DARK: Record<string, string> = {
  tattoo_studio: "#e9b22b",
  private_studio: "#db88b9",
  piercing_studio: "#8a8a8a",
  supply_shop: "#8a8a8a",
  other: "#8a8a8a",
};
const CATEGORY_COLOR_LIGHT: Record<string, string> = {
  tattoo_studio: "#1e1e1e",
  private_studio: "#db88b9",
  piercing_studio: "#6b6b6b",
  supply_shop: "#6b6b6b",
  other: "#6b6b6b",
};

type ViewStateEvent = {
  center: [number, number];
  zoom: number;
  bounds: [number, number, number, number];
};

function pinsToGeoJSON(pins: PublicMapPin[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: pins.map((p) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      properties: {
        id: p.id,
        name: p.name,
        category: p.category,
        hasSignal: p.signal !== null,
      },
    })),
  };
}

function citiesToGeoJSON(
  cities: PublicArtistCity[],
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: cities.map((c) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [c.lng, c.lat] },
      properties: { cityKey: c.cityKey, count: c.count },
    })),
  };
}

export default function DiscoverMapScreen() {
  const colors = useColors();
  const { scheme } = useThemePreference();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  // Typed capability read (the capabilities module owns all flag names). When
  // killed, the queries below stay disabled so a paused fleet stops hitting
  // the very routes the kill is meant to relieve.
  const mapEnabled = useCapability("tattoo_map");

  const [pins, setPins] = useState<PublicMapPin[]>([]);
  const [total, setTotal] = useState(0);
  const [capped, setCapped] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState<MapFilterKind>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [selected, setSelected] = useState<PublicMapPin | null>(null);
  const [selectedCity, setSelectedCity] = useState<PublicArtistCity | null>(
    null,
  );
  const [detailOpen, setDetailOpen] = useState(false);
  const [watched, setWatched] = useState<Set<string>>(new Set());
  const [watchPending, setWatchPending] = useState(false);
  const [watchError, setWatchError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PublicMapPin[] | null>(null);
  const [camera, setCamera] = useState<{
    center: [number, number];
    zoom: number;
  }>({
    center: [DEFAULT_MAP_VIEWPORT.lng, DEFAULT_MAP_VIEWPORT.lat],
    zoom: DEFAULT_MAP_VIEWPORT.zoom,
  });

  const artists = useApiQuery<MobileMapArtistsResponse>("/map/artists", {
    enabled: mapEnabled,
  });
  const watchedQuery = useApiQuery<MobileMapWatchedResponse>("/map/watched", {
    enabled: mapEnabled,
  });
  useEffect(() => {
    if (watchedQuery.data) setWatched(new Set(watchedQuery.data.ids));
  }, [watchedQuery.data]);

  // Viewport pins: fetched on region change (debounced), like the web canvas.
  const fetchSeq = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchViewport = useCallback((view: ViewStateEvent) => {
    // Native MapLibre serializes bounds RAW (unwrapped longitudes); the shared
    // helper wraps/clamps them exactly like the web canvas, or the server
    // would 400 on antimeridian-crossing and world-spanning viewports.
    const [rawWest, rawSouth, rawEast, rawNorth] = view.bounds;
    const b = normalizeViewportBounds(rawWest, rawSouth, rawEast, rawNorth);
    const seq = ++fetchSeq.current;
    const params = new URLSearchParams({
      west: String(b.west),
      south: String(b.south),
      east: String(b.east),
      north: String(b.north),
      zoom: String(Math.round(view.zoom)),
    });
    apiGet<MobileMapLocationsResponse>(`/map/locations?${params.toString()}`)
      .then((body) => {
        if (seq !== fetchSeq.current) return; // stale response
        setPins(body.pins);
        setTotal(body.total);
        setCapped(body.capped);
        setLoadError(false);
      })
      .catch(() => {
        if (seq === fetchSeq.current) setLoadError(true);
      });
  }, []);
  const onRegionDidChange = useCallback(
    (e: NativeSyntheticEvent<ViewStateEvent>) => {
      const view = e.nativeEvent;
      if (!view?.bounds) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => fetchViewport(view), 300);
    },
    [fetchViewport],
  );
  useEffect(() => {
    if (!mapEnabled) return;
    // Initial fetch for the default camera (Europe at zoom 3): a whole-world
    // bbox keeps it simple and the server grid-samples anyway.
    fetchViewport({
      center: [DEFAULT_MAP_VIEWPORT.lng, DEFAULT_MAP_VIEWPORT.lat],
      zoom: DEFAULT_MAP_VIEWPORT.zoom,
      bounds: [-180, -75, 180, 78],
    });
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [fetchViewport, mapEnabled]);

  // One dataset, one filter (the web shell's rule): slice the last fetch.
  const visiblePins = useMemo(() => {
    if (filter === "all") return pins;
    if (filter === "watched") return pins.filter((p) => watched.has(p.id));
    if (filter === "signals") return pins.filter((p) => p.signal !== null);
    const category = filterCategory(filter);
    return category ? pins.filter((p) => p.category === category) : pins;
  }, [pins, filter, watched]);

  // Search: debounced autosuggest against the shared search RPC. The seq
  // guard drops in-flight responses once the query changed or was cleared —
  // without it a slow response could re-open the dropdown with stale results.
  const searchSeq = useRef(0);
  useEffect(() => {
    const seq = ++searchSeq.current;
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      return;
    }
    const t = setTimeout(() => {
      apiGet<MobileMapSearchResponse>(`/map/search?q=${encodeURIComponent(q)}`)
        .then((body) => {
          if (seq === searchSeq.current) setResults(body.results);
        })
        .catch(() => {
          if (seq === searchSeq.current) setResults([]);
        });
    }, 180);
    return () => clearTimeout(t);
  }, [query]);

  const pickSearchResult = (pin: PublicMapPin) => {
    searchSeq.current++; // drop any in-flight autosuggest response
    setQuery("");
    setResults(null);
    setFilter("all");
    setWatchError(null);
    setSelected(pin);
    setSelectedCity(null);
    setCamera({ center: [pin.lng, pin.lat], zoom: 14 });
  };

  const toggleWatch = async (pin: PublicMapPin) => {
    if (watchPending) return;
    setWatchPending(true);
    setWatchError(null);
    try {
      const r = await apiPost<MobileMapWatchResult>(
        `/map/locations/${pin.id}/watch`,
      );
      setWatched((prev) => {
        const next = new Set(prev);
        if (r.watched) next.add(pin.id);
        else next.delete(pin.id);
        return next;
      });
    } catch {
      // No optimistic update to revert; surface the miss and re-sync the
      // cached watched list (refetchOnWindowFocus is off globally).
      setWatchError("Could not update your watched list.");
      invalidateByPathPrefix(queryClient, ["/map/watched"]);
    } finally {
      setWatchPending(false);
    }
  };

  // GeoJSON sources: memoized so the native map only receives setData when
  // the underlying pins/cities actually change, not on every unrelated
  // re-render (search keystrokes, sheet toggles) — 3000 features per send.
  const cities = useMemo(
    () => artists.data?.cities ?? [],
    [artists.data?.cities],
  );
  const citiesData = useMemo(() => citiesToGeoJSON(cities), [cities]);
  const pinsData = useMemo(() => pinsToGeoJSON(visiblePins), [visiblePins]);

  const onCityPress = useCallback(
    (e: NativeSyntheticEvent<PressEventWithFeatures>) => {
      const f = e.nativeEvent.features[0];
      const key = f?.properties?.cityKey as string | undefined;
      const city = cities.find((c) => c.cityKey === key);
      if (city) {
        e.stopPropagation();
        setWatchError(null);
        setSelected(null);
        setSelectedCity(city);
      }
    },
    [cities],
  );
  const onPinPress = useCallback(
    (e: NativeSyntheticEvent<PressEventWithFeatures>) => {
      const f = e.nativeEvent.features[0];
      const id = f?.properties?.id as string | undefined;
      const pin = visiblePins.find((p) => p.id === id);
      if (pin) {
        e.stopPropagation();
        setWatchError(null);
        setSelectedCity(null);
        setSelected(pin);
      }
    },
    [visiblePins],
  );

  // Kill switch: the server refuses too; this is the friendly half.
  if (!mapEnabled) {
    return (
      <Screen edges={["left", "right"]}>
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-center text-sm text-shell-mute">
            The tattoo map is temporarily unavailable. Try again later.
          </Text>
        </View>
      </Screen>
    );
  }

  const categoryColors =
    scheme === "dark" ? CATEGORY_COLOR_DARK : CATEGORY_COLOR_LIGHT;
  const mapStyle = JSON.stringify(brandMapStyle(scheme));

  return (
    <Screen edges={["left", "right"]} padded={false}>
      <View className="flex-1">
        <MLMap
          mapStyle={mapStyle}
          style={{ flex: 1 }}
          onRegionDidChange={onRegionDidChange}
        >
          <Camera
            center={camera.center}
            zoom={camera.zoom}
            duration={600}
            easing="ease"
          />

          {/* Artist city badges (rosa, floored counts) — render under pins. */}
          <GeoJSONSource id="cities" data={citiesData} onPress={onCityPress}>
            <Layer
              id="artist-city-circles"
              type="circle"
              paint={{
                "circle-color": "#db88b9",
                "circle-opacity": 0.85,
                "circle-radius": [
                  "interpolate",
                  ["linear"],
                  ["get", "count"],
                  3,
                  10,
                  30,
                  18,
                ],
              }}
            />
            <Layer
              id="artist-city-counts"
              type="symbol"
              layout={{
                "text-field": ["get", "count"],
                "text-font": ["Open Sans Regular"],
                "text-size": 11,
                "text-allow-overlap": true,
              }}
              paint={{ "text-color": "#1e1e1e" }}
            />
          </GeoJSONSource>

          {/* Studio pins: signal ring + category-inked dot + zoomed-in label,
              the exact web layer specs (default 44px source hitbox = touch
              targets for free). */}
          <GeoJSONSource id="pins" data={pinsData} onPress={onPinPress}>
            <Layer
              id="signal-rings"
              type="circle"
              minzoom={12}
              filter={["==", ["get", "hasSignal"], true]}
              paint={{
                "circle-color": "rgba(0,0,0,0)",
                "circle-stroke-color": "rgba(219,136,185,0.8)",
                "circle-stroke-width": 4,
                "circle-radius": [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  4,
                  6,
                  12,
                  7,
                ],
              }}
            />
            <Layer
              id="pin-points"
              type="circle"
              paint={{
                "circle-color": [
                  "match",
                  ["get", "category"],
                  "tattoo_studio",
                  categoryColors.tattoo_studio,
                  "private_studio",
                  categoryColors.private_studio,
                  "piercing_studio",
                  categoryColors.piercing_studio,
                  "supply_shop",
                  categoryColors.supply_shop,
                  categoryColors.other,
                ],
                "circle-radius": [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  4,
                  6,
                  12,
                  7,
                ],
                "circle-stroke-width": 1.5,
                "circle-stroke-color":
                  scheme === "dark" ? "#1e1e1e" : "#e5e1d5",
              }}
            />
            <Layer
              id="pin-labels"
              type="symbol"
              minzoom={10}
              layout={{
                "text-field": ["get", "name"],
                "text-font": ["Open Sans Regular"],
                "text-size": 11,
                "text-offset": [0, 1.1],
                "text-anchor": "top",
                "text-optional": true,
              }}
              paint={{
                "text-color": scheme === "dark" ? "#e5e1d5" : "#1e1e1e",
              }}
            />
          </GeoJSONSource>
        </MLMap>

        {/* Top overlay: search + filter. */}
        <View
          style={{ position: "absolute", top: 12, left: 12, right: 12 }}
          className="flex-row items-center gap-2"
        >
          <View className="h-11 flex-1 flex-row items-center gap-2 rounded-full border border-shell-border bg-chrome px-4">
            <Search size={16} color={colors.shell.mute} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search studios by name or city"
              placeholderTextColor={colors.shell.mute}
              autoCorrect={false}
              autoCapitalize="none"
              className="min-w-0 flex-1 text-base text-foreground"
              style={{ paddingVertical: 0 }}
            />
            {query.length > 0 ? (
              <Pressable hitSlop={8} onPress={() => setQuery("")}>
                <X size={16} color={colors.shell.mute} />
              </Pressable>
            ) : null}
          </View>
          <Pressable
            onPress={() => setFilterOpen(true)}
            accessibilityLabel={
              filter === "all" ? "Filter places" : `Filter: ${FILTER_LABELS[filter]}`
            }
            className={`h-11 w-11 items-center justify-center rounded-full border ${
              filter !== "all"
                ? "border-transparent bg-mustard"
                : "border-shell-border bg-chrome"
            }`}
          >
            <SlidersHorizontal
              size={16}
              color={filter !== "all" ? "#1e1e1e" : colors.bone}
            />
          </Pressable>
        </View>

        {/* Search results dropdown. */}
        {results ? (
          <View
            style={{ position: "absolute", top: 62, left: 12, right: 12 }}
            className="max-h-72 rounded-2xl border border-shell-border bg-card"
          >
            <ScrollView keyboardShouldPersistTaps="handled">
              {results.length === 0 ? (
                <Text className="px-4 py-3 text-xs text-shell-mute">
                  No studios found.
                </Text>
              ) : (
                results.map((pin) => (
                  <Pressable
                    key={pin.id}
                    onPress={() => pickSearchResult(pin)}
                    className="border-b border-shell-border px-4 py-3 active:opacity-70"
                  >
                    <Text
                      className="text-sm font-medium text-foreground"
                      numberOfLines={1}
                    >
                      {pin.name}
                      {pin.claimed ? "  ✓" : ""}
                    </Text>
                    <Text className="text-xs text-shell-mute" numberOfLines={1}>
                      {MAP_LOCATION_CATEGORY_LABELS[pin.category]}
                      {pin.city ? ` · ${pin.city}` : ""}
                      {pin.country ? ` · ${pin.country}` : ""}
                    </Text>
                  </Pressable>
                ))
              )}
            </ScrollView>
          </View>
        ) : null}

        {/* In-view count pill. */}
        {!selected && !selectedCity ? (
          <View
            style={{ position: "absolute", bottom: insets.bottom + 84, left: 12 }}
            className="rounded-full bg-chrome px-3 py-1.5"
          >
            <Text className="text-xs text-shell-mute">
              {loadError
                ? "Couldn't load places"
                : capped
                  ? `${visiblePins.length} of ${total} places in view, zoom in for the rest`
                  : `${visiblePins.length} ${visiblePins.length === 1 ? "place" : "places"} in view`}
            </Text>
          </View>
        ) : null}

        {/* Selected city card. */}
        {selectedCity ? (
          <View
            style={{
              position: "absolute",
              left: 12,
              right: 12,
              bottom: insets.bottom + 84,
            }}
            className="rounded-2xl border border-shell-border bg-card p-3"
          >
            <View className="flex-row items-start justify-between gap-2">
              <View className="min-w-0 flex-1">
                <Text className="text-base font-semibold text-foreground">
                  {selectedCity.cityLabel}
                </Text>
                <Text className="text-xs text-shell-mute">
                  {selectedCity.count}{" "}
                  {selectedCity.count === 1 ? "artist" : "artists"} in town
                </Text>
              </View>
              <Pressable hitSlop={8} onPress={() => setSelectedCity(null)}>
                <X size={18} color={colors.bone} />
              </Pressable>
            </View>
            {selectedCity.artists.length > 0 ? (
              <ScrollView style={{ maxHeight: 176 }} className="mt-2">
                {selectedCity.artists.map((a) => (
                  <Pressable
                    key={a.slug}
                    onPress={() =>
                      Linking.openURL(`https://inklee.app/${a.slug}`)
                    }
                    className="flex-row items-center justify-between gap-2 rounded-xl px-2 py-2 active:opacity-70"
                  >
                    <Text
                      className="min-w-0 flex-1 text-sm text-foreground"
                      numberOfLines={1}
                    >
                      {a.displayName}
                    </Text>
                    {a.lookingForGuestSpots ? (
                      // text-accent, not text-mustard: mustard text fails
                      // contrast on light surfaces (tailwind.config token rule).
                      <Text className="rounded-full bg-mustard/20 px-2 py-0.5 text-xs text-accent">
                        Looking for guest spots
                      </Text>
                    ) : null}
                  </Pressable>
                ))}
              </ScrollView>
            ) : (
              <Text className="mt-2 text-xs text-shell-mute">
                Everyone here is counted anonymously.
              </Text>
            )}
          </View>
        ) : null}

        {/* Selected pin preview card. */}
        {selected && !detailOpen ? (
          <View
            style={{
              position: "absolute",
              left: 12,
              right: 12,
              bottom: insets.bottom + 84,
            }}
            className="rounded-2xl border border-shell-border bg-card p-3"
          >
            <View className="flex-row items-start justify-between gap-2">
              <View className="min-w-0 flex-1">
                <Text
                  className="text-base font-semibold text-foreground"
                  numberOfLines={1}
                >
                  {selected.name}
                </Text>
                <Text className="text-xs text-shell-mute" numberOfLines={1}>
                  {MAP_LOCATION_CATEGORY_LABELS[selected.category]}
                  {selected.city ? ` · ${selected.city}` : ""}
                  {selected.claimed ? " · claimed" : ""}
                </Text>
                {selected.signal && isStudioSignalType(selected.signal) ? (
                  // text-foreground on the rosa wash: rosa text fails contrast
                  // in light mode (same rule as the mustard chip above).
                  <Text className="mt-1 self-start rounded-full bg-rosa/20 px-2 py-0.5 text-xs text-foreground">
                    {STUDIO_SIGNAL_LABELS[selected.signal]}
                  </Text>
                ) : null}
              </View>
              <Pressable hitSlop={8} onPress={() => setSelected(null)}>
                <X size={18} color={colors.bone} />
              </Pressable>
            </View>
            <View className="mt-2 flex-row items-center gap-2">
              <Pressable
                disabled={watchPending}
                onPress={() => toggleWatch(selected)}
                className="flex-row items-center gap-1.5 rounded-full border border-shell-border px-3 py-2.5 active:opacity-70"
              >
                <Eye size={14} color={colors.bone} />
                <Text className="text-xs text-foreground">
                  {watched.has(selected.id) ? "Watching ✓" : "Watch"}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setDetailOpen(true)}
                className="rounded-full bg-mustard px-4 py-2.5 active:opacity-80"
              >
                <Text className="text-xs font-semibold text-charcoal">
                  View details
                </Text>
              </Pressable>
            </View>
            {watchError ? (
              <Text className="mt-2 text-xs text-danger-fg">{watchError}</Text>
            ) : null}
          </View>
        ) : null}
      </View>

      {/* Filter sheet (owns its padding, like travel/map's sheet). */}
      <AdaptiveSheet
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
        panelClassName=""
      >
        <View className="px-4 pb-2 pt-4">
          <Text className="text-base font-semibold text-foreground">
            Filter places
          </Text>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4 }}>
          {MAP_FILTER_KINDS.map((k) => (
            <Pressable
              key={k}
              onPress={() => {
                setFilter(k);
                setFilterOpen(false);
              }}
              className={`mb-1 rounded-xl px-3 py-3 ${
                filter === k ? "bg-mustard/20" : ""
              } active:opacity-70`}
            >
              <Text
                className={`text-sm ${
                  filter === k
                    ? "font-semibold text-foreground"
                    : "text-shell-mute"
                }`}
              >
                {FILTER_LABELS[k]}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </AdaptiveSheet>

      {/* Expanded detail sheet. */}
      {selected ? (
        <MapDetailSheet
          visible={detailOpen}
          pin={selected}
          watched={watched.has(selected.id)}
          watchPending={watchPending}
          watchError={watchError}
          onToggleWatch={() => toggleWatch(selected)}
          onClose={() => setDetailOpen(false)}
          onRequestGuestSpot={(name) => {
            setDetailOpen(false);
            router.push({
              pathname: "/travel/discover-request",
              params: { id: selected.id, name },
            });
          }}
        />
      ) : null}
    </Screen>
  );
}
