"use server";

import { createClient } from "@/lib/supabase/server";
import { validateSlug } from "@/lib/slug";
import { normalizeProfileFields } from "@inklee/shared/profile-validation";
import {
  resolveSlugAvailabilityServer,
  isSlugTakenByOther,
} from "@/lib/server/slug-availability";
import { isAdminEmail } from "@/lib/admin-guard";
import {
  attributionPropsFromForm,
  sanitizeAttributionValue,
  shouldFireBookingLinkCreated,
} from "@/lib/analytics-gates";
import { trackServerEvent } from "@/lib/track-server";
import { recordGrowthEvent } from "@/lib/growth/record-event";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

type State = { error: string } | null;

const LAST_TOUCH_KEYS = [
  "last_entry_path",
  "last_referrer",
  "last_source",
  "last_medium",
  "last_campaign",
] as const;

/** Last-touch acquisition fields (same validation as first-touch: expected
 *  keys only, clamped, content-filtered). */
function lastTouchPropsFromForm(formData: {
  get(name: string): unknown;
}): Record<string, string> {
  const props: Record<string, string> = {};
  for (const key of LAST_TOUCH_KEYS) {
    const raw = formData.get(`attr_${key}`);
    if (typeof raw !== "string") continue;
    const value = sanitizeAttributionValue(raw);
    if (value) props[key] = value;
  }
  return props;
}

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

  const { data: currentProfile, error: profileReadError } = await supabase
    .from("profiles")
    .select("timezone, slug, is_tester, instagram_handle, location")
    .eq("id", user.id)
    .maybeSingle();
  // A failed read must not masquerade as "no profile yet": isFirstClaim below
  // would misfire and overwrite existing signup_attribution on a re-claim.
  if (profileReadError) {
    return { error: "Could not load your profile. Please try again." };
  }

  // Service-client pre-check (0030 dropped the public profiles SELECT policy, so
  // an RLS read can't see another artist's row). The 23505 catch below is the
  // check<->upsert race backstop, matching the mobile onboarding route.
  if (await isSlugTakenByOther(slug, user.id)) {
    return { error: "That slug is already taken." };
  }

  const isFirstClaim = !currentProfile?.slug;

  // Blank optional fields must not wipe previously saved values — this form
  // does not prefill them, so a re-visit (back-navigation mid-wizard, or an
  // onboarded artist returning to /onboarding/claim-slug) would otherwise
  // null out Instagram and location. Clearing them lives in Settings.
  const { error } = await supabase.from("profiles").upsert({
    id: user.id,
    slug,
    display_name: displayName,
    instagram_handle:
      instagramHandle ?? currentProfile?.instagram_handle ?? null,
    location: location ?? currentProfile?.location ?? null,
    timezone: currentProfile?.timezone ?? "Europe/Berlin",
    updated_at: new Date().toISOString(),
    // First-touch attribution, persisted exactly once (the first claim). The
    // values arrive as validated, length-clamped hidden fields (localStorage
    // capture; cookie-free). Last-touch keys carry the CURRENT session's
    // acquisition context (sessionStorage) and are captured at the same
    // moment, i.e. the last touch as of registration completion. Written even
    // when empty so "captured, nothing to attribute" (direct visit) stays
    // distinguishable from accounts that predate capture (NULL).
    ...(isFirstClaim
      ? {
          signup_attribution: {
            ...attributionPropsFromForm(formData),
            ...lastTouchPropsFromForm(formData),
            platform: "web",
            captured_at: new Date().toISOString(),
          },
        }
      : {}),
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "That slug is already taken." };
    }
    return { error: error.message.toLowerCase() };
  }

  // booking_link_created: only on the first null -> slug transition (the
  // upsert also runs for own-slug re-claims); internal traffic excluded.
  // Attribution props arrive as hidden form fields (validated + clamped).
  const isInternalUser =
    isAdminEmail(user.email) || currentProfile?.is_tester === true;
  if (shouldFireBookingLinkCreated(currentProfile?.slug, isInternalUser)) {
    trackServerEvent("booking_link_created", {
      path: "/onboarding/claim-slug",
      props: { ...attributionPropsFromForm(formData), platform: "web" },
      headers: await headers(),
    });
  }

  if (isFirstClaim) {
    // Growth milestones (first-party, dedupe-keyed): the page is live the
    // moment the slug exists. Internal exclusion happens inside the recorder.
    // AWAITED (the recorder never throws): these fire at most once per account,
    // and a fire-and-forget write could be lost to serverless teardown.
    await recordGrowthEvent(
      { event: "page_published", props: {} },
      {
        artistId: user.id,
        source: "web",
        email: user.email,
        isTester: currentProfile?.is_tester === true,
      },
    );
    await recordGrowthEvent(
      { event: "onboarding_step_completed", props: { step: "claim_slug" } },
      {
        artistId: user.id,
        source: "web",
        email: user.email,
        isTester: currentProfile?.is_tester === true,
      },
    );
  }

  redirect("/onboarding/booking");
}
