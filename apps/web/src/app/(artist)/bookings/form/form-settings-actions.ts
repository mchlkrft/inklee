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

  // Email and the preferred date / slot picker are always shown — email is the
  // mandatory contact method and the date is the core booking mechanism.
  const persistedValue =
    key === "show_preferred_date" || key === "show_email" ? true : value;

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
