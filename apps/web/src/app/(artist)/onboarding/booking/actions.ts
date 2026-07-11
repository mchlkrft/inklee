"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { isBookingMode } from "@inklee/shared/booking-domain";
import { recordGrowthEvent } from "@/lib/growth/record-event";

type State = { error: string } | null;

export async function saveOnboardingBookingAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const bookingMode = formData.get("booking_mode");
  // Strict (shared) validation: a missing/unknown value gets a friendly error
  // instead of a raw Postgres enum error on insert.
  if (!isBookingMode(bookingMode)) return { error: "Select a booking mode." };

  const { error } = await supabase
    .from("profiles")
    .update({
      booking_mode: bookingMode,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) return { error: error.message.toLowerCase() };

  void recordGrowthEvent(
    { event: "onboarding_step_completed", props: { step: "booking" } },
    { artistId: user.id, source: "web", email: user.email },
  );

  redirect("/onboarding/availability");
}
