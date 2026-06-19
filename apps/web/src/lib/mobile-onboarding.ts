// Pure input validation/normalization for the mobile onboarding endpoints
// (/api/mobile/onboarding/*). The route handlers stay thin — they call these to
// turn an untyped JSON body into a validated value (or a plain-English error),
// then do the trivial Supabase upsert inline. Keeping the decision logic here
// (no DB, no Supabase) makes it unit-testable the same way slug.ts / books-
// settings.ts are, without a route-handler mocking harness.

import { validateSlug } from "./slug";
import type { BookingMode } from "@inklee/shared/booking-domain";
import { normalizeProfileFields } from "@inklee/shared/profile-validation";

/** The two booking modes stored in `profiles.booking_mode` (canonical type from
 *  @inklee/shared/booking-domain). */
export const BOOKING_MODES = [
  "preferred_date",
  "fixed_slots",
] as const satisfies readonly BookingMode[];

export function isBookingMode(value: unknown): value is BookingMode {
  return (
    typeof value === "string" &&
    (BOOKING_MODES as readonly string[]).includes(value)
  );
}

/** Fallback when the client sends no device timezone. */
export const DEFAULT_TIMEZONE = "Europe/Berlin";

// Length caps now live in the shared profile validator; re-export so existing
// importers of `@/lib/mobile-onboarding` (and its tests) keep resolving.
export {
  DISPLAY_NAME_MAX,
  INSTAGRAM_MAX,
  LOCATION_MAX,
} from "@inklee/shared/profile-validation";

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export type NormalizedProfileInput = {
  slug: string;
  displayName: string;
  instagramHandle: string | null;
  location: string | null;
  timezone: string;
};

/**
 * Validate + normalize the claim-link payload. Like the web claimSlugAction:
 * slug is lower-cased/trimmed then format-validated; display name is required;
 * Instagram drops a leading `@` and collapses empty → null. Unlike the web (which
 * preserves a stored timezone), the mobile client sends the *device* timezone —
 * a deliberate improvement over the web's hardcoded default — falling back to
 * Europe/Berlin only when absent. Free-text fields are length-capped.
 */
export function normalizeProfileInput(
  body: unknown,
): Result<NormalizedProfileInput> {
  const b = (body ?? {}) as Record<string, unknown>;

  const slug = asString(b.slug).trim().toLowerCase();
  const slugError = validateSlug(slug);
  if (slugError) return { ok: false, error: slugError };

  // Display name + instagram + location share the canonical bounds/normalization
  // (the claim payload has no bio). Same error copy as before.
  const fields = normalizeProfileFields({
    displayName: b.displayName,
    instagramHandle: b.instagramHandle,
    location: b.location,
  });
  if (!fields.ok) return fields;

  const timezoneRaw = asString(b.timezone).trim();
  const timezone = timezoneRaw.length > 0 ? timezoneRaw : DEFAULT_TIMEZONE;

  return {
    ok: true,
    value: {
      slug,
      displayName: fields.value.displayName,
      instagramHandle: fields.value.instagramHandle,
      location: fields.value.location,
      timezone,
    },
  };
}

/**
 * The gate the booking/complete steps require: the profile row exists AND has
 * claimed a slug (the claim step must run first). A type guard so the route can
 * read `profile.slug`/`profile.settings` after it without a non-null assertion.
 */
export function isClaimedProfile<T extends { slug: string | null }>(
  profile: T | null | undefined,
): profile is T & { slug: string } {
  return (
    !!profile && typeof profile.slug === "string" && profile.slug.length > 0
  );
}

/**
 * Given the `profiles` row (if any) holding a slug and the requesting user,
 * decide availability for the live claim-screen check. The artist's own slug is
 * reported `owned` so the form stays usable when they step back to it.
 */
export function resolveSlugAvailability(
  found: { id: string } | null,
  userId: string,
): { available: boolean; owned: boolean } {
  if (!found) return { available: true, owned: false };
  if (found.id === userId) return { available: true, owned: true };
  return { available: false, owned: false };
}

export type NormalizedBookingInput = {
  bookingMode: BookingMode;
  booksOpen: boolean;
  booksClosedMessage: string | null;
};

/**
 * Validate the booking-setup payload (the mobile wizard collapses the web's
 * booking + availability steps into one write): a valid booking mode, a boolean
 * open flag, and an optional closed message (empty → null).
 */
export function normalizeBookingInput(
  body: unknown,
): Result<NormalizedBookingInput> {
  const b = (body ?? {}) as Record<string, unknown>;

  if (!isBookingMode(b.bookingMode)) {
    return {
      ok: false,
      error: "bookingMode must be 'preferred_date' or 'fixed_slots'.",
    };
  }
  if (typeof b.booksOpen !== "boolean") {
    return { ok: false, error: "booksOpen must be a boolean." };
  }

  const messageRaw =
    typeof b.booksClosedMessage === "string" ? b.booksClosedMessage.trim() : "";
  const booksClosedMessage = messageRaw.length > 0 ? messageRaw : null;

  return {
    ok: true,
    value: {
      bookingMode: b.bookingMode,
      booksOpen: b.booksOpen,
      booksClosedMessage,
    },
  };
}
