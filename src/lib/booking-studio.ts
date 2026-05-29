import { serviceClient } from "@/lib/supabase/service";

export type EmailStudio = {
  name: string;
  address: string | null;
  mapsUrl: string | null;
};

type StudioRow = {
  name: string;
  city: string | null;
  country: string | null;
  address: string | null;
  formatted_address: string | null;
  google_maps_url: string | null;
};

const STUDIO_COLS =
  "name, city, country, address, formatted_address, google_maps_url";

function toEmailStudio(s: StudioRow): EmailStudio {
  const address =
    s.formatted_address ||
    s.address ||
    [s.city, s.country].filter(Boolean).join(", ") ||
    null;
  return { name: s.name, address, mapsUrl: s.google_maps_url };
}

/**
 * Resolve the studio a CONFIRMED client should go to, for post-approval and
 * reminder emails: the trip leg's studio matching the booking date (guest
 * spot), otherwise the artist's primary studio. The full address is included
 * (the client is confirmed), regardless of the public `visibility_mode`.
 * Returns null when the artist has no studio set.
 */
export async function resolveStudioForBooking(
  bookingId: string,
): Promise<EmailStudio | null> {
  const { data: booking } = await serviceClient
    .from("booking_requests")
    .select("artist_id, trip_id, preferred_date")
    .eq("id", bookingId)
    .single();
  if (!booking) return null;

  // Guest spot: the trip leg whose date range covers the booking date.
  if (booking.trip_id && booking.preferred_date) {
    const date = booking.preferred_date as string;
    const { data: legs } = await serviceClient
      .from("trip_legs")
      .select(`starts_on, ends_on, studios(${STUDIO_COLS})`)
      .eq("trip_id", booking.trip_id);
    type LegRow = {
      starts_on: string;
      ends_on: string;
      studios: StudioRow | StudioRow[] | null;
    };
    const leg = ((legs ?? []) as unknown as LegRow[]).find(
      (l) => l.starts_on <= date && l.ends_on >= date,
    );
    const studio = leg
      ? Array.isArray(leg.studios)
        ? (leg.studios[0] ?? null)
        : leg.studios
      : null;
    if (studio) return toEmailStudio(studio);
  }

  // Fallback: the artist's primary (home) studio.
  const { data: primary } = await serviceClient
    .from("studios")
    .select(STUDIO_COLS)
    .eq("artist_id", booking.artist_id)
    .eq("is_primary", true)
    .maybeSingle();
  return primary ? toEmailStudio(primary as unknown as StudioRow) : null;
}
