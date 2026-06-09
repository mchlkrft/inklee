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
  "id, name, city, country, address, public_note, visibility_mode, is_primary";

export type StudioRow = {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
  address: string | null;
  public_note: string | null;
  visibility_mode: string;
  is_primary: boolean;
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
  };
}

const TITLE_MAX = 120;
const DESCRIPTION_MAX = 2000;

export type TripInput = {
  title: string;
  description: string | null;
  showOnBookingForm: boolean;
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

  return {
    ok: true,
    value: {
      title,
      description: descRaw || null,
      // Default visible (matches the web create action).
      showOnBookingForm: b.showOnBookingForm !== false,
    },
  };
}

/** Validate a studio create/update payload via the shared zod schema. */
export function normalizeStudioInput(body: unknown): Result<StudioInput> {
  const parsed = studioSchema.safeParse(body ?? {});
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
