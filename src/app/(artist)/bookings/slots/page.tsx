import { createClient } from "@/lib/supabase/server";
import { formatSlotDisplay } from "@/lib/timezone";
import Link from "next/link";
import CreateSlotForm from "./create-slot-form";
import SlotList from "./slot-list";

export default async function SlotsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone, booking_mode")
    .eq("id", user!.id)
    .single();
  const timezone = profile?.timezone ?? "Europe/Berlin";

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
    <div className="space-y-8 max-w-lg">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Slots</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Publish time slots for customers to book. Times shown in{" "}
          <span className="text-foreground">{timezone}</span>.
        </p>
        {profile?.booking_mode !== "fixed_slots" && (
          <p className="text-xs text-amber-500 mt-2">
            Your booking mode is set to Preferred date. Switch to Fixed slots in{" "}
            <Link
              href="/settings/profile"
              className="underline underline-offset-4"
            >
              Profile settings
            </Link>{" "}
            for customers to see these slots.
          </p>
        )}
      </div>

      <CreateSlotForm />
      <SlotList slots={formattedSlots} />
    </div>
  );
}
