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
  if (!user) return { error: "Not authenticated." };

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

  const { error } = await supabase
    .from("profiles")
    .update({
      settings: {
        ...settings,
        form_settings: { ...formSettings, [key]: value },
      },
    })
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/settings/fields");
  return { success: true };
}
