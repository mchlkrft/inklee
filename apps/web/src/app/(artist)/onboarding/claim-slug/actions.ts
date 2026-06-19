"use server";

import { createClient } from "@/lib/supabase/server";
import { validateSlug } from "@/lib/slug";
import { normalizeProfileFields } from "@inklee/shared/profile-validation";
import {
  resolveSlugAvailabilityServer,
  isSlugTakenByOther,
} from "@/lib/server/slug-availability";
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

  // Service-client lookup: an RLS read can't see other artists' rows (0030), so
  // it would mark every taken slug as free. Mirrors the mobile slug-check route.
  const { available, owned } = await resolveSlugAvailabilityServer(
    slug,
    user?.id ?? "",
  );
  return { available, owned, error: null };
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

  // Service-client pre-check (0030 dropped the public profiles SELECT policy, so
  // an RLS read can't see another artist's row). The 23505 catch below is the
  // check<->upsert race backstop, matching the mobile onboarding route.
  if (await isSlugTakenByOther(slug, user.id)) {
    return { error: "That slug is already taken." };
  }

  const { error } = await supabase.from("profiles").upsert({
    id: user.id,
    slug,
    display_name: displayName,
    instagram_handle: instagramHandle,
    location,
    timezone: currentProfile?.timezone ?? "Europe/Berlin",
    updated_at: new Date().toISOString(),
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "That slug is already taken." };
    }
    return { error: error.message.toLowerCase() };
  }

  redirect("/onboarding/booking");
}
