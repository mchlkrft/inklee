import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { getAccountOverrides } from "@/lib/entitlements-server";
import { canAccess, effectivePlanTier } from "@/lib/entitlements";
import { parseBooksSettings } from "@/lib/books-settings";
import type { MobileMe } from "@inklee/shared/mobile-api";

export const runtime = "nodejs";

// GET /api/mobile/me — the signed-in artist's identity + plan/entitlement state.
// The app calls this on launch to route (onboarding vs home) and to gate the
// deposit UI client-side.
export async function GET(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  const { data: profile } = await supabase
    .from("profiles")
    .select("slug, display_name, booking_mode, timezone, settings")
    .eq("id", userId)
    .single();

  const overrides = await getAccountOverrides(userId);
  const settings = (profile?.settings ?? {}) as Record<string, unknown>;
  const books = parseBooksSettings(settings.books_settings);

  const body: MobileMe = {
    userId,
    slug: profile?.slug ?? null,
    displayName: profile?.display_name ?? null,
    timezone: profile?.timezone ?? "Europe/Berlin",
    bookingMode: profile?.booking_mode ?? "preferred_date",
    booksOpen: books.books_open,
    onboardingCompleted: settings.onboarding_completed === true,
    plan: effectivePlanTier(overrides),
    canCollectDeposits: canAccess(overrides, "deposits"),
  };
  return mobileOk(body);
}
