// Pure input validation for the mobile travel/guest-spot endpoints
// (/api/mobile/travel/*). Leans on the shared zod validators that the web actions
// already use (studioSchema, validateTripLeg) so the rules can't drift; only the
// trivial trip fields get a local normalizer. Same thin-route pattern as the
// other mobile-* validators.

import {
  studioSchema,
  type StudioInput,
} from "@inklee/shared/studio-validation";
import {
  sanitizeTravelIcon,
  sanitizeTravelIconColor,
  type TravelIconKey,
  type TravelIconColor,
} from "@inklee/shared/travel-icons";
import {
  validateTripLeg,
  type TripLegInput,
} from "@inklee/shared/trip-validation";
import type { MobileStudio } from "@inklee/shared/mobile-api";

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

// Shared studio row → MobileStudio mapping, used by the studios list + detail
// routes. Google Places columns are intentionally not surfaced to the app.
export const STUDIO_COLS =
  "id, name, city, country, address, public_note, visibility_mode, is_primary, icon, icon_color";

export type StudioRow = {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
  address: string | null;
  public_note: string | null;
  visibility_mode: string;
  is_primary: boolean;
  icon: string | null;
  icon_color: string | null;
};

export function toStudio(r: StudioRow): MobileStudio {
  return {
    id: r.id,
    name: r.name,
    city: r.city,
    country: r.country,
    address: r.address,
    publicNote: r.public_note,
    visibilityMode: r.visibility_mode,
    isPrimary: r.is_primary,
    icon: r.icon ?? null,
    iconColor: r.icon_color ?? null,
  };
}

const TITLE_MAX = 120;
const DESCRIPTION_MAX = 2000;

export type TripInput = {
  title: string;
  description: string | null;
  showOnBookingForm: boolean;
  /** undefined = the client didn't send the field (old app) — leave the
   *  column untouched; null = clear; a key = set. */
  icon?: TravelIconKey | null;
  /** Same tri-state as icon, for the chosen icon color. */
  iconColor?: TravelIconColor | null;
};

/** Validate a trip create/update payload (legs are handled separately). */
export function normalizeTripInput(body: unknown): Result<TripInput> {
  const b = (body ?? {}) as Record<string, unknown>;

  const title = asString(b.title).trim();
  if (!title) return { ok: false, error: "Title is required." };
  if (title.length > TITLE_MAX) {
    return { ok: false, error: `Title is too long (max ${TITLE_MAX}).` };
  }

  const descRaw = asString(b.description).trim();
  if (descRaw.length > DESCRIPTION_MAX) {
    return { ok: false, error: "Description is too long." };
  }

  if (
    b.showOnBookingForm !== undefined &&
    typeof b.showOnBookingForm !== "boolean"
  ) {
    return { ok: false, error: "showOnBookingForm must be a boolean." };
  }

  const value: TripInput = {
    title,
    description: descRaw || null,
    // Default visible (matches the web create action).
    showOnBookingForm: b.showOnBookingForm !== false,
  };
  // Tri-state: only set when the client sent the field, so an old app's save
  // can never wipe an icon chosen elsewhere.
  if ("icon" in b) {
    value.icon = sanitizeTravelIcon(b.icon);
  }
  if ("iconColor" in b) {
    value.iconColor = sanitizeTravelIconColor(b.iconColor);
  }

  return { ok: true, value };
}

/** Validate a studio create/update payload via the shared zod schema. */
export function normalizeStudioInput(body: unknown): Result<StudioInput> {
  const b = (body ?? {}) as Record<string, unknown>;
  // The app posts the icon color as camelCase `iconColor` (its convention for
  // both trips and studios), but the shared studioSchema field is `icon_color`
  // (snake, matching the DB column + the web FormData parser). Map it before the
  // parse so z.object doesn't silently strip the chosen color. Tri-state is
  // preserved: only inject the key when the client actually sent it, so an old
  // app's save can't wipe a color chosen elsewhere.
  const input = "iconColor" in b ? { ...b, icon_color: b.iconColor } : b;
  const parsed = studioSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid studio.",
    };
  }
  return { ok: true, value: parsed.data };
}

/** Validate a single trip leg (date range + optional studio/notes). */
export function normalizeTripLegInput(body: unknown): Result<TripLegInput> {
  try {
    return { ok: true, value: validateTripLeg(body) };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Invalid trip stop.",
    };
  }
}
