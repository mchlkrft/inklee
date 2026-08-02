"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { DashboardWidgets } from "@/lib/dashboard-settings";
import { updateProfileSettings } from "@/lib/server/profile-settings";

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

  const widgets: DashboardWidgets = {
    pending_requests: formData.get("pending_requests") === "true",
    upcoming_appointments: formData.get("upcoming_appointments") === "true",
    guest_spots: formData.get("guest_spots") === "true",
    waitlist: formData.get("waitlist") === "true",
    booking_link: formData.get("booking_link") === "true",
  };

  const result = await updateProfileSettings(
    supabase,
    user.id,
    (currentSettings) => ({
      ...currentSettings,
      dashboard_widgets: widgets,
    }),
    { updated_at: new Date().toISOString() },
  );

  if (!result.ok) return { error: result.error };

  revalidatePath("/settings/dashboard");
  revalidatePath("/dashboard");
  return { success: true };
}
