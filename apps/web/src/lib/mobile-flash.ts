// Pure input validation/normalization for the mobile flash endpoints
// (/api/mobile/flash/*). Same pattern as mobile-onboarding.ts / mobile-settings.ts.
// Mirrors the web flash actions' field rules for the metadata the app edits;
// image upload + slug regeneration stay web-only (the app preserves the slug +
// preview image it loaded).

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

// Status vocabulary is single-sourced in @inklee/shared/flash-format (ME-10);
// imported for the validators below and re-exported so existing
// "@/lib/mobile-flash" importers keep resolving these names.
import {
  FLASH_ITEM_STATUSES,
  FLASH_PRICE_TYPES,
  FLASH_BOOKING_MODES,
  FLASH_DAY_STATUSES,
} from "@inklee/shared/flash-format";
import type {
  FlashItemStatus,
  FlashPriceType,
  FlashBookingMode,
  FlashDayStatus,
} from "@inklee/shared/flash-format";

export {
  FLASH_ITEM_STATUSES,
  FLASH_PRICE_TYPES,
  FLASH_BOOKING_MODES,
  FLASH_DAY_STATUSES,
};
export type {
  FlashItemStatus,
  FlashPriceType,
  FlashBookingMode,
  FlashDayStatus,
};

const TITLE_MAX = 120;
const SHORT_DESC_MAX = 280;
const DESCRIPTION_MAX = 2000;
const FIELD_MAX = 280;
const PRICE_MAX = 100_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function oneOf<T extends string>(
  set: readonly T[],
  value: unknown,
): value is T {
  return (
    typeof value === "string" && (set as readonly string[]).includes(value)
  );
}

function optionalDate(
  value: unknown,
): { ok: true; value: string | null } | { ok: false } {
  const s = asString(value).trim();
  if (s === "") return { ok: true, value: null };
  if (!DATE_RE.test(s)) return { ok: false };
  // Reject a syntactically-valid but unreal date (e.g. 2026-13-45) before it
  // hits the Postgres `date` column and turns into a 500.
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) {
    return { ok: false };
  }
  return { ok: true, value: s };
}

export type FlashItemUpdate = {
  title: string;
  status: FlashItemStatus;
  priceType: FlashPriceType;
  price: number | null;
  shortDescription: string | null;
  sizeInfo: string | null;
  placementNotes: string | null;
  bookingMode: FlashBookingMode;
  maxBookings: number | null;
  isBookable: boolean;
  availableFrom: string | null;
  availableUntil: string | null;
  flashDayId: string | null;
};

/** Validate the flash-item metadata edit (no image / slug — those stay web). */
export function normalizeFlashItemUpdate(
  body: unknown,
): Result<FlashItemUpdate> {
  const b = (body ?? {}) as Record<string, unknown>;

  const title = asString(b.title).trim();
  if (!title) return { ok: false, error: "Title is required." };
  if (title.length > TITLE_MAX) {
    return { ok: false, error: `Title is too long (max ${TITLE_MAX}).` };
  }

  if (!oneOf(FLASH_ITEM_STATUSES, b.status)) {
    return { ok: false, error: "Invalid status." };
  }
  if (!oneOf(FLASH_PRICE_TYPES, b.priceType)) {
    return { ok: false, error: "Invalid price type." };
  }
  if (!oneOf(FLASH_BOOKING_MODES, b.bookingMode)) {
    return { ok: false, error: "Invalid booking mode." };
  }
  if (typeof b.isBookable !== "boolean") {
    return { ok: false, error: "isBookable must be a boolean." };
  }

  // Price only applies to fixed/from; "request" clears it.
  let price: number | null = null;
  if (b.priceType !== "request" && b.price !== undefined && b.price !== null) {
    if (
      typeof b.price !== "number" ||
      !Number.isFinite(b.price) ||
      b.price < 0
    ) {
      return { ok: false, error: "Price must be a positive number." };
    }
    if (b.price > PRICE_MAX) {
      return {
        ok: false,
        error: `Price can’t exceed ${PRICE_MAX.toLocaleString()}.`,
      };
    }
    price = Math.round(b.price * 100) / 100;
  }

  // maxBookings only applies to "limited" mode.
  let maxBookings: number | null = null;
  if (b.bookingMode === "limited") {
    const m = b.maxBookings;
    if (typeof m !== "number" || !Number.isInteger(m) || m < 1) {
      return {
        ok: false,
        error: "Max bookings must be at least 1 for limited mode.",
      };
    }
    maxBookings = m;
  }

  const from = optionalDate(b.availableFrom);
  if (!from.ok) return { ok: false, error: "Invalid available-from date." };
  const until = optionalDate(b.availableUntil);
  if (!until.ok) return { ok: false, error: "Invalid available-until date." };
  if (from.value && until.value && until.value < from.value) {
    return {
      ok: false,
      error: "Available-until must be on or after available-from.",
    };
  }

  // flashDayId must be a UUID (or empty) — keeps a garbage value from reaching
  // the uuid column lookup in the route (which would otherwise 500/fail by luck).
  const flashDayRaw = asString(b.flashDayId).trim();
  let flashDayId: string | null = null;
  if (flashDayRaw) {
    if (!UUID_RE.test(flashDayRaw)) {
      return { ok: false, error: "Invalid flash day." };
    }
    flashDayId = flashDayRaw;
  }

  const shortRaw = asString(b.shortDescription).trim();
  if (shortRaw.length > SHORT_DESC_MAX) {
    return {
      ok: false,
      error: `Description must be ${SHORT_DESC_MAX} characters or fewer.`,
    };
  }
  const sizeRaw = asString(b.sizeInfo).trim();
  if (sizeRaw.length > FIELD_MAX) {
    return { ok: false, error: "Size info is too long." };
  }
  const placementRaw = asString(b.placementNotes).trim();
  if (placementRaw.length > FIELD_MAX) {
    return { ok: false, error: "Placement notes are too long." };
  }

  return {
    ok: true,
    value: {
      title,
      status: b.status,
      priceType: b.priceType,
      price,
      shortDescription: shortRaw || null,
      sizeInfo: sizeRaw || null,
      placementNotes: placementRaw || null,
      bookingMode: b.bookingMode,
      maxBookings,
      isBookable: b.isBookable,
      availableFrom: from.value,
      availableUntil: until.value,
      flashDayId,
    },
  };
}

export type FlashDayInput = {
  title: string;
  scheduledOn: string | null;
  location: string | null;
  description: string | null;
  status: FlashDayStatus;
  isPublic: boolean;
};

/** Validate a flash-day create/update payload. */
export function normalizeFlashDayInput(body: unknown): Result<FlashDayInput> {
  const b = (body ?? {}) as Record<string, unknown>;

  const title = asString(b.title).trim();
  if (!title) return { ok: false, error: "Title is required." };
  if (title.length > TITLE_MAX) {
    return { ok: false, error: `Title is too long (max ${TITLE_MAX}).` };
  }

  // status defaults to "upcoming" when absent (matches the web create action).
  let status: FlashDayStatus = "upcoming";
  if (b.status !== undefined) {
    if (!oneOf(FLASH_DAY_STATUSES, b.status)) {
      return { ok: false, error: "Invalid status." };
    }
    status = b.status;
  }

  if (typeof b.isPublic !== "boolean" && b.isPublic !== undefined) {
    return { ok: false, error: "isPublic must be a boolean." };
  }

  const scheduled = optionalDate(b.scheduledOn);
  if (!scheduled.ok) return { ok: false, error: "Invalid date." };

  const locationRaw = asString(b.location).trim();
  if (locationRaw.length > FIELD_MAX) {
    return { ok: false, error: "Location is too long." };
  }
  const descriptionRaw = asString(b.description).trim();
  if (descriptionRaw.length > DESCRIPTION_MAX) {
    return { ok: false, error: "Description is too long." };
  }

  return {
    ok: true,
    value: {
      title,
      scheduledOn: scheduled.value,
      location: locationRaw || null,
      description: descriptionRaw || null,
      status,
      isPublic: b.isPublic === true,
    },
  };
}
