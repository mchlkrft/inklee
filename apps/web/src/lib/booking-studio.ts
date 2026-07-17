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
 * Returns the GUEST-SPOT studio name for a booking, or null when the booking
 * is at the artist's default (primary) studio. Used to decide whether the
 * Accept popup needs to show a "confirm the studio" block — the artist always
 * knows where their primary studio is, so we only ask when the booking is
 * somewhere else.
 *
 * Resolution order:
 *   1) trip_id → trip_legs.studios for the leg covering preferred_date (the
 *      booking was tagged to a trip — always treat as guest spot).
 *   2) flash_day_id → flash_days.studio_id when non-primary.
 *   3) booking.studio_id directly when non-primary.
 * Anything else (or the primary studio) → null.
 */
export async function resolveBookingGuestSpotStudio(
  bookingId: string,
): Promise<string | null> {
  const { data: booking } = await serviceClient
    .from("booking_requests")
    .select("trip_id, flash_day_id, studio_id, preferred_date")
    .eq("id", bookingId)
    .single();
  if (!booking) return null;
  const date = (booking.preferred_date as string | null) ?? null;

  // (1) Trip-leg studio. Trip-tagged bookings are always guest spots — even
  // if the leg has no studio set, we still confirm with a placeholder name.
  if (booking.trip_id) {
    if (date) {
      const { data: legs } = await serviceClient
        .from("trip_legs")
        .select("starts_on, ends_on, studios(name)")
        .eq("trip_id", booking.trip_id);
      type LegRow = {
        starts_on: string;
        ends_on: string;
        studios: { name: string } | { name: string }[] | null;
      };
      const leg = ((legs ?? []) as unknown as LegRow[]).find(
        (l) => l.starts_on <= date && l.ends_on >= date,
      );
      const studio = leg
        ? Array.isArray(leg.studios)
          ? (leg.studios[0] ?? null)
          : leg.studios
        : null;
      if (studio) return studio.name;
    }
    return "the studio for this trip";
  }

  // (2) Flash-day booking — flash_day → studio. flash_day_id lives on the
  // booking itself (0018); the old slot → flash_day hop queried a
  // slots.flash_day_id column that never existed, so this branch silently
  // returned nothing until 2026-07-17.
  if (booking.flash_day_id) {
    type FDStudio = { name: string; is_primary: boolean };
    const { data: flashDay } = (await serviceClient
      .from("flash_days")
      .select("studios(name, is_primary)")
      .eq("id", booking.flash_day_id)
      .maybeSingle()) as unknown as {
      data: { studios: FDStudio | FDStudio[] | null } | null;
    };
    const studios = flashDay?.studios ?? null;
    const studio = Array.isArray(studios) ? (studios[0] ?? null) : studios;
    if (studio && !studio.is_primary) return studio.name;
  }

  // (3) Explicit booking.studio_id — surface it when non-primary.
  if (booking.studio_id) {
    const { data: studio } = await serviceClient
      .from("studios")
      .select("name, is_primary")
      .eq("id", booking.studio_id)
      .maybeSingle();
    if (studio && !studio.is_primary) return studio.name;
  }

  return null;
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
