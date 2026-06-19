import type { CustomAnswerSnapshot } from "./custom-fields";

export type BookingMode = "preferred_date" | "fixed_slots";

/** The two booking modes stored in profiles.booking_mode (a Postgres enum). */
export const BOOKING_MODES = [
  "preferred_date",
  "fixed_slots",
] as const satisfies readonly BookingMode[];

/**
 * Strict membership check for the WRITE paths: reject anything that isn't one of
 * the two modes (anything else gets a friendly app-layer error instead of a raw
 * Postgres enum error). The coercing normalizeBookingMode below answers a
 * different question (coerce a stored value to a safe display mode) and must NOT
 * be used to validate writes. (ME-10 D16)
 */
export function isBookingMode(value: unknown): value is BookingMode {
  return (
    typeof value === "string" &&
    (BOOKING_MODES as readonly string[]).includes(value)
  );
}

type BookingFormData = Record<string, unknown> | null | undefined;

export function normalizeBookingMode(
  value: string | null | undefined,
): BookingMode {
  return value === "fixed_slots" ? "fixed_slots" : "preferred_date";
}

export function bookingModeFromRequest(row: {
  slot_id?: string | null;
  slotId?: string | null;
}): BookingMode {
  return row.slot_id || row.slotId ? "fixed_slots" : "preferred_date";
}

export function bookingModeLabel(mode: BookingMode): string {
  return mode === "fixed_slots" ? "Fixed slot" : "Preferred date";
}

/**
 * Display name for a customer. Clients may provide Instagram OR email (one is
 * enough), so a handle is no longer guaranteed. Prefer "@handle", fall back to
 * the email, then a generic label — never render a bare "@".
 */
export function customerLabel(
  handle?: string | null,
  email?: string | null,
  fallback = "Client",
): string {
  const h = handle?.trim();
  if (h) return `@${h}`;
  const e = email?.trim();
  if (e) return e;
  return fallback;
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function getCustomAnswers(formData: BookingFormData): CustomAnswerSnapshot[] {
  const raw = formData?.custom_answers;
  return Array.isArray(raw) ? (raw as CustomAnswerSnapshot[]) : [];
}

export function hasCustomAnswers(formData: BookingFormData): boolean {
  return getCustomAnswers(formData).length > 0;
}

export function buildBookingFingerprintKey(input: {
  bookingMode: BookingMode;
  customerEmail?: string | null;
  customerHandle?: string | null;
  preferredDate?: string | null;
  slotId?: string | null;
  tripId?: string | null;
  flashItemId?: string | null;
  placement?: string | null;
  size?: string | null;
}): string {
  return [
    input.bookingMode,
    normalizeText(input.customerEmail),
    normalizeText(input.customerHandle),
    input.preferredDate ?? "",
    input.slotId ?? "",
    input.tripId ?? "",
    input.flashItemId ?? "",
    normalizeText(input.placement),
    normalizeText(input.size),
  ].join("|");
}

export function portalEditSupport(input: {
  status: string;
  customerEmail?: string | null;
  preferredDate?: string | null;
  customerHandle?: string | null;
  slotId?: string | null;
  tripId?: string | null;
  flashItemId?: string | null;
  formData?: BookingFormData;
}): { editable: true } | { editable: false; reason: string } {
  if (input.status !== "pending") {
    return {
      editable: false,
      reason: "Only pending requests can still be edited.",
    };
  }

  if (!input.customerEmail) {
    return {
      editable: false,
      reason:
        "This request was submitted without an email address, so edits are disabled for safety.",
    };
  }

  if (input.slotId) {
    return {
      editable: false,
      reason:
        "Requests tied to a fixed slot can’t be edited here yet. Contact the artist if you need to change the time.",
    };
  }

  if (input.tripId) {
    return {
      editable: false,
      reason:
        "Requests tied to a trip or guest spot can’t be edited here yet. Contact the artist if you need to change the location or date.",
    };
  }

  if (input.flashItemId) {
    return {
      editable: false,
      reason:
        "Flash bookings can’t be edited here yet. Contact the artist if you need to make changes.",
    };
  }

  if (hasCustomAnswers(input.formData)) {
    return {
      editable: false,
      reason:
        "This request includes custom questions, so edits are disabled until the full edit flow supports them safely.",
    };
  }

  const placement =
    typeof input.formData?.placement === "string"
      ? input.formData.placement
      : "";
  const size =
    typeof input.formData?.size === "string" ? input.formData.size : "";

  if (!input.customerHandle || !input.preferredDate || !placement || !size) {
    return {
      editable: false,
      reason:
        "This request uses a booking form configuration that isn’t fully supported by self-service editing yet.",
    };
  }

  return { editable: true };
}
