// Travel-map journey loader. The tattoo map plots the artist's travel from the
// /travel feature (trips -> trip_legs -> studios) as the single source of truth.
// Each mappable leg becomes a TravelMapStop with the count of the artist's
// client bookings whose preferred date falls within the leg. RLS-scoped.

import type { SupabaseClient } from "@supabase/supabase-js";
import { serviceClient } from "@/lib/supabase/service";
import {
  travelStopTimeframe,
  type TravelMapStop,
} from "@inklee/shared/travel-map";

const DEAD_BOOKING_STATUSES = new Set(["rejected", "cancelled"]);

interface LegStudio {
  name: string | null;
  city: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  google_maps_url: string | null;
  icon: string | null;
  icon_color: string | null;
}
interface TripRow {
  id: string;
  title: string;
  trip_legs: Array<{
    id: string;
    starts_on: string;
    ends_on: string;
    guest_spot_stay_id: string | null;
    studios: LegStudio | null;
  }> | null;
}

/**
 * Coordinates for guest spot legs (which never carry a 1.x studio): resolved
 * service-role via the artist's own stays to the host studio's map entry.
 * True coordinates on purpose: this is the artist's private journey and they
 * are going there.
 */
async function resolveGuestLegStudios(
  stayIds: string[],
): Promise<Map<string, LegStudio>> {
  const out = new Map<string, LegStudio>();
  if (!stayIds.length) return out;
  const { data: stays } = await serviceClient
    .from("guest_spot_stays")
    .select("id, studio_profile_id")
    .in("id", stayIds);
  const profileIds = [
    ...new Set(
      (stays ?? [])
        .map((s) => s.studio_profile_id as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (!profileIds.length) return out;
  const { data: locations } = await serviceClient
    .from("map_locations")
    .select("studio_profile_id, name, city, country, latitude, longitude")
    .in("studio_profile_id", profileIds);
  const byProfile = new Map(
    (locations ?? []).map((l) => [l.studio_profile_id as string, l]),
  );
  for (const stay of stays ?? []) {
    const loc = byProfile.get((stay.studio_profile_id as string) ?? "");
    if (!loc || loc.latitude == null || loc.longitude == null) continue;
    out.set(stay.id as string, {
      name: (loc.name as string | null) ?? null,
      city: (loc.city as string | null) ?? null,
      country: (loc.country as string | null) ?? null,
      latitude: Number(loc.latitude),
      longitude: Number(loc.longitude),
      google_maps_url: null,
      icon: null,
      icon_color: null,
    });
  }
  return out;
}

/**
 * The artist's travel journey for the map: every trip leg with a geocoded
 * studio, date-ordered, classified previous/current/upcoming, with a live
 * client-booking count.
 */
export async function listTravelJourney(
  supabase: SupabaseClient,
  artistId: string,
  todayKey: string,
): Promise<TravelMapStop[]> {
  const [{ data: tripData }, { data: bookingData }] = await Promise.all([
    supabase
      .from("trips")
      .select(
        "id, title, trip_legs(id, starts_on, ends_on, guest_spot_stay_id, studios(name, city, country, latitude, longitude, google_maps_url, icon, icon_color))",
      )
      .eq("artist_id", artistId),
    supabase
      .from("booking_requests")
      .select("preferred_date, status")
      .eq("artist_id", artistId),
  ]);

  const bookingDates = (
    (bookingData as Array<{ preferred_date: string | null; status: string }>) ??
    []
  )
    .filter((b) => b.preferred_date && !DEAD_BOOKING_STATUSES.has(b.status))
    .map((b) => b.preferred_date as string);

  // Guest spot legs resolve their host studio through the stay.
  const guestStayIds = ((tripData as unknown as TripRow[]) ?? [])
    .flatMap((t) => t.trip_legs ?? [])
    .filter((l) => !l.studios && l.guest_spot_stay_id)
    .map((l) => l.guest_spot_stay_id as string);
  const guestStudios = await resolveGuestLegStudios(guestStayIds);

  const stops: TravelMapStop[] = [];
  for (const trip of (tripData as unknown as TripRow[]) ?? []) {
    for (const leg of trip.trip_legs ?? []) {
      const studio =
        leg.studios ??
        (leg.guest_spot_stay_id
          ? (guestStudios.get(leg.guest_spot_stay_id) ?? null)
          : null);
      if (!studio || studio.latitude == null || studio.longitude == null) {
        continue; // a leg with no geocoded studio can't be drawn
      }
      const startsAt = leg.starts_on;
      const endsAt = leg.ends_on;
      const bookingCount = bookingDates.filter(
        (d) => d >= startsAt && d <= endsAt,
      ).length;
      stops.push({
        id: leg.id,
        tripId: trip.id,
        tripTitle: trip.title,
        name: studio.name ?? "Studio",
        city: studio.city,
        country: studio.country,
        latitude: studio.latitude,
        longitude: studio.longitude,
        googleMapsUrl: studio.google_maps_url,
        icon: studio.icon,
        iconColor: studio.icon_color,
        startsAt,
        endsAt,
        timeframe: travelStopTimeframe(startsAt, endsAt, todayKey),
        bookingCount,
      });
    }
  }
  return stops.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/** Whether the artist has any travel entry (a trip or a studio) — the gate for
 *  showing the map at all. */
export async function hasTravelEntries(
  supabase: SupabaseClient,
  artistId: string,
): Promise<boolean> {
  const [{ count: trips }, { count: studios }] = await Promise.all([
    supabase
      .from("trips")
      .select("id", { count: "exact", head: true })
      .eq("artist_id", artistId),
    supabase
      .from("studios")
      .select("id", { count: "exact", head: true })
      .eq("artist_id", artistId),
  ]);
  return (trips ?? 0) > 0 || (studios ?? 0) > 0;
}
