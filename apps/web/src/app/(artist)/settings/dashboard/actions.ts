"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { DashboardWidgets } from "@/lib/dashboard-settings";

type State = { error: string } | { success: true } | null;

export async function saveDashboardWidgetsAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("settings")
    .eq("id", user.id)
    .single();

  const currentSettings = (profile?.settings ?? {}) as Record<string, unknown>;

  const widgets: DashboardWidgets = {
    pending_requests: formData.get("pending_requests") === "true",
    upcoming_appointments: formData.get("upcoming_appointments") === "true",
    guest_spots: formData.get("guest_spots") === "true",
    waitlist: formData.get("waitlist") === "true",
    booking_link: formData.get("booking_link") === "true",
  };

  const { error } = await supabase
    .from("profiles")
    .update({
      settings: { ...currentSettings, dashboard_widgets: widgets },
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/settings/dashboard");
  revalidatePath("/dashboard");
  return { success: true };
}
