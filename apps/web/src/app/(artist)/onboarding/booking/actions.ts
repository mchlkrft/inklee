"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

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

  const bookingMode = formData.get("booking_mode") as
    | "preferred_date"
    | "fixed_slots";
  if (!bookingMode) return { error: "Select a booking mode." };

  const { error } = await supabase
    .from("profiles")
    .update({
      booking_mode: bookingMode,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) return { error: error.message.toLowerCase() };

  redirect("/onboarding/availability");
}
