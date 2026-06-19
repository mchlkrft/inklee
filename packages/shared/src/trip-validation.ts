import { z } from "zod";
import { isDateKey, isDateKeyAfter } from "./date-utils";

const tripLegSchema = z.object({
  startsOn: z.string(),
  endsOn: z.string(),
  studioId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export type TripLegInput = {
  startsOn: string;
  endsOn: string;
  studioId: string | null;
  notes: string | null;
};

function normalizeTripLeg(raw: z.infer<typeof tripLegSchema>): TripLegInput {
  return {
    startsOn: raw.startsOn,
    endsOn: raw.endsOn,
    studioId: raw.studioId?.trim() ? raw.studioId.trim() : null,
    notes: raw.notes?.trim() ? raw.notes.trim() : null,
  };
}

export function validateTripLeg(input: unknown): TripLegInput {
  const parsed = tripLegSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error("each trip stop must include valid start and end dates");
  }

  const leg = normalizeTripLeg(parsed.data);
  if (!isDateKey(leg.startsOn) || !isDateKey(leg.endsOn)) {
    throw new Error("trip stop dates must use the YYYY-MM-DD format");
  }
  if (isDateKeyAfter(leg.startsOn, leg.endsOn)) {
    throw new Error("trip stop start date must be on or before the end date");
  }
  return leg;
}

export function validateTripLegsPayload(raw: string | null): TripLegInput[] {
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("trip stops could not be read");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("trip stops must be an array");
  }

  return parsed.map((entry) => validateTripLeg(entry));
}

export const TRIP_TITLE_MAX = 120;
export const TRIP_DESCRIPTION_MAX = 2000;

export type TripMeta = { title: string; description: string | null };

/**
 * Validate a trip's title + description to the canonical caps. The web trip
 * action previously enforced neither cap; the mobile route capped title 120 /
 * description 2000. Single-sourced so both agree. (ME-10 D13)
 */
export function validateTripMeta(input: {
  title?: unknown;
  description?: unknown;
}): { ok: true; value: TripMeta } | { ok: false; error: string } {
  const title = (typeof input.title === "string" ? input.title : "").trim();
  if (!title) return { ok: false, error: "Title is required." };
  if (title.length > TRIP_TITLE_MAX) {
    return { ok: false, error: `Title is too long (max ${TRIP_TITLE_MAX}).` };
  }
  const descRaw =
    typeof input.description === "string" ? input.description.trim() : "";
  if (descRaw.length > TRIP_DESCRIPTION_MAX) {
    return { ok: false, error: "Description is too long." };
  }
  return { ok: true, value: { title, description: descRaw || null } };
}

/**
 * Two date-key ranges overlap when each starts on or before the other ends.
 * Pure lexical compare on YYYY-MM-DD (tz-safe). Shared by the web trip-manager
 * and the mobile travel screens. (ME-10 D14)
 */
export function rangesOverlap(
  ranges: { startsOn: string; endsOn: string }[],
): boolean {
  return ranges.some((a, i) =>
    ranges.some(
      (b, j) => i !== j && a.startsOn <= b.endsOn && b.startsOn <= a.endsOn,
    ),
  );
}

/** A leg is "active" when `today` (a YYYY-MM-DD date-key) is within its range. */
export function legIsActive(
  startsOn: string,
  endsOn: string,
  today: string,
): boolean {
  return startsOn <= today && endsOn >= today;
}
