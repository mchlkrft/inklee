// Pure input validation/normalization for the mobile settings mutations
// (/api/mobile/settings/*). Same pattern as mobile-onboarding.ts — the route
// handlers stay thin (validate → trivial Supabase write), and the decision logic
// lives here so it's unit-testable without a route-handler mocking harness.
// Mirrors the web Server Actions (updateProfileAction / saveBooksSettingsAction /
// saveDepositDefaultsAction / saveDepositPolicyAction) for the fields the app
// edits.

import type { BooksSettings } from "./books-settings";
import {
  DEPOSIT_DEFAULTS_FALLBACK,
  type DepositDefaults,
} from "./deposit-settings";
import {
  FORFEIT_PCT_OPTIONS,
  type DepositPolicy,
  type ForfeitPct,
  type PolicyWindow,
  type TimeUnit,
} from "./deposit-policy";
import type { BookingMode } from "@inklee/shared/booking-domain";

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

// Field bounds (mirror the web actions / shared parsers).
export const DISPLAY_NAME_MAX = 80;
export const BIO_MAX = 280;
export const INSTAGRAM_MAX = 30;
export const LOCATION_MAX = 120;
export const CLOSED_MESSAGE_MAX = 280;
export const DEPOSIT_MAX_AMOUNT = 100_000;
export const DEPOSIT_MAX_DUE_DAYS = 90;
export const DEPOSIT_MAX_NOTE = 300;

// Cover color for the public-page header — a brand swatch name or a raw #hex.
// Mirrors sanitizeCoverColor in the web updateProfileAction so both write
// paths accept exactly the same values.
const COVER_COLOR_NAMES = new Set([
  "mustard",
  "rosa",
  "cobalt",
  "red",
  "green",
]);

export function sanitizeCoverColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if (!v) return null;
  if (COVER_COLOR_NAMES.has(v)) return v;
  if (/^#[0-9a-f]{3,8}$/.test(v)) return v;
  return null;
}

export type ProfileUpdate = {
  displayName: string;
  bio: string | null;
  instagramHandle: string | null;
  location: string | null;
  // Only present when the client sent them — the route updates these columns
  // conditionally so a partial save never clobbers an unchanged value.
  timezone?: string;
  bookingMode?: BookingMode;
  // Tri-state like the web form's cover_color input: undefined = not sent
  // (leave unchanged), null = clear, string = a sanitized swatch name / #hex
  // to merge into profiles.settings.cover_color.
  coverColor?: string | null;
};

/** Validate the editable text profile fields (no image upload — that stays web). */
export function normalizeProfileUpdate(body: unknown): Result<ProfileUpdate> {
  const b = (body ?? {}) as Record<string, unknown>;

  const displayName = asString(b.displayName).trim();
  if (!displayName) return { ok: false, error: "Display name is required." };
  if (displayName.length > DISPLAY_NAME_MAX) {
    return {
      ok: false,
      error: `Display name is too long (max ${DISPLAY_NAME_MAX} characters).`,
    };
  }

  const bioRaw = asString(b.bio).trim();
  if (bioRaw.length > BIO_MAX) {
    return { ok: false, error: `Bio must be ${BIO_MAX} characters or fewer.` };
  }
  const bio = bioRaw.length > 0 ? bioRaw : null;

  const instagramRaw = asString(b.instagramHandle).trim().replace(/^@+/, "");
  if (instagramRaw.length > INSTAGRAM_MAX) {
    return {
      ok: false,
      error: `Instagram handle is too long (max ${INSTAGRAM_MAX} characters).`,
    };
  }
  const instagramHandle = instagramRaw.length > 0 ? instagramRaw : null;

  const locationRaw = asString(b.location).trim();
  if (locationRaw.length > LOCATION_MAX) {
    return {
      ok: false,
      error: `Location is too long (max ${LOCATION_MAX} characters).`,
    };
  }
  const location = locationRaw.length > 0 ? locationRaw : null;

  const value: ProfileUpdate = { displayName, bio, instagramHandle, location };

  const timezone = asString(b.timezone).trim();
  if (timezone) value.timezone = timezone;

  if (b.bookingMode !== undefined) {
    if (b.bookingMode !== "preferred_date" && b.bookingMode !== "fixed_slots") {
      return { ok: false, error: "Invalid booking mode." };
    }
    value.bookingMode = b.bookingMode;
  }

  // Cover color: null / empty string clears, a valid swatch name or #hex sets,
  // and anything else is silently skipped — the exact semantics of the web
  // updateProfileAction (an invalid value never fails the rest of the save).
  if (b.coverColor !== undefined) {
    if (
      b.coverColor === null ||
      (typeof b.coverColor === "string" && b.coverColor.trim() === "")
    ) {
      value.coverColor = null;
    } else {
      const sanitized = sanitizeCoverColor(b.coverColor);
      if (sanitized) value.coverColor = sanitized;
    }
  }

  return { ok: true, value };
}

/** Validate a standalone booking-mode change (POST /settings/booking-mode).
 * Mirrors saveBookingModeAction's enum check, including its error copy. */
export function normalizeBookingMode(value: unknown): Result<BookingMode> {
  if (value !== "preferred_date" && value !== "fixed_slots") {
    return { ok: false, error: "Invalid booking mode." };
  }
  return { ok: true, value };
}

/**
 * Validate the books-settings form (the PUT on settings/books). Merge semantics:
 * starts from the current settings and overrides ONLY the keys the client sent,
 * so a mobile form that omits a field (e.g. the booking window, which the app
 * doesn't edit) preserves it rather than wiping a value the artist set on web.
 * `open` is always required; `form_appearance` is never sent, always preserved.
 * For each editable field: `null` clears it, an absent key keeps the current value.
 */
export function normalizeBooksConfig(
  body: unknown,
  current: BooksSettings,
): Result<BooksSettings> {
  const b = (body ?? {}) as Record<string, unknown>;

  if (typeof b.open !== "boolean") {
    return { ok: false, error: "open must be a boolean." };
  }

  const next: BooksSettings = { ...current, books_open: b.open };

  if ("bookingCap" in b) {
    const cap = b.bookingCap;
    if (cap === null) {
      next.booking_cap = null;
    } else if (typeof cap === "number" && Number.isFinite(cap) && cap > 0) {
      next.booking_cap = Math.round(cap);
    } else {
      return {
        ok: false,
        error: "Booking cap must be a positive number, or empty.",
      };
    }
  }

  if ("bookingWindowEndsAt" in b) {
    const win = b.bookingWindowEndsAt;
    if (win === null) {
      next.booking_window_ends_at = null;
    } else if (typeof win === "string") {
      next.booking_window_ends_at = win.trim() || null;
    } else {
      return { ok: false, error: "Invalid booking window date." };
    }
  }

  if ("booksClosedMessage" in b) {
    const msg = b.booksClosedMessage;
    if (msg === null) {
      next.books_closed_message = null;
    } else if (typeof msg === "string") {
      const trimmed = msg.trim();
      if (trimmed.length > CLOSED_MESSAGE_MAX) {
        return {
          ok: false,
          error: `Closed message must be ${CLOSED_MESSAGE_MAX} characters or fewer.`,
        };
      }
      next.books_closed_message = trimmed || null;
    } else {
      return { ok: false, error: "Invalid closed message." };
    }
  }

  return { ok: true, value: next };
}

/** Validate the deposit-defaults form (mirrors saveDepositDefaultsAction). */
export function normalizeDepositDefaults(
  body: unknown,
): Result<DepositDefaults> {
  const b = (body ?? {}) as Record<string, unknown>;

  // Amount — null/0/absent ⇒ "no default, force per-request entry".
  let amount: number | null = null;
  if (b.amount !== undefined && b.amount !== null) {
    if (
      typeof b.amount !== "number" ||
      !Number.isFinite(b.amount) ||
      b.amount < 0
    ) {
      return { ok: false, error: "Default amount must be a positive number." };
    }
    if (b.amount > DEPOSIT_MAX_AMOUNT) {
      return {
        ok: false,
        error: `Default amount can’t exceed ${DEPOSIT_MAX_AMOUNT.toLocaleString()}.`,
      };
    }
    amount = b.amount === 0 ? null : Math.round(b.amount * 100) / 100;
  }

  const dueDays =
    typeof b.dueDays === "number"
      ? b.dueDays
      : DEPOSIT_DEFAULTS_FALLBACK.due_days;
  if (
    !Number.isFinite(dueDays) ||
    !Number.isInteger(dueDays) ||
    dueDays < 1 ||
    dueDays > DEPOSIT_MAX_DUE_DAYS
  ) {
    return {
      ok: false,
      error: `Due window must be between 1 and ${DEPOSIT_MAX_DUE_DAYS} days.`,
    };
  }

  const note = asString(b.note).trim().slice(0, DEPOSIT_MAX_NOTE);

  return { ok: true, value: { amount, due_days: dueDays, note } };
}

/** One bounded policy window ({ value, unit }) from the client body. Mirrors
 * the web action's parseWindowField (0..365 days / 0..720 hours, integers). */
function normalizePolicyWindow(raw: unknown): Result<PolicyWindow> {
  const o = (raw ?? {}) as Record<string, unknown>;
  const unit: TimeUnit = o.unit === "hours" ? "hours" : "days";
  const max = unit === "hours" ? 720 : 365;
  if (
    typeof o.value !== "number" ||
    !Number.isInteger(o.value) ||
    o.value < 0 ||
    o.value > max
  ) {
    return {
      ok: false,
      error: `Each window must be between 0 and ${max} ${unit}.`,
    };
  }
  return { ok: true, value: { value: o.value, unit } };
}

/**
 * Validate the structured deposit policy (mirrors saveDepositPolicyAction).
 * Only the three constrained parameters are accepted — never free text.
 * Reciprocity (artist cancels => full client refund) is hard-coded in the
 * refund logic, not stored here, and not artist-overridable.
 */
export function normalizeDepositPolicy(body: unknown): Result<DepositPolicy> {
  const b = (body ?? {}) as Record<string, unknown>;

  const refundWindow = normalizePolicyWindow(b.refundWindow);
  if (!refundWindow.ok) return refundWindow;

  if (
    !(FORFEIT_PCT_OPTIONS as readonly number[]).includes(
      b.lateCancelForfeitPct as number,
    )
  ) {
    return { ok: false, error: "Pick a forfeit percentage from the list." };
  }

  // Last-minute window is optional — null/absent means the toggle is off.
  let lastMinute: PolicyWindow | null = null;
  if (b.lastMinute !== undefined && b.lastMinute !== null) {
    const lm = normalizePolicyWindow(b.lastMinute);
    if (!lm.ok) return lm;
    lastMinute = lm.value;
  }

  return {
    ok: true,
    value: {
      refundWindow: refundWindow.value,
      lateCancelForfeitPct: b.lateCancelForfeitPct as ForfeitPct,
      lastMinute,
    },
  };
}

// Artist web pages the app may hand off to via a one-time Connect login link.
// Allowlisted to prevent the magic-link endpoint becoming an open redirect.
export const CONNECT_LINK_ALLOWED_NEXT = new Set([
  "/settings/payouts",
  "/bookings/deposits",
  "/settings/emails",
  // Account management (email / password / 2FA) + the GDPR data export, both
  // handed off from the app's Account & security screen.
  "/settings/account",
  "/settings/export",
]);

export function resolveConnectNext(next: unknown): string {
  return typeof next === "string" && CONNECT_LINK_ALLOWED_NEXT.has(next)
    ? next
    : "/settings/payouts";
}
