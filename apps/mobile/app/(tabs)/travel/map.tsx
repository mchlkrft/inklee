import { useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import {
  Camera,
  GeoJSONSource,
  Layer,
  Map as MLMap,
  Marker,
} from "@maplibre/maplibre-react-native";
import { MapPin, X } from "lucide-react-native";
import type {
  TravelJourneyResponse,
  TravelMapStop,
} from "@inklee/shared/travel-map";
import { groupJourneyByTrip, safeMapsUrl } from "@inklee/shared/travel-map";
import { Screen } from "@/components/Screen";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { TravelIcon } from "@/components/TravelIcon";
import { useApiQuery } from "@/lib/api";
import { useColors } from "@/lib/theme";

// CARTO Voyager: OSM-based, no API key. Matches the web basemap. MapLibre native
// renders it without a Google/Mapbox token.
const VOYAGER = "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";
const MUSTARD = "#e9b22b";
const GREY = "#8a8a8a";
const CHARCOAL = "#1e1e1e";

const TIMEFRAME_LABEL: Record<string, string> = {
  upcoming: "Upcoming",
  current: "Now",
  previous: "Past",
};

function fmtDate(d: string): string {
  return new Date(`${d}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
function fmtRange(s: string | null, e: string | null): string {
  if (s && e) return `${fmtDate(s)} to ${fmtDate(e)}`;
  if (s) return `From ${fmtDate(s)}`;
  if (e) return `Until ${fmtDate(e)}`;
  return "Ongoing";
}

type Bounds = [number, number, number, number]; // [w, s, e, n]
function boundsOf(coords: [number, number][]): Bounds | null {
  if (coords.length === 0) return null;
  let minLng = Infinity,
    minLat = Infinity,
    maxLng = -Infinity,
    maxLat = -Infinity;
  for (const [lng, lat] of coords) {
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  if (minLng === maxLng && minLat === maxLat) {
    return [minLng - 1.5, minLat - 1.5, maxLng + 1.5, maxLat + 1.5];
  }
  const dx = Math.max((maxLng - minLng) * 0.18, 0.6);
  const dy = Math.max((maxLat - minLat) * 0.18, 0.6);
  return [minLng - dx, minLat - dy, maxLng + dx, maxLat + dy];
}

function lineFeature(stops: TravelMapStop[]): GeoJSON.Feature {
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "LineString",
      coordinates: stops.map((s) => [s.longitude, s.latitude]),
    },
  };
}

export default function TravelMapScreen() {
  const colors = useColors();
  const q = useApiQuery<TravelJourneyResponse>("/travel/journey");
  const [selected, setSelected] = useState<TravelMapStop | null>(null);
  const [showPast, setShowPast] = useState(false);

  if (!q.data) {
    return (
      <Screen edges={["left", "right"]}>
        <View className="flex-1 items-center justify-center">
          {q.loading ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <ErrorState
              title="Couldn't load the map"
              subtitle={q.error ?? undefined}
              onRetry={q.refresh}
            />
          )}
        </View>
      </Screen>
    );
  }

  const stops = q.data.stops;
  const { active, past } = groupJourneyByTrip(stops);
  const coords = stops.map((s) => [s.longitude, s.latitude] as [number, number]);
  const bounds = boundsOf(coords);

  const splitIdx = stops.findIndex((s) => s.timeframe !== "previous");
  const traveled = splitIdx === -1 ? stops : stops.slice(0, splitIdx + 1);
  const planned = splitIdx === -1 ? [] : stops.slice(splitIdx);
  const numberById = new Map(stops.map((s, i) => [s.id, i + 1]));

  return (
    <Screen edges={["left", "right"]}>
      <View className="flex-1">
        <View style={{ height: 320 }}>
          {stops.length === 0 ? (
            <View className="flex-1 items-center justify-center bg-card">
              <Text className="text-xs text-shell-mute">
                Add a studio with a location to a trip to see it here.
              </Text>
            </View>
          ) : (
            <MLMap mapStyle={VOYAGER} style={{ flex: 1 }}>
              <Camera bounds={bounds ?? [-160, -60, 160, 75]} />

              {traveled.length >= 2 ? (
                <GeoJSONSource id="traveled" data={lineFeature(traveled)}>
                  <Layer
                    id="traveled-line"
                    type="line"
                    layout={{ "line-cap": "round", "line-join": "round" }}
                    paint={{
                      "line-color": GREY,
                      "line-width": 3,
                      "line-dasharray": [2, 2],
                    }}
                  />
                </GeoJSONSource>
              ) : null}

              {planned.length >= 2 ? (
                <GeoJSONSource id="planned" data={lineFeature(planned)}>
                  <Layer
                    id="planned-line"
                    type="line"
                    layout={{ "line-cap": "round", "line-join": "round" }}
                    paint={{ "line-color": MUSTARD, "line-width": 5 }}
                  />
                </GeoJSONSource>
              ) : null}

              {stops.map((s) => {
                const isPast = s.timeframe === "previous";
                return (
                  <Marker
                    key={s.id}
                    id={`stop-${s.id}`}
                    lngLat={[s.longitude, s.latitude]}
                    anchor="center"
                    onPress={() => setSelected(s)}
                  >
                    <View
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 13,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: isPast ? GREY : MUSTARD,
                        borderWidth: 2,
                        borderColor: "#ffffff",
                      }}
                    >
                      <Text
                        style={{
                          color: CHARCOAL,
                          fontWeight: "800",
                          fontSize: 12,
                        }}
                      >
                        {numberById.get(s.id) ?? ""}
                      </Text>
                    </View>
                  </Marker>
                );
              })}
            </MLMap>
          )}

          {selected ? (
            <View className="absolute inset-x-3 bottom-3 rounded-2xl border border-shell-border bg-card p-3">
              <View className="flex-row items-start gap-2">
                <TravelIcon
                  icon={selected.icon}
                  fallback={MapPin}
                  size={22}
                  color={selected.iconColor ?? MUSTARD}
                />
                <View className="min-w-0 flex-1">
                  <Text
                    className="text-base font-semibold text-foreground"
                    numberOfLines={1}
                  >
                    {selected.name}
                  </Text>
                  <Text className="text-xs text-shell-mute">
                    {selected.tripTitle} · {TIMEFRAME_LABEL[selected.timeframe]}
                  </Text>
                </View>
                <Pressable hitSlop={8} onPress={() => setSelected(null)}>
                  <X size={18} color={colors.charcoal} />
                </Pressable>
              </View>
              <Text className="mt-1 text-xs text-shell-mute">
                {[selected.city, selected.country].filter(Boolean).join(", ")}
                {selected.city || selected.country ? " · " : ""}
                {fmtRange(selected.startsAt, selected.endsAt)}
              </Text>
              <Text className="mt-1 text-xs text-shell-mute">
                {selected.bookingCount}{" "}
                {selected.bookingCount === 1 ? "booking" : "bookings"} during this
                trip
              </Text>
              <Pressable
                onPress={() => Linking.openURL(safeMapsUrl(selected))}
                className="mt-2 items-center rounded-full bg-mustard py-2.5"
              >
                <Text className="text-sm font-semibold text-charcoal">
                  Open in Google Maps
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
          {stops.length === 0 ? (
            <EmptyState
              title="No travel to map yet"
              subtitle="Plan a trip with a studio that has a location."
            />
          ) : (
            <>
              <Text className="mb-1 text-xs uppercase tracking-wider text-shell-mute">
                Map key
              </Text>
              <View className="mb-4 flex-row flex-wrap gap-x-4 gap-y-1">
                <Legend color={MUSTARD} label="Upcoming stop" />
                <Legend color={GREY} label="Visited" />
              </View>

              <Text className="mb-2 text-sm font-semibold text-foreground">
                Your travel
              </Text>
              {active.map((g) => (
                <View key={g.tripId} className="mb-3">
                  <Text className="mb-1 text-sm font-semibold text-foreground">
                    {g.tripTitle}
                  </Text>
                  {g.stops.map((s) => (
                    <StopRow key={s.id} stop={s} n={numberById.get(s.id) ?? 0} />
                  ))}
                </View>
              ))}

              {past.length > 0 ? (
                <View className="mt-1 rounded-2xl border border-shell-border">
                  <Pressable
                    onPress={() => setShowPast((v) => !v)}
                    className="px-3 py-2"
                  >
                    <Text className="text-sm font-medium text-foreground">
                      {showPast ? "Hide" : "Show"} past trips ({past.length})
                    </Text>
                  </Pressable>
                  {showPast ? (
                    <View className="px-3 pb-3">
                      {past.map((g) => (
                        <View key={g.tripId} className="mb-3">
                          <Text className="mb-1 text-xs font-semibold uppercase tracking-wide text-shell-mute">
                            {g.tripTitle}
                          </Text>
                          {g.stops.map((s) => (
                            <StopRow
                              key={s.id}
                              stop={s}
                              n={numberById.get(s.id) ?? 0}
                            />
                          ))}
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              ) : null}
            </>
          )}
        </ScrollView>
      </View>
    </Screen>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <View
        style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }}
      />
      <Text className="text-xs text-shell-mute">{label}</Text>
    </View>
  );
}

function StopRow({ stop, n }: { stop: TravelMapStop; n: number }) {
  const isPast = stop.timeframe === "previous";
  return (
    <View className="mb-2 flex-row items-start gap-3 rounded-2xl border border-shell-border p-3">
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 12,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: isPast ? GREY : MUSTARD,
        }}
      >
        <Text style={{ color: CHARCOAL, fontWeight: "800", fontSize: 11 }}>
          {n}
        </Text>
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-medium text-foreground" numberOfLines={1}>
          {stop.name}
        </Text>
        <Text className="text-xs text-shell-mute">
          {[stop.city, stop.country].filter(Boolean).join(", ")}
          {stop.city || stop.country ? " · " : ""}
          {fmtRange(stop.startsAt, stop.endsAt)}
        </Text>
        <Text className="text-xs text-shell-mute">
          {stop.bookingCount} {stop.bookingCount === 1 ? "booking" : "bookings"}{" "}
          during this trip
        </Text>
      </View>
    </View>
  );
}
