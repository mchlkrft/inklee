"use server";

import { createClient } from "@/lib/supabase/server";
import { parseFormSettings } from "@/lib/form-settings";
import { redirect } from "next/navigation";
import { recordGrowthEvent } from "@/lib/growth/record-event";

type State = { error: string } | null;

export async function saveOnboardingFormAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const showImageUpload = formData.get("show_image_upload") === "true";
  const requireDescription = formData.get("require_description") === "true";
  const showReferenceLink = formData.get("show_reference_link") === "true";

  const { data: existing } = await supabase
    .from("profiles")
    .select("settings")
    .eq("id", user.id)
    .single();

  const currentSettings = (existing?.settings ?? {}) as Record<string, unknown>;
  const currentForm = parseFormSettings(currentSettings.form_settings);

  const { error } = await supabase
    .from("profiles")
    .update({
      settings: {
        ...currentSettings,
        form_settings: {
          ...currentForm,
          show_image_upload: showImageUpload,
          require_description: requireDescription,
          show_reference_link: showReferenceLink,
        },
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) return { error: error.message.toLowerCase() };

  void recordGrowthEvent(
    { event: "onboarding_step_completed", props: { step: "form" } },
    { artistId: user.id, source: "web", email: user.email },
  );

  redirect("/onboarding/done");
}
