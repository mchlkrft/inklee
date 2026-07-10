import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { customerLabel } from "@/lib/booking-domain";
import type {
  MobileCalendarAppointment,
  MobileCalendarFlashDay,
  MobileCalendarResponse,
  MobileGuestSpot,
} from "@inklee/shared/mobile-api";

export const runtime = "nodejs";

type Row = {
  id: string;
  customer_handle: string | null;
  customer_email: string | null;
  preferred_date: string | null;
  form_data: Record<string, string> | null;
};

type RawTripLeg = {
  id: string;
  starts_on: string;
  ends_on: string;
  studios: { name: string } | null;
};

// GET /api/mobile/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD — confirmed
// appointments (approved bookings with a date) in the range, plus guest-spot
// legs and flash days for the calendar markers (web-calendar parity; slots
// stay a later addition). Both bounds optional.
export async function GET(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  let bookingsQuery = supabase
    .from("booking_requests")
    .select("id, customer_handle, customer_email, preferred_date, form_data")
    .eq("artist_id", userId)
    .eq("status", "approved")
    .not("preferred_date", "is", null)
    .order("preferred_date", { ascending: true });
  if (from) bookingsQuery = bookingsQuery.gte("preferred_date", from);
  if (to) bookingsQuery = bookingsQuery.lte("preferred_date", to);

  let flashQuery = supabase
    .from("flash_days")
    .select("id, title, scheduled_on")
    .eq("artist_id", userId)
    .not("scheduled_on", "is", null)
    .order("scheduled_on", { ascending: true });
  if (from) flashQuery = flashQuery.gte("scheduled_on", from);
  if (to) flashQuery = flashQuery.lte("scheduled_on", to);

  const [bookings, trips, flash] = await Promise.all([
    bookingsQuery,
    // Legs ride the nested trips select (RLS scopes through trips); range
    // overlap is filtered in JS, mirroring the home route's proven pattern.
    supabase
      .from("trips")
      .select(
        "id, title, icon, icon_color, icon_bg, trip_legs(id, starts_on, ends_on, studios(name))",
      )
      .eq("artist_id", userId),
    flashQuery,
  ]);
  if (bookings.error) return mobileError(500, bookings.error.message);

  const items = ((bookings.data ?? []) as Row[]).map(
    (b): MobileCalendarAppointment => {
      const fd = b.form_data ?? {};
      return {
        id: b.id,
        client: customerLabel(b.customer_handle, b.customer_email),
        placement: fd.placement ?? null,
        // Non-null at runtime: the query filters `.not("preferred_date", "is",
        // null)`. The row type is just wider than the filtered reality.
        date: b.preferred_date!,
      };
    },
  );

  // Trips × legs flattened to guest spots overlapping the range.
  const guestSpots: MobileGuestSpot[] = (trips.data ?? [])
    .flatMap((t) =>
      ((t.trip_legs as unknown as RawTripLeg[]) ?? []).map((l) => ({
        id: l.id,
        tripId: t.id,
        tripTitle: t.title,
        studioName: l.studios?.name ?? null,
        startsOn: l.starts_on,
        endsOn: l.ends_on,
        icon: ((t as { icon?: string | null }).icon ?? null) as string | null,
        iconColor: ((t as { icon_color?: string | null }).icon_color ??
          null) as string | null,
        iconBg: ((t as { icon_bg?: string | null }).icon_bg ?? null) as
          | string
          | null,
      })),
    )
    .filter((l) => (!to || l.startsOn <= to) && (!from || l.endsOn >= from))
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn));

  const flashDays: MobileCalendarFlashDay[] = (
    (flash.data ?? []) as { id: string; title: string; scheduled_on: string }[]
  ).map((d) => ({ id: d.id, title: d.title, scheduledOn: d.scheduled_on }));

  const body: MobileCalendarResponse = { items, guestSpots, flashDays };
  return mobileOk(body);
}
