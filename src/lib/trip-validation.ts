import { z } from "zod";
import { isDateKey, isDateKeyAfter } from "@/lib/date-utils";

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
