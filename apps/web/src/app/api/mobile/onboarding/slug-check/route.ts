import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { serviceClient } from "@/lib/supabase/service";
import { validateSlug } from "@/lib/slug";
import { resolveSlugAvailability } from "@/lib/mobile-onboarding";
import type { MobileSlugCheck } from "@inklee/shared/mobile-api";

export const runtime = "nodejs";

// GET /api/mobile/onboarding/slug-check?slug=<s> — live availability for the
// onboarding claim screen. Validate the format first (cheap, no DB), then look
// the slug up. The artist's own slug reports owned:true so re-claiming it (e.g.
// stepping back) stays allowed.
//
// The existence lookup uses the service client, NOT the caller's RLS-scoped
// client: the public `profiles` SELECT policy was dropped in migration 0030, so
// an RLS read only sees the artist's OWN row and would report every other
// artist's taken slug as available. We read a single boolean-ish column (`id`)
// to decide existence/ownership and never return another artist's data — the
// response is only { available, owned } — so this is safe (and mirrors how the
// public bio pages resolve a slug via serviceClient).
export async function GET(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId } = auth;

  const slug = (new URL(req.url).searchParams.get("slug") ?? "")
    .trim()
    .toLowerCase();

  const formatError = validateSlug(slug);
  if (formatError) {
    const body: MobileSlugCheck = {
      slug,
      available: false,
      owned: false,
      error: formatError,
    };
    return mobileOk(body);
  }

  const { data, error } = await serviceClient
    .from("profiles")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (error) return mobileError(500, error.message);

  const { available, owned } = resolveSlugAvailability(data, userId);
  const body: MobileSlugCheck = { slug, available, owned, error: null };
  return mobileOk(body);
}
