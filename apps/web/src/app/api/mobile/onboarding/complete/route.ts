import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { isClaimedProfile } from "@/lib/mobile-onboarding";
import { writeAudit } from "@/lib/audit";
import type { MobileOnboardingComplete } from "@inklee/shared/mobile-api";

export const runtime = "nodejs";

// POST /api/mobile/onboarding/complete — flip settings.onboarding_completed so
// the app's router swaps the onboarding stack for the tabs. Guards that the
// profile (slug) exists first, then read-modify-writes the flag, preserving the
// other settings keys. Idempotent: a second call is a no-op that still returns
// onboardingCompleted:true. Ports done/page.tsx, which today sets the flag only
// as a side-effect of *rendering* the web page (there is no web API for it).
export async function POST(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  const { data: profile, error: readError } = await supabase
    .from("profiles")
    .select("slug, settings")
    .eq("id", userId)
    .maybeSingle();
  if (readError) return mobileError(500, readError.message);
  if (!isClaimedProfile(profile)) {
    return mobileError(409, "Claim your link first.", "no_profile");
  }

  const current = (profile.settings ?? {}) as Record<string, unknown>;
  if (current.onboarding_completed !== true) {
    const { error } = await supabase
      .from("profiles")
      .update({
        settings: { ...current, onboarding_completed: true },
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);
    if (error) return mobileError(500, error.message);

    void writeAudit({
      action: "onboarding_completed",
      actor: userId,
      category: "settings",
      details: {},
    });
  }

  const body: MobileOnboardingComplete = { onboardingCompleted: true };
  return mobileOk(body);
}
