import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { parseBooksSettings } from "@/lib/books-settings";
import {
  normalizeBookingInput,
  isClaimedProfile,
} from "@/lib/mobile-onboarding";
import { writeAudit } from "@/lib/audit";
import type { MobileOnboardingBooking } from "@inklee/shared/mobile-api";

export const runtime = "nodejs";

// POST /api/mobile/onboarding/booking
//   { bookingMode, booksOpen, booksClosedMessage? }
// Collapses the web booking + availability steps into one write: set
// booking_mode and merge books_settings (open flag + optional closed message),
// preserving the other books_settings keys (cap / window / appearance) the way
// settings/books does. Requires the claim step to have run first.
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

  const parsed = normalizeBookingInput(raw);
  if (!parsed.ok) return mobileError(400, parsed.error);
  const { bookingMode, booksOpen, booksClosedMessage } = parsed.value;

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
  const books = parseBooksSettings(current.books_settings);

  // Preserve every other books_settings key. Only touch the closed message when
  // *closing* — opening leaves any prior message dormant rather than wiping it
  // (matches settings/books, which never clears it).
  const nextBooks = { ...books, books_open: booksOpen };
  if (!booksOpen) nextBooks.books_closed_message = booksClosedMessage;

  const { error } = await supabase
    .from("profiles")
    .update({
      booking_mode: bookingMode,
      settings: { ...current, books_settings: nextBooks },
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
  if (error) return mobileError(500, error.message);

  void writeAudit({
    action: "onboarding_booking_set",
    actor: userId,
    category: "settings",
    details: { booking_mode: bookingMode, books_open: booksOpen },
  });

  const body: MobileOnboardingBooking = { bookingMode, booksOpen };
  return mobileOk(body);
}
