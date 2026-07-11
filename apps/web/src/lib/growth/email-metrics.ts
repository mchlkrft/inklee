/**
 * Pure email-to-outcome association. Wording contract: an outcome inside the
 * attribution window is an "associated conversion", never a caused one; there
 * is no control group and none is implied.
 */

import type { ArtistStatsRow } from "./types";
import { firstApprovalAt } from "./metrics";

export type LifecycleMarker = {
  definition_key: string;
  artist_id: string | null;
  status: string;
  created_at: string;
};

/** What each lifecycle definition is trying to make happen. Definitions whose
 *  key is not listed fall back to "any meaningful outcome". */
export const LIFECYCLE_TARGET_OUTCOMES: Record<
  string,
  { label: string; outcomeAt: (row: ArtistStatsRow) => string | null }
> = {
  books_open_live: {
    label: "First request received",
    outcomeAt: (row) => row.first_request_at,
  },
  first_booking_approved: {
    label: "Deposit or next approval activity",
    outcomeAt: (row) => row.first_deposit_paid_at ?? firstApprovalAt(row),
  },
  no_requests_day_7: {
    label: "First request received",
    outcomeAt: (row) => row.first_request_at,
  },
  no_requests_day_14: {
    label: "First request received",
    outcomeAt: (row) => row.first_request_at,
  },
};

function fallbackOutcomeAt(row: ArtistStatsRow): string | null {
  return (
    row.first_request_at ?? firstApprovalAt(row) ?? row.first_deposit_paid_at
  );
}

export type LifecycleConversionSummary = {
  definitionKey: string;
  outcomeLabel: string;
  sent: number;
  /** Sends whose artist showed the target outcome within the window AFTER the send. */
  convertedWithinWindow: number;
  conversionPct: number | null;
};

/**
 * For each definition: how many sent markers were followed by the target
 * outcome within `windowDays`. Outcomes that predate the send do not count.
 */
export function associateLifecycleConversions(
  markers: LifecycleMarker[],
  statsById: Map<string, ArtistStatsRow>,
  windowDays: number,
): LifecycleConversionSummary[] {
  const byDefinition = new Map<string, LifecycleMarker[]>();
  for (const marker of markers) {
    if (marker.status !== "sent" || !marker.artist_id) continue;
    const list = byDefinition.get(marker.definition_key);
    if (list) list.push(marker);
    else byDefinition.set(marker.definition_key, [marker]);
  }

  const windowMs = windowDays * 86_400_000;
  const result: LifecycleConversionSummary[] = [];
  for (const [definitionKey, sends] of byDefinition) {
    const target = LIFECYCLE_TARGET_OUTCOMES[definitionKey];
    let converted = 0;
    for (const send of sends) {
      const row = statsById.get(send.artist_id!);
      if (!row) continue;
      const outcomeIso = target
        ? target.outcomeAt(row)
        : fallbackOutcomeAt(row);
      if (!outcomeIso) continue;
      const sentAt = new Date(send.created_at).getTime();
      const outcomeAt = new Date(outcomeIso).getTime();
      if (outcomeAt >= sentAt && outcomeAt <= sentAt + windowMs) converted++;
    }
    result.push({
      definitionKey,
      outcomeLabel: target?.label ?? "Any meaningful outcome",
      sent: sends.length,
      convertedWithinWindow: converted,
      conversionPct:
        sends.length > 0 ? Math.round((converted / sends.length) * 100) : null,
    });
  }
  return result.sort((a, b) => a.definitionKey.localeCompare(b.definitionKey));
}
