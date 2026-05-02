"use server";

import { createClient } from "@/lib/supabase/server";
import { validateSlug } from "@/lib/slug";
import { redirect } from "next/navigation";

type State = { error: string } | null;

export async function checkSlugAvailability(
  slug: string,
): Promise<{ available: boolean; error: string | null }> {
  const error = validateSlug(slug);
  if (error) return { available: false, error };

  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("slug")
    .eq("slug", slug)
    .single();

  return { available: !data, error: null };
}

export async function claimSlugAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const slug = (formData.get("slug") as string).trim().toLowerCase();
  const displayName = (formData.get("display_name") as string | null)?.trim();
  const instagramHandle =
    (formData.get("instagram_handle") as string | null)
      ?.trim()
      .replace(/^@/, "") || null;
  const location = (formData.get("location") as string | null)?.trim() || null;

  const validationError = validateSlug(slug);
  if (validationError) return { error: validationError };
  if (!displayName) return { error: "artist name is required" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "not authenticated" };

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

  if (existing) return { error: "that slug is already taken" };

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
