// Travel-map shared logic: pure types + helpers for the artist's travel journey
// on a map (their /travel trips -> legs -> studios). Web + native consume this.
// One source. No DB access, no side effects.

/**
 * A trip leg resolved to a mappable journey stop: the studio carries the chosen
 * library icon + color, the leg carries the dates, and bookingCount is the
 * artist's client bookings during the leg.
 */
export interface TravelMapStop {
  id: string; // trip leg id
  tripId: string;
  tripTitle: string;
  name: string; // studio name
  city: string | null;
  country: string | null;
  latitude: number;
  longitude: number;
  googleMapsUrl: string | null;
  icon: string | null;
  iconColor: string | null;
  startsAt: string;
  endsAt: string;
  timeframe: "previous" | "current" | "upcoming";
  bookingCount: number;
}

/** Mobile API envelope for the travel journey (web + native share this). */
export interface TravelJourneyResponse {
  stops: TravelMapStop[];
}

export interface JourneyTripGroup {
  tripId: string;
  tripTitle: string;
  stops: TravelMapStop[];
}

/**
 * Classify a leg relative to a reference date (YYYY-MM-DD). Open-ended ranges
 * are tolerated (missing start = treat as started; missing end = ongoing).
 */
export function travelStopTimeframe(
  startsAt: string | null,
  endsAt: string | null,
  todayKey: string,
): "previous" | "current" | "upcoming" {
  if (endsAt && endsAt < todayKey) return "previous";
  if (startsAt && startsAt > todayKey) return "upcoming";
  return "current";
}

/**
 * Google Maps directions deep link to a coordinate. The map is for planning /
 * overview, not in-app navigation, so every entry links out to Google Maps for
 * the actual routing. `api=1` opens the native app on mobile, maps.google.com
 * on desktop. One source (web popovers + native).
 */
export function googleMapsNavUrl(latitude: number, longitude: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${latitude}%2C${longitude}`;
}

/**
 * The Google Maps link to open for a stop: the studio's saved URL only when it
 * is an https URL, otherwise a directions link to the coordinate. The saved URL
 * is artist-entered free text, so this guards against an odd scheme being
 * opened (native) or injected into an href (web). One source.
 */
export function safeMapsUrl(stop: {
  googleMapsUrl: string | null;
  latitude: number;
  longitude: number;
}): string {
  const u = stop.googleMapsUrl;
  if (u && /^https:\/\//i.test(u)) return u;
  return googleMapsNavUrl(stop.latitude, stop.longitude);
}

/**
 * Group journey stops by trip for display. `active` trips (still have a
 * current/upcoming stop) lead, current-containing trips first; `past` trips (all
 * stops previous) are returned separately for a collapsed section. Date order is
 * preserved within each group. Pure + one source (web map page + native screen).
 */
export function groupJourneyByTrip(stops: TravelMapStop[]): {
  active: JourneyTripGroup[];
  past: JourneyTripGroup[];
} {
  const groups = new Map<string, JourneyTripGroup>();
  for (const s of stops) {
    const g = groups.get(s.tripId) ?? {
      tripId: s.tripId,
      tripTitle: s.tripTitle,
      stops: [],
    };
    g.stops.push(s);
    groups.set(s.tripId, g);
  }
  const all = [...groups.values()];
  const active = all
    .filter((g) => g.stops.some((s) => s.timeframe !== "previous"))
    .sort((a, b) => {
      const ac = a.stops.some((s) => s.timeframe === "current") ? 0 : 1;
      const bc = b.stops.some((s) => s.timeframe === "current") ? 0 : 1;
      if (ac !== bc) return ac - bc;
      return (a.stops[0]?.startsAt ?? "").localeCompare(
        b.stops[0]?.startsAt ?? "",
      );
    });
  const past = all.filter((g) =>
    g.stops.every((s) => s.timeframe === "previous"),
  );
  return { active, past };
}
