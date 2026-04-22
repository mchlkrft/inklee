"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

type State = { error: string } | null;

export async function saveOnboardingProfileAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not authenticated" };

  const location = (formData.get("location") as string | null)?.trim() || null;
  const instagramHandle =
    (formData.get("instagram_handle") as string | null)
      ?.trim()
      .replace(/^@/, "") || null;
  const bio = (formData.get("bio") as string | null)?.trim() || null;

  if (bio && bio.length > 280)
    return { error: "bio must be 280 characters or fewer" };

  const { error } = await supabase
    .from("profiles")
    .update({
      location,
      instagram_handle: instagramHandle,
      bio,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) return { error: error.message.toLowerCase() };

  redirect("/onboarding/booking");
}
