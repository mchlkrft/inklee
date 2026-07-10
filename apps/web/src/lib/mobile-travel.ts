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
  sanitizeTravelIconBg,
  type TravelIconKey,
  type TravelIconColor,
  type TravelIconBg,
} from "@inklee/shared/travel-icons";
import {
  validateTripLeg,
  validateTripMeta,
  type TripLegInput,
} from "@inklee/shared/trip-validation";
import type { MobileStudio } from "@inklee/shared/mobile-api";

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

// Shared studio row → MobileStudio mapping, used by the studios list + detail
// routes. Google Places columns are intentionally not surfaced to the app.
export const STUDIO_COLS =
  "id, name, city, country, address, public_note, visibility_mode, is_primary, icon, icon_color, icon_bg";

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
  icon_bg: string | null;
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
    iconBg: r.icon_bg ?? null,
  };
}

export type TripInput = {
  title: string;
  description: string | null;
  showOnBookingForm: boolean;
  /** undefined = the client didn't send the field (old app) — leave the
   *  column untouched; null = clear; a key = set. */
  icon?: TravelIconKey | null;
  /** Same tri-state as icon, for the chosen icon color. */
  iconColor?: TravelIconColor | null;
  /** Same tri-state as icon, for the chosen tile background. */
  iconBg?: TravelIconBg | null;
};

/** Validate a trip create/update payload (legs are handled separately). */
export function normalizeTripInput(body: unknown): Result<TripInput> {
  const b = (body ?? {}) as Record<string, unknown>;

  const meta = validateTripMeta({ title: b.title, description: b.description });
  if (!meta.ok) return meta;

  if (
    b.showOnBookingForm !== undefined &&
    typeof b.showOnBookingForm !== "boolean"
  ) {
    return { ok: false, error: "showOnBookingForm must be a boolean." };
  }

  const value: TripInput = {
    title: meta.value.title,
    description: meta.value.description,
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
  if ("iconBg" in b) {
    value.iconBg = sanitizeTravelIconBg(b.iconBg);
  }

  return { ok: true, value };
}

/** Validate a studio create/update payload via the shared zod schema. */
export function normalizeStudioInput(body: unknown): Result<StudioInput> {
  const b = (body ?? {}) as Record<string, unknown>;
  // The app posts the icon color/background as camelCase `iconColor`/`iconBg`
  // (its convention for both trips and studios), but the shared studioSchema
  // fields are `icon_color`/`icon_bg` (snake, matching the DB columns + the web
  // FormData parser). Map them before the parse so z.object doesn't silently
  // strip the choice. Tri-state is preserved: only inject a key when the client
  // actually sent it, so an old app's save can't wipe a choice made elsewhere.
  let input = "iconColor" in b ? { ...b, icon_color: b.iconColor } : b;
  if ("iconBg" in b) input = { ...input, icon_bg: b.iconBg };
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
