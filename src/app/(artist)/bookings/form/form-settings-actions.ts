"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { FormSettings } from "@/lib/form-settings";

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

  const { data: profile } = await supabase
    .from("profiles")
    .select("settings")
    .eq("id", user.id)
    .single();

  const settings = (profile?.settings ?? {}) as Record<string, unknown>;
  const formSettings = (settings.form_settings ?? {}) as Record<
    string,
    unknown
  >;

  // Guarantee at least one contact method (Instagram or email) stays enabled —
  // clients always need a way to reach the artist. Fields are on unless
  // explicitly turned off, so the "other" defaults to enabled.
  if ((key === "show_instagram_handle" || key === "show_email") && !value) {
    const otherKey =
      key === "show_instagram_handle" ? "show_email" : "show_instagram_handle";
    if (formSettings[otherKey] === false) {
      return {
        error: "Keep at least one contact method (Instagram or email).",
      };
    }
  }

  const persistedValue = key === "show_preferred_date" ? true : value;

  const { error } = await supabase
    .from("profiles")
    .update({
      settings: {
        ...settings,
        form_settings: { ...formSettings, [key]: persistedValue },
      },
    })
    .eq("id", user.id);

  if (error) return { error: error.message };

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

  const { data: profile } = await supabase
    .from("profiles")
    .select("settings")
    .eq("id", user.id)
    .single();

  const settings = (profile?.settings ?? {}) as Record<string, unknown>;

  const { error } = await supabase
    .from("profiles")
    .update({ settings: { ...settings, field_order: order } })
    .eq("id", user.id);

  if (error) return { error: error.message };
  // No revalidatePath — the optimistic UI already reflects the new order
  return { success: true };
}
