import Link from "next/link";
import {
  CalendarDays,
  SlidersHorizontal,
  Clock,
  MapPin,
  FileText,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isDateKeyBefore, todayInTimeZone } from "@/lib/date-utils";
import { formatSlotDisplay } from "@/lib/timezone";
import { listSlotsForArtist } from "@/lib/server/slots";
import { parseBooksSettings } from "@/lib/books-settings";
import { parseBioPageSettings, isModuleVisible } from "@/lib/bio-page-settings";
import { IconChip } from "@/components/ui/card";
import BookingModeForm from "./booking-mode-form";
import AvailabilityForm from "./availability-form";
import BookingPolicyForm from "./booking-policy-form";
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
  const bioPage = parseBioPageSettings(profileSettings.bio_page);

  // Shared read (lib/server/slots.ts) — the mobile slots list uses the same
  // query, so both platforms show the same rows.
  const slotsResult = await listSlotsForArtist(supabase, user!.id);
  const slots = "slots" in slotsResult ? slotsResult.slots : [];

  const formattedSlots = slots.map((s) => {
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
          Books & Availability
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Control your booking mode, availability, and cap.
        </p>
      </div>

      {/* Availability */}
      <section className="space-y-4">
        <div className="border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <IconChip icon={CalendarDays} tint="mustard" size="sm" />
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Availability
            </h2>
          </div>
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
          <div className="flex items-center gap-2">
            <IconChip icon={SlidersHorizontal} tint="rosa" size="sm" />
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Booking mode
            </h2>
          </div>
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
            <div className="flex items-center gap-2">
              <IconChip icon={Clock} tint="cobalt" size="sm" />
              <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Slots
              </h2>
            </div>
            <p className="mt-1.5 text-sm text-foreground">
              Publish time slots for clients to book. Times in{" "}
              <span className="font-medium">{timezone}</span>.
            </p>
          </div>
          <AddSlotButton timezone={timezone} />
          <SlotList slots={formattedSlots} />
        </section>
      )}

      {/* Booking policy — shown on the public booking page (moved here from the
          Link Hub editor; it is a booking-page concern, not a link-in-bio one) */}
      <section className="space-y-4">
        <div className="border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <IconChip icon={FileText} tint="bone" size="sm" />
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Booking policy
            </h2>
          </div>
          <p className="mt-1.5 text-sm text-foreground">
            Deposit, cancellation, minimum size, the work you take on. Shown on
            your booking page.
          </p>
        </div>
        <BookingPolicyForm
          policy={bioPage.bookingPolicy ?? ""}
          show={isModuleVisible(bioPage, "policy")}
        />
      </section>

      {/* Studios — secondary entry point to the studio library */}
      <section className="space-y-4">
        <div className="border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <IconChip icon={MapPin} tint="green" size="sm" />
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Studios
            </h2>
          </div>
          <p className="mt-1.5 text-sm text-foreground">
            The studios where you tattoo. Slots auto-pick up trip locations when
            a trip leg covers the slot date.
          </p>
        </div>
        <Link
          href="/travel#studios"
          className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/40"
        >
          Open studio library →
        </Link>
      </section>
    </div>
  );
}
