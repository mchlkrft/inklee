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

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-foreground">Calendar</h1>
      <CalendarView events={events} />
    </div>
  );
}
