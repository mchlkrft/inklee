import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { isClaimedProfile } from "@/lib/mobile-onboarding";
import { isAdminEmail } from "@/lib/admin-guard";
import { evaluateSignupCompletion } from "@/lib/analytics-gates";
import { trackServerEvent } from "@/lib/track-server";
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
    .select("slug, settings, is_tester")
    .eq("id", userId)
    .maybeSingle();
  if (readError) return mobileError(500, readError.message);
  if (!isClaimedProfile(profile)) {
    return mobileError(409, "Claim your link first.", "no_profile");
  }

  // signup_completed conversion gate (shared with the web done page): fires
  // once per account on the genuine completion transition; internal traffic
  // (admins, is_tester) persists the flag but never sends the event.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isInternalUser =
    isAdminEmail(user?.email) ||
    (profile as { is_tester?: boolean | null }).is_tester === true;
  const gate = evaluateSignupCompletion(
    profile.settings as Record<string, unknown> | null,
    isInternalUser,
  );
  if (gate.completesNow) {
    const { error } = await supabase
      .from("profiles")
      .update({
        settings: gate.nextSettings,
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

    if (gate.fire) {
      trackServerEvent("signup_completed", {
        path: "/onboarding/done",
        props: { platform: "mobile_app" },
        headers: req.headers,
      });
    }
  }

  const body: MobileOnboardingComplete = { onboardingCompleted: true };
  return mobileOk(body);
}
