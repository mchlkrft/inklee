"use server";

import { createClient } from "@/lib/supabase/server";
import { validateSlug } from "@/lib/slug";
import { normalizeProfileFields } from "@inklee/shared/profile-validation";
import { redirect } from "next/navigation";

type State = { error: string } | null;

export async function checkSlugAvailability(
  slug: string,
): Promise<{ available: boolean; owned: boolean; error: string | null }> {
  const error = validateSlug(slug);
  if (error) return { available: false, owned: false, error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  // Free to claim.
  if (!data) return { available: true, owned: false, error: null };

  // Already the current user's slug — re-claiming it is fine (e.g. they
  // stepped back to this step). Treat as available so the form stays usable.
  if (user && data.id === user.id) {
    return { available: true, owned: true, error: null };
  }

  // Taken by someone else.
  return { available: false, owned: false, error: null };
}

export async function claimSlugAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const slug = (formData.get("slug") as string).trim().toLowerCase();
  const validationError = validateSlug(slug);
  if (validationError) return { error: validationError };

  const fields = normalizeProfileFields(
    {
      displayName: formData.get("display_name"),
      instagramHandle: formData.get("instagram_handle"),
      location: formData.get("location"),
    },
    { displayNameRequiredError: "Artist name is required." },
  );
  if (!fields.ok) return { error: fields.error };
  const { displayName, instagramHandle, location } = fields.value;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated." };

  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .maybeSingle();

  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("slug", slug)
    .neq("id", user.id)
    .single();

  if (existing) return { error: "That slug is already taken." };

  const { error } = await supabase.from("profiles").upsert({
    id: user.id,
    slug,
    display_name: displayName,
    instagram_handle: instagramHandle,
    location,
    timezone: currentProfile?.timezone ?? "Europe/Berlin",
    updated_at: new Date().toISOString(),
  });

  if (error) return { error: error.message.toLowerCase() };

  redirect("/onboarding/booking");
}
