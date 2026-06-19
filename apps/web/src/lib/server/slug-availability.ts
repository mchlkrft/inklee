// Slug availability via the SERVICE client. The public `profiles` SELECT policy
// was dropped in migration 0030, so an RLS-scoped read only sees the caller's OWN
// row and would report every OTHER artist's taken slug as free. The mobile
// onboarding routes already use this pattern; the web onboarding actions were
// still on the RLS-scoped client (the D17 bug). Only `id` is read and only
// { available, owned } / a boolean leaves these helpers — no other-artist data
// is exposed. (ME-10 D17)

import { serviceClient } from "@/lib/supabase/service";
import { resolveSlugAvailability } from "@/lib/mobile-onboarding";

/** Live availability for the claim screen: free, owned (re-claiming your own),
 *  or taken by someone else. `userId` may be empty for an unauthenticated probe
 *  (then a found slug always reads as taken). */
export async function resolveSlugAvailabilityServer(
  slug: string,
  userId: string,
): Promise<{ available: boolean; owned: boolean }> {
  const { data } = await serviceClient
    .from("profiles")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  return resolveSlugAvailability(data ?? null, userId);
}

/** True when another artist already holds this slug (the claim pre-check). */
export async function isSlugTakenByOther(
  slug: string,
  userId: string,
): Promise<boolean> {
  const { data } = await serviceClient
    .from("profiles")
    .select("id")
    .eq("slug", slug)
    .neq("id", userId)
    .maybeSingle();
  return !!data;
}
