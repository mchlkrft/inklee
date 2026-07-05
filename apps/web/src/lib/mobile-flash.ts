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
import { isCurrency, DEFAULT_CURRENCY } from "@inklee/shared/goods";
import { sanitizeHttpUrl } from "@inklee/shared/url";
import { slugify } from "@/lib/flash";

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
  currency: string;
  shortDescription: string | null;
  sizeInfo: string | null;
  placementNotes: string | null;
  bookingMode: FlashBookingMode;
  maxBookings: number | null;
  isBookable: boolean;
  availableFrom: string | null;
  availableUntil: string | null;
  folderId: string | null;
  // Tri-state: present ONLY when the caller sent the key, so a metadata-only
  // save never clobbers a freshly-uploaded image or the slug. Absent = preserve.
  slug?: string;
  previewImageUrl?: string | null;
  instagramPostUrl?: string | null;
};

const URL_MAX = 2000;
const SLUG_MAX = 60;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Validate the flash-item metadata edit. Core fields are always present; slug,
 *  preview image URL, and Instagram URL are tri-state (only written when sent). */
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

  // Currency: validated against the shared list; unknown/absent falls back to
  // EUR (the historical default), matching the web flash action.
  const currencyRaw =
    typeof b.currency === "string" ? b.currency.toLowerCase() : "";
  const currency = isCurrency(currencyRaw) ? currencyRaw : DEFAULT_CURRENCY;

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

  // folderId must be a UUID (or empty). Ownership of the target folder is
  // verified in the route before the write. Day membership is not set here; it
  // lives in the flash_day_items junction (the day-items endpoint).
  const folderRaw = asString(b.folderId).trim();
  let folderId: string | null = null;
  if (folderRaw) {
    if (!UUID_RE.test(folderRaw)) {
      return { ok: false, error: "Invalid folder." };
    }
    folderId = folderRaw;
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

  const value: FlashItemUpdate = {
    title,
    status: b.status,
    priceType: b.priceType,
    price,
    currency,
    shortDescription: shortRaw || null,
    sizeInfo: sizeRaw || null,
    placementNotes: placementRaw || null,
    bookingMode: b.bookingMode,
    maxBookings,
    isBookable: b.isBookable,
    availableFrom: from.value,
    availableUntil: until.value,
    folderId,
  };

  // Slug: the public URL segment. Only written when the key is present. Unique
  // per artist (DB constraint -> the route maps a violation to a friendly 409).
  if ("slug" in b && b.slug !== undefined) {
    const s = slugify(asString(b.slug));
    if (!s || s.length > SLUG_MAX || !SLUG_RE.test(s)) {
      return {
        ok: false,
        error: "Enter a valid link (lowercase letters, numbers, and dashes).",
      };
    }
    value.slug = s;
  }

  // Preview image URL + Instagram URL: http(s) only (sanitizeHttpUrl rejects
  // javascript:/data:); an empty string clears the field to null.
  if ("previewImageUrl" in b && b.previewImageUrl !== undefined) {
    const rawUrl = asString(b.previewImageUrl).trim();
    if (rawUrl === "") value.previewImageUrl = null;
    else {
      const safe = sanitizeHttpUrl(rawUrl);
      if (!safe || rawUrl.length > URL_MAX) {
        return { ok: false, error: "Enter a valid http or https image link." };
      }
      value.previewImageUrl = safe;
    }
  }
  if ("instagramPostUrl" in b && b.instagramPostUrl !== undefined) {
    const rawUrl = asString(b.instagramPostUrl).trim();
    if (rawUrl === "") value.instagramPostUrl = null;
    else {
      const safe = sanitizeHttpUrl(rawUrl);
      if (!safe || rawUrl.length > URL_MAX) {
        return { ok: false, error: "Enter a valid http or https link." };
      }
      value.instagramPostUrl = safe;
    }
  }

  return { ok: true, value };
}

export type FlashDayInput = {
  title: string;
  scheduledOn: string | null;
  studioId: string | null;
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

  // studio_id (a venue from the artist's studio library) takes precedence over
  // free-text location, matching the web resolveLocationFields: when a studio is
  // chosen, location is cleared. Ownership of the studio is verified in the route.
  const studioRaw = asString(b.studioId).trim();
  let studioId: string | null = null;
  if (studioRaw) {
    if (!UUID_RE.test(studioRaw)) {
      return { ok: false, error: "Invalid studio." };
    }
    studioId = studioRaw;
  }

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
      studioId,
      location: studioId ? null : locationRaw || null,
      description: descriptionRaw || null,
      status,
      isPublic: b.isPublic === true,
    },
  };
}
