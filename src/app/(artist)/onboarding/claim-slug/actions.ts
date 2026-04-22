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
  const firstName =
    (formData.get("first_name") as string | null)?.trim() || null;
  const lastName = (formData.get("last_name") as string | null)?.trim() || null;
  const displayName = (formData.get("display_name") as string | null)?.trim();

  const validationError = validateSlug(slug);
  if (validationError) return { error: validationError };
  if (!displayName) return { error: "artist name is required" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "not authenticated" };

  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("slug", slug)
    .single();

  if (existing) return { error: "that slug is already taken" };

  const { error } = await supabase.from("profiles").upsert({
    id: user.id,
    slug,
    display_name: displayName,
    first_name: firstName,
    last_name: lastName,
    timezone: "Europe/Berlin",
  });

  if (error) return { error: error.message.toLowerCase() };

  redirect("/onboarding/profile");
}
