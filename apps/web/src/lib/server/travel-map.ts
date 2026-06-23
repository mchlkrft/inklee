// Travel-map journey loader. The tattoo map plots the artist's travel from the
// /travel feature (trips -> trip_legs -> studios) as the single source of truth.
// Each mappable leg becomes a TravelMapStop with the count of the artist's
// client bookings whose preferred date falls within the leg. RLS-scoped.

import type { SupabaseClient } from "@supabase/supabase-js";
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
    studios: LegStudio | null;
  }> | null;
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
        "id, title, trip_legs(id, starts_on, ends_on, studios(name, city, country, latitude, longitude, google_maps_url, icon, icon_color))",
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

  const stops: TravelMapStop[] = [];
  for (const trip of (tripData as unknown as TripRow[]) ?? []) {
    for (const leg of trip.trip_legs ?? []) {
      const studio = leg.studios;
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
