import { createClient } from "@/lib/supabase/server";
import { isDateKeyBefore, todayInTimeZone } from "@/lib/date-utils";
import { formatSlotDisplay } from "@/lib/timezone";
import { parseBooksSettings } from "@/lib/books-settings";
import BookingModeForm from "./booking-mode-form";
import AvailabilityForm from "./availability-form";
import AddSlotButton from "../slots/add-slot-button";
import SlotList from "../slots/slot-list";

export default async function BookingSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone, booking_mode, settings")
    .eq("id", user!.id)
    .single();

  const timezone = profile?.timezone ?? "Europe/Berlin";
  const bookingMode = profile?.booking_mode ?? "preferred_date";
  const profileSettings = (profile?.settings ?? {}) as Record<string, unknown>;
  const booksSettings = parseBooksSettings(profileSettings.books_settings);

  const { data: slots } = await supabase
    .from("slots")
    .select("id, starts_at, duration_minutes, status")
    .eq("artist_id", user!.id)
    .neq("status", "cancelled")
    .order("starts_at", { ascending: true });

  const formattedSlots = (slots ?? []).map((s) => {
    const display = formatSlotDisplay(
      s.starts_at,
      s.duration_minutes,
      timezone,
    );
    return {
      id: s.id,
      date: display.date,
      time: display.time,
      tz: display.tz,
      status: s.status,
    };
  });

  const windowExpired =
    booksSettings.booking_window_ends_at !== null &&
    isDateKeyBefore(
      booksSettings.booking_window_ends_at,
      todayInTimeZone(timezone),
    );

  return (
    <div className="space-y-10 max-w-2xl">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Booking Settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Control your booking mode and availability.
        </p>
      </div>

      {/* Availability */}
      <section className="space-y-4">
        <div className="border-b border-border pb-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Availability
          </h2>
          <p className="mt-1.5 text-sm text-foreground">
            Control when and how many booking requests you accept.
          </p>
        </div>
        <AvailabilityForm
          settings={booksSettings}
          windowExpired={windowExpired}
        />
      </section>

      {/* Booking Mode */}
      <section className="space-y-4">
        <div className="border-b border-border pb-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Booking mode
          </h2>
          <p className="mt-1.5 text-sm text-foreground">
            Choose how clients request sessions with you.
          </p>
        </div>
        <BookingModeForm currentMode={bookingMode} timezone={timezone} />
      </section>

      {/* Slots — only in fixed_slots mode */}
      {bookingMode === "fixed_slots" && (
        <section className="space-y-4">
          <div className="border-b border-border pb-3">
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Slots
            </h2>
            <p className="mt-1.5 text-sm text-foreground">
              Publish time slots for clients to book. Times in{" "}
              <span className="font-medium">{timezone}</span>.
            </p>
          </div>
          <AddSlotButton timezone={timezone} />
          <SlotList slots={formattedSlots} />
        </section>
      )}
    </div>
  );
}
