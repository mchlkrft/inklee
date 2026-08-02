"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { FormSettings } from "@/lib/form-settings";
import { updateProfileSettings } from "@/lib/server/profile-settings";

type State = { error: string } | { success: true } | null;

export async function saveFormSettingsAction(
  key: keyof FormSettings,
  value: boolean,
): Promise<State> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not authenticated" };

  // Email and the preferred date / slot picker are always shown — email is the
  // mandatory contact method and the date is the core booking mechanism.
  const persistedValue =
    key === "show_preferred_date" || key === "show_email" ? true : value;

  const result = await updateProfileSettings(supabase, user.id, (settings) => {
    const formSettings = (settings.form_settings ?? {}) as Record<
      string,
      unknown
    >;
    return {
      ...settings,
      form_settings: { ...formSettings, [key]: persistedValue },
    };
  });

  if (!result.ok) return { error: result.error };

  revalidatePath("/bookings/form");
  return { success: true };
}

export async function saveFieldOrderAction(
  order: string[],
): Promise<{ error: string } | { success: true } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not authenticated" };

  const result = await updateProfileSettings(supabase, user.id, (settings) => ({
    ...settings,
    field_order: order,
  }));

  if (!result.ok) return { error: result.error };
  // No revalidatePath — the optimistic UI already reflects the new order
  return { success: true };
}
