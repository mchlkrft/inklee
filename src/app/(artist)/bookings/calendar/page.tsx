import { createClient } from "@/lib/supabase/server";
import CalendarView from "./calendar-view";
import type { CalendarEvent } from "./appointment-drawer";

export default async function CalendarPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: bookings } = await supabase
    .from("booking_requests")
    .select(
      "id, preferred_date, customer_handle, customer_email, form_data, origin, status",
    )
    .eq("artist_id", user!.id)
    .eq("status", "approved")
    .not("preferred_date", "is", null)
    .order("preferred_date", { ascending: true });

  const events: CalendarEvent[] = (bookings ?? []).map((b) => {
    const fd = b.form_data as Record<string, string> | null;
    return {
      id: b.id,
      date: b.preferred_date!,
      handle: b.customer_handle ?? "unknown",
      placement: fd?.placement ?? "",
      size: fd?.size ?? "",
      description: fd?.description ?? "",
      email: b.customer_email,
      origin: b.origin,
      status: b.status,
    };
  });

  // Guest spots (trip legs) + flash days overlaid on the same calendar.
  const { data: rawTrips } = await supabase
    .from("trips")
    .select("id, title, trip_legs(id, starts_on, ends_on, studios(name, city))")
    .eq("artist_id", user!.id);
  type RawStudio = { name: string; city: string };
  type RawLeg = {
    id: string;
    starts_on: string;
    ends_on: string;
    studios: RawStudio | RawStudio[] | null;
  };
  type RawTrip = { id: string; title: string; trip_legs: RawLeg[] | null };
  const tripLegs = ((rawTrips ?? []) as unknown as RawTrip[]).flatMap((t) =>
    (t.trip_legs ?? []).map((leg) => {
      const studio = Array.isArray(leg.studios) ? leg.studios[0] : leg.studios;
      return {
        id: leg.id,
        startsOn: leg.starts_on,
        endsOn: leg.ends_on,
        label: studio?.city || studio?.name || t.title,
      };
    }),
  );

  const { data: rawFlash } = await supabase
    .from("flash_days")
    .select("id, title, scheduled_on")
    .eq("artist_id", user!.id)
    .not("scheduled_on", "is", null);
  const flashDays = (
    (rawFlash ?? []) as { id: string; title: string; scheduled_on: string }[]
  ).map((f) => ({ id: f.id, date: f.scheduled_on, title: f.title }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Calendar
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Approved bookings, appointments, guest spots, and flash days.
        </p>
      </div>
      <CalendarView events={events} tripLegs={tripLegs} flashDays={flashDays} />
    </div>
  );
}
