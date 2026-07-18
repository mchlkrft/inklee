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

/** The 2.0 host studio behind a guest spot stay, shaped for emails. */
async function guestSpotHostStudio(
  stayId: string,
): Promise<EmailStudio | null> {
  const { data: stay } = await serviceClient
    .from("guest_spot_stays")
    .select("studio_profile_id")
    .eq("id", stayId)
    .maybeSingle();
  if (!stay?.studio_profile_id) return null;
  const { data: studio } = await serviceClient
    .from("studio_profiles")
    .select("name, address, city, country, postal_code")
    .eq("id", stay.studio_profile_id as string)
    .maybeSingle();
  if (!studio) return null;
  const address =
    [
      studio.address as string | null,
      [studio.postal_code, studio.city].filter(Boolean).join(" "),
      studio.country as string | null,
    ]
      .filter((part) => Boolean(part && String(part).trim()))
      .join(", ") || null;
  return { name: studio.name as string, address, mapsUrl: null };
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
        .select("starts_on, ends_on, guest_spot_stay_id, studios(name)")
        .eq("trip_id", booking.trip_id);
      type LegRow = {
        starts_on: string;
        ends_on: string;
        guest_spot_stay_id: string | null;
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
      // 2.0 guest spot legs carry the host studio through their stay.
      if (leg?.guest_spot_stay_id) {
        const host = await guestSpotHostStudio(leg.guest_spot_stay_id);
        if (host) return host.name;
      }
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
      .select(
        `starts_on, ends_on, origin, guest_spot_stay_id, studios(${STUDIO_COLS})`,
      )
      .eq("trip_id", booking.trip_id);
    type LegRow = {
      starts_on: string;
      ends_on: string;
      origin: string | null;
      guest_spot_stay_id: string | null;
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
    // 2.0 guest spot legs: NEVER fall through to the artist's home studio
    // (the integration sweep caught confirmed clients being mailed the wrong
    // city). Keyed on origin so a deleted stay row cannot silently restore
    // the fallback; the host studio's full address is right for a confirmed
    // client, mirroring the 1.x regardless-of-visibility rule.
    if (leg?.origin === "guest_spot") {
      const host = leg.guest_spot_stay_id
        ? await guestSpotHostStudio(leg.guest_spot_stay_id)
        : null;
      return host;
    }
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
