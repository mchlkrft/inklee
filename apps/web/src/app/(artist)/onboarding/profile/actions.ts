"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { normalizeProfileFields } from "@inklee/shared/profile-validation";

type State = { error: string } | null;

export async function saveOnboardingProfileAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  // The display name was set at claim time; this step edits bio/instagram/location.
  const fields = normalizeProfileFields(
    {
      bio: formData.get("bio"),
      instagramHandle: formData.get("instagram_handle"),
      location: formData.get("location"),
    },
    { requireDisplayName: false },
  );
  if (!fields.ok) return { error: fields.error };

  const { error } = await supabase
    .from("profiles")
    .update({
      location: fields.value.location,
      instagram_handle: fields.value.instagramHandle,
      bio: fields.value.bio,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) return { error: error.message.toLowerCase() };

  redirect("/onboarding/booking");
}
