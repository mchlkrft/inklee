/**
 * Pure metric logic for the Growth cockpit: activation classification, funnel
 * building, comparisons, medians, time-to-value. No IO; every definition here
 * is unit-tested and documented in docs/metric-definitions.md and on
 * /admin/growth/definitions. Change definitions ONLY together with those docs
 * and the tests (a silent change would rewrite history unnoticed).
 */

import type { ArtistStatsRow, ExplorerStage, MetricComparison } from "./types";

/** Rows the cockpit counts by default: real, non-deleted, active artists. */
export function isCountedArtist(row: ArtistStatsRow): boolean {
  return !row.is_tester && !row.soft_deleted && row.account_status === "active";
}

/** Canonical "public booking page is live" predicate. The page goes live the
 *  instant the slug is claimed, so this is true for every counted profile row;
 *  it exists as its own function because suspension takes a page down. */
export function isPagePublished(row: ArtistStatsRow): boolean {
  return !!row.slug && row.account_status === "active" && !row.soft_deleted;
}

/** True when the artist did at least one meaningful booking-related action
 *  (the activation trigger; receiving a request counts because it proves the
 *  page works and is being shared). */
export function hasBookingSignal(row: ArtistStatsRow): boolean {
  return (
    row.total_requests > 0 ||
    row.approved_requests > 0 ||
    row.slot_count > 0 ||
    (row.books_configured && row.books_open_flag) ||
    row.published_trip_count > 0 ||
    row.published_flash_count > 0
  );
}

/**
 * ACTIVATED artist (v1, 2026-07-11): onboarding completed AND page published
 * AND at least one meaningful booking-related signal. This deliberately
 * supersedes the old admin definition (activated = onboarding_completed),
 * which reads 100% in production and hides everything.
 */
export function isActivated(row: ArtistStatsRow): boolean {
  return (
    row.onboarding_completed && isPagePublished(row) && hasBookingSignal(row)
  );
}

/** Explorer/funnel stage for a counted artist (first matching stage wins). */
export function classifyStage(
  row: ArtistStatsRow,
): Exclude<ExplorerStage, "all"> {
  if (!row.onboarding_completed) return "claimed_not_completed";
  if (row.total_requests === 0 && !isActivated(row))
    return "completed_no_requests";
  if (row.total_requests > 0 && firstApprovalAt(row) === null)
    return "requests_no_approval";
  return "activated";
}

/** First approval timestamp: audit-derived when present; falls back to
 *  decided_at-era data (early rows predate the status_changed audit trail). */
export function firstApprovalAt(row: ArtistStatsRow): string | null {
  if (row.first_approved_at) return row.first_approved_at;
  if (row.approved_requests > 0)
    return row.last_decision_at ?? row.last_request_at;
  return null;
}

export type FunnelStage = {
  key: string;
  label: string;
  count: number;
  /** Percent of the first stage, 0-100, null for an empty funnel. */
  pctOfTop: number | null;
};

/**
 * The signup-to-approval funnel over counted artists, headed by the
 * auth-account count (the pre-claim drop is invisible in profiles: 7 of the
 * first 25 signups never claimed). With a range, cohort membership follows
 * ACCOUNT CREATION date (matching the auth head; filtering by claim date
 * would let pre-window accounts that claim inside the window push stages past
 * 100% of the head).
 */
export function buildActivationFunnel(
  rows: ArtistStatsRow[],
  authSignupsInRange: number | null,
  range?: { from: Date; to: Date },
): FunnelStage[] {
  const inRange = rows.filter((row) => {
    if (!isCountedArtist(row)) return false;
    if (!range) return true;
    const cohortAnchor = new Date(
      row.account_created_at ?? row.profile_claimed_at,
    );
    return cohortAnchor >= range.from && cohortAnchor < range.to;
  });

  const claimed = inRange.length;
  const completed = inRange.filter((row) => row.onboarding_completed).length;
  const published = inRange.filter((row) => isPagePublished(row)).length;
  const firstRequest = inRange.filter((row) => row.total_requests > 0).length;
  const firstApproval = inRange.filter(
    (row) => firstApprovalAt(row) !== null,
  ).length;
  const activated = inRange.filter((row) => isActivated(row)).length;

  const head = authSignupsInRange ?? claimed;
  const stages: FunnelStage[] = [];
  if (authSignupsInRange !== null) {
    stages.push({
      key: "account",
      label: "Account created",
      count: authSignupsInRange,
      pctOfTop: null,
    });
  }
  stages.push(
    {
      key: "claimed",
      label: "Booking page claimed",
      count: claimed,
      pctOfTop: null,
    },
    {
      key: "completed",
      label: "Onboarding completed",
      count: completed,
      pctOfTop: null,
    },
    { key: "published", label: "Page live", count: published, pctOfTop: null },
    { key: "activated", label: "Activated", count: activated, pctOfTop: null },
    {
      key: "first_request",
      label: "First request received",
      count: firstRequest,
      pctOfTop: null,
    },
    {
      key: "first_approval",
      label: "First request approved",
      count: firstApproval,
      pctOfTop: null,
    },
  );
  for (const stage of stages) {
    stage.pctOfTop = head > 0 ? Math.round((stage.count / head) * 100) : null;
  }
  return stages;
}

export function compare(
  current: number,
  previous: number | null,
): MetricComparison {
  if (previous === null || previous === 0) {
    return { current, previous, deltaPct: null };
  }
  return {
    current,
    previous,
    deltaPct: Math.round(((current - previous) / previous) * 100),
  };
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function hoursBetween(fromIso: string, toIso: string): number {
  return (new Date(toIso).getTime() - new Date(fromIso).getTime()) / 3_600_000;
}

export function daysBetween(fromIso: string, toIso: string): number {
  return hoursBetween(fromIso, toIso) / 24;
}

/** Median days from claim to first request, over artists that have both. */
export function medianDaysToFirstRequest(
  rows: ArtistStatsRow[],
): number | null {
  const durations = rows
    .filter((row) => isCountedArtist(row) && row.first_request_at)
    .map((row) => daysBetween(row.profile_claimed_at, row.first_request_at!))
    .filter((days) => days >= 0);
  const result = median(durations);
  return result === null ? null : Math.round(result * 10) / 10;
}

/** The moment an artist became ACTIVATED: the later of onboarding completion
 *  and the earliest recorded booking signal (activation requires both). Null
 *  when either half was never recorded with a timestamp. */
export function activationMomentAt(row: ArtistStatsRow): string | null {
  if (!isActivated(row) || !row.onboarding_completed_event_at) return null;
  const signalCandidates = [
    row.first_request_at,
    row.first_approved_at,
    row.first_slot_created_at,
    row.first_trip_at,
    row.first_flash_at,
  ].filter((value): value is string => value !== null);
  if (signalCandidates.length === 0) return null; // e.g. books-open-only signal, untimestamped
  const firstSignal = signalCandidates.reduce((a, b) => (a < b ? a : b));
  return row.onboarding_completed_event_at > firstSignal
    ? row.onboarding_completed_event_at
    : firstSignal;
}

/** Median days from account creation to ACTIVATION (not merely onboarding
 *  completion: the booking signal usually lands later). Only measurable for
 *  artists whose completion moment was recorded (analytics event, post-0067)
 *  and whose booking signal carries a timestamp. */
export function medianDaysToActivation(rows: ArtistStatsRow[]): number | null {
  const durations = rows
    .filter((row) => isCountedArtist(row) && row.account_created_at)
    .map((row) => {
      const moment = activationMomentAt(row);
      return moment ? daysBetween(row.account_created_at!, moment) : null;
    })
    .filter((days): days is number => days !== null && days >= 0);
  const result = median(durations);
  return result === null ? null : Math.round(result * 10) / 10;
}

export function rate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 100);
}

/** Format a comparison value for display ("12 (+20%)" style is left to the
 *  UI; this just guards the delta text). */
export function deltaLabel(comparison: MetricComparison): string | null {
  if (comparison.deltaPct === null) return null;
  return comparison.deltaPct >= 0
    ? `+${comparison.deltaPct}%`
    : `${comparison.deltaPct}%`;
}

export type SampleGuard = { ok: boolean; warning: string | null };

/** Below the configured minimum sample, rates are noise: say so instead. */
export function sampleGuard(n: number, minSampleSize: number): SampleGuard {
  return n >= minSampleSize
    ? { ok: true, warning: null }
    : {
        ok: false,
        warning: `Based on ${n} ${n === 1 ? "artist" : "artists"}, below the minimum sample of ${minSampleSize}. Treat as anecdote, not signal.`,
      };
}

/** Group counted rows by an attribution dimension; null becomes "unknown". */
export function groupByAttribution(
  rows: ArtistStatsRow[],
  dimension:
    | "attribution_source"
    | "attribution_medium"
    | "attribution_campaign"
    | "attribution_referrer"
    | "attribution_entry_path"
    | "attribution_platform",
): Map<string, ArtistStatsRow[]> {
  const groups = new Map<string, ArtistStatsRow[]>();
  for (const row of rows) {
    if (!isCountedArtist(row)) continue;
    const key = row[dimension] ?? "unknown";
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }
  return groups;
}
