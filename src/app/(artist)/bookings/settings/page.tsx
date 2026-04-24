import { createClient } from "@/lib/supabase/server";
import { formatSlotDisplay } from "@/lib/timezone";
import { parseBooksSettings } from "@/lib/books-settings";
import BookingModeForm from "./booking-mode-form";
import AvailabilityForm from "./availability-form";
import FormAppearanceForm from "./form-appearance-form";
import CreateSlotForm from "../slots/create-slot-form";
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

  return (
    <div className="space-y-12 max-w-lg">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Booking Settings
        </h1>
        <p className="mt-1 text-base text-muted-foreground">
          Control your booking mode, availability, and how your form looks.
        </p>
      </div>

      {/* Booking Mode */}
      <section className="space-y-4">
        <div className="border-b-2 border-border pb-2">
          <h2 className="text-base font-semibold text-foreground">
            Booking mode
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Choose how clients request sessions with you.
          </p>
        </div>
        <BookingModeForm currentMode={bookingMode} />
      </section>

      {/* Slots — only relevant in fixed_slots mode */}
      <section className="space-y-4">
        <div className="border-b-2 border-border pb-2">
          <h2 className="text-base font-semibold text-foreground">Slots</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Publish time slots for clients to book. Times shown in{" "}
            <span className="text-foreground">{timezone}</span>.
          </p>
          {bookingMode !== "fixed_slots" && (
            <p className="mt-1.5 text-sm text-amber-500">
              Slots are only shown on your booking form when booking mode is set
              to Fixed slots.
            </p>
          )}
        </div>
        <CreateSlotForm />
        <SlotList slots={formattedSlots} />
      </section>

      {/* Availability */}
      <section className="space-y-4">
        <div className="border-b-2 border-border pb-2">
          <h2 className="text-base font-semibold text-foreground">
            Availability
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Control when and how many booking requests you accept.
          </p>
        </div>
        <AvailabilityForm settings={booksSettings} />
      </section>

      {/* Form Appearance */}
      <section className="space-y-4">
        <div className="border-b-2 border-border pb-2">
          <h2 className="text-base font-semibold text-foreground">
            Form appearance
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Choose the colour theme of your public booking form.
          </p>
        </div>
        <FormAppearanceForm current={booksSettings.form_appearance} />
      </section>
    </div>
  );
}
