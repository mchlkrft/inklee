import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { serviceClient } from "@/lib/supabase/service";
import { normalizeProfileInput } from "@/lib/mobile-onboarding";
import { isAdminEmail } from "@/lib/admin-guard";
import { shouldFireBookingLinkCreated } from "@/lib/analytics-gates";
import { trackServerEvent } from "@/lib/track-server";
import { recordGrowthEvent } from "@/lib/growth/record-event";
import { writeAudit } from "@/lib/audit";
import type { MobileOnboardingProfile } from "@inklee/shared/mobile-api";

export const runtime = "nodejs";

// POST /api/mobile/onboarding/profile
//   { slug, displayName, instagramHandle?, location?, timezone? }
// Claims the artist's booking link. The profile row's existence is the real
// activation boundary — a preferred_date artist is live and bookable the instant
// it exists (books default open). Upsert by id; RLS's own-row INSERT policy
// (WITH CHECK auth.uid()=id) keeps an artist from writing anyone else's row.
// We pre-check slug uniqueness AND catch the unique-index violation, so the
// check↔upsert race resolves to a clean 409 rather than a 500.
export async function POST(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return mobileError(400, "Invalid JSON body.");
  }

  const parsed = normalizeProfileInput(raw);
  if (!parsed.ok) return mobileError(400, parsed.error);
  const { slug, displayName, instagramHandle, location, timezone } =
    parsed.value;

  // Someone else already holds this slug. Uses the service client because the
  // public profiles SELECT policy was dropped in 0030 — an RLS read can't see
  // another artist's row, which would make this pre-check a no-op (only `id` is
  // read; no other-artist data is returned). The unique-index catch below is the
  // race backstop.
  const { data: taken, error: lookupError } = await serviceClient
    .from("profiles")
    .select("id")
    .eq("slug", slug)
    .neq("id", userId)
    .maybeSingle();
  if (lookupError) return mobileError(500, lookupError.message);
  if (taken) return mobileError(409, "That link was just taken.", "slug_taken");

  // Prior state, read before the upsert so booking_link_created can fire only
  // on the first null -> slug transition (the upsert also runs on re-claims).
  const { data: prevProfile, error: prevReadError } = await supabase
    .from("profiles")
    .select("slug, is_tester")
    .eq("id", userId)
    .maybeSingle();
  // A failed read must not masquerade as "no profile yet": isFirstClaim below
  // would misfire and overwrite existing signup_attribution on a re-claim.
  if (prevReadError) return mobileError(500, prevReadError.message);

  const isFirstClaim = !prevProfile?.slug;

  const { error } = await supabase.from("profiles").upsert({
    id: userId,
    slug,
    display_name: displayName,
    instagram_handle: instagramHandle,
    location,
    timezone,
    updated_at: new Date().toISOString(),
    // Mobile signups carry no UTM context yet (no deep-link attribution);
    // platform + capture time still distinguish them from pre-instrumentation
    // accounts (NULL). Written exactly once, on the first claim.
    ...(isFirstClaim
      ? {
          signup_attribution: {
            platform: "mobile",
            captured_at: new Date().toISOString(),
          },
        }
      : {}),
  });
  if (error) {
    // Lost the check↔upsert race on the slug unique index (Postgres 23505).
    if (error.code === "23505") {
      return mobileError(409, "That link was just taken.", "slug_taken");
    }
    return mobileError(500, error.message);
  }

  void writeAudit({
    action: "onboarding_profile_claimed",
    actor: userId,
    category: "settings",
    details: { slug },
  });

  // booking_link_created conversion event (internal traffic excluded).
  if (
    shouldFireBookingLinkCreated(
      prevProfile?.slug,
      (prevProfile as { is_tester?: boolean | null } | null)?.is_tester ===
        true,
    )
  ) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!isAdminEmail(user?.email)) {
      trackServerEvent("booking_link_created", {
        path: "/onboarding/claim-slug",
        props: { platform: "mobile_app" },
        headers: req.headers,
      });
    }
  }

  if (isFirstClaim) {
    // Growth milestones (first-party, dedupe-keyed); internal exclusion
    // happens inside the recorder. Awaited: once-only milestones must not be
    // lost to serverless teardown, and the recorder never throws.
    await recordGrowthEvent(
      { event: "page_published", props: {} },
      {
        artistId: userId,
        source: "mobile",
        email: auth.email,
        isTester:
          (prevProfile as { is_tester?: boolean | null } | null)?.is_tester ===
          true,
      },
    );
    await recordGrowthEvent(
      { event: "onboarding_step_completed", props: { step: "claim_slug" } },
      {
        artistId: userId,
        source: "mobile",
        email: auth.email,
        isTester:
          (prevProfile as { is_tester?: boolean | null } | null)?.is_tester ===
          true,
      },
    );
  }

  const body: MobileOnboardingProfile = { slug, displayName };
  return mobileOk(body);
}
