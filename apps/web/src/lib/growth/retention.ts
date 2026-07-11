/**
 * Pure retention logic: state classification (active / churn-risk / dormant /
 * churned / pre-activation), reactivation detection, and cohort grids.
 *
 * Definitions (docs/metric-definitions.md): thresholds come from growth
 * settings, defaults active<=14d, churn-risk>21d (activated only),
 * dormant>=30d, churned>=90d. Tattoo artists work in weekly rhythms, so these
 * are deliberately looser than consumer-app defaults; production data (1-2
 * weekly actors) confirmed daily thresholds would misclassify everyone.
 */

import type { ArtistStatsRow, ActivityDayRow, RetentionState } from "./types";
import { isActivated, isCountedArtist } from "./metrics";

export type RetentionThresholds = {
  activeDays: number;
  churnRiskDays: number;
  dormantDays: number;
  churnedDays: number;
  reactivationGapDays: number;
};

export const DEFAULT_RETENTION_THRESHOLDS: RetentionThresholds = {
  activeDays: 14,
  churnRiskDays: 21,
  dormantDays: 30,
  churnedDays: 90,
  reactivationGapDays: 30,
};

/** Days since the artist's last meaningful activity, null when none exists. */
export function daysSinceLastActivity(
  row: ArtistStatsRow,
  now: Date,
): number | null {
  const candidates = [
    row.last_activity_at,
    row.last_presence_day ? `${row.last_presence_day}T12:00:00Z` : null,
    row.last_mobile_seen_at,
    row.last_sign_in_at,
  ].filter((value): value is string => value !== null);
  if (candidates.length === 0) return null;
  const last = Math.max(...candidates.map((iso) => new Date(iso).getTime()));
  return Math.floor((now.getTime() - last) / 86_400_000);
}

/**
 * Retention state. Never-activated artists are 'pre_activation' regardless of
 * silence (churn language only applies to artists who reached value once).
 */
export function classifyRetention(
  row: ArtistStatsRow,
  now: Date,
  thresholds: RetentionThresholds = DEFAULT_RETENTION_THRESHOLDS,
): RetentionState {
  if (!isActivated(row)) return "pre_activation";
  const silentDays = daysSinceLastActivity(row, now);
  if (silentDays === null) return "dormant";
  if (silentDays <= thresholds.activeDays) return "active";
  if (silentDays >= thresholds.churnedDays) return "churned";
  if (silentDays >= thresholds.dormantDays) return "dormant";
  if (silentDays > thresholds.churnRiskDays) return "churn_risk";
  // Between activeDays and churnRiskDays: quiet but inside normal cadence.
  return "active";
}

/** Reactivated = a meaningful-activity day following a gap of at least
 *  reactivationGapDays, within the inspected window. */
export function findReactivations(
  activityDays: ActivityDayRow[],
  gapDays: number,
): Map<string, string[]> {
  const byArtist = new Map<string, string[]>();
  for (const row of activityDays) {
    const days = byArtist.get(row.artist_id);
    if (days) days.push(row.day);
    else byArtist.set(row.artist_id, [row.day]);
  }
  const reactivated = new Map<string, string[]>();
  for (const [artistId, days] of byArtist) {
    const sorted = [...new Set(days)].sort();
    const hits: string[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const gap =
        (new Date(`${sorted[i]}T00:00:00Z`).getTime() -
          new Date(`${sorted[i - 1]}T00:00:00Z`).getTime()) /
        86_400_000;
      if (gap >= gapDays) hits.push(sorted[i]);
    }
    if (hits.length > 0) reactivated.set(artistId, hits);
  }
  return reactivated;
}

export type CohortCell = {
  /** Day offset checkpoint (1, 7, 14, 30, 60, 90). */
  checkpoint: number;
  /** Artists with meaningful activity in [cohortStart+checkpoint, +checkpoint+windowDays). */
  retained: number;
  /** Members whose checkpoint window has fully elapsed AND lies inside the
   *  activity lookback (the percentage's denominator). */
  measurable: number;
  /** Percent of measurable members, null when nothing is measurable yet. */
  pct: number | null;
};

export type CohortRow = {
  /** Cohort bucket start day (YYYY-MM-DD, reporting timezone). */
  cohort: string;
  size: number;
  cells: CohortCell[];
};

export const RETENTION_CHECKPOINTS = [1, 7, 14, 30, 60, 90] as const;
/** Activity is checked in a 7-day window from each checkpoint (weekly cadence;
 *  a strict single-day check would read ~0 for artists who work weekly). */
export const RETENTION_WINDOW_DAYS = 7;

function weekStartKey(dayKey: string): string {
  const date = new Date(`${dayKey}T00:00:00Z`);
  const dow = (date.getUTCDay() + 6) % 7; // Monday = 0
  const monday = new Date(date.getTime() - dow * 86_400_000);
  return monday.toISOString().slice(0, 10);
}

function monthStartKey(dayKey: string): string {
  return `${dayKey.slice(0, 7)}-01`;
}

/**
 * Cohort retention grid. Cohorts by claim date (week or month buckets, in the
 * reporting timezone via the provided dayKey function); retention = any
 * meaningful-activity day in the checkpoint window. Future checkpoints are
 * null (not zero) so young cohorts don't read as churned.
 */
export function buildRetentionCohorts(options: {
  rows: ArtistStatsRow[];
  activityDays: ActivityDayRow[];
  cohortBy: "week" | "month";
  dayKeyOf: (iso: string) => string;
  todayKey: string;
  onlyActivated?: boolean;
  /** First day covered by activityDays. Checkpoint windows that start before
   *  it are unmeasurable (blank), not zero: activity outside the lookback was
   *  simply not fetched. */
  lookbackStartKey?: string;
}): CohortRow[] {
  const {
    rows,
    activityDays,
    cohortBy,
    dayKeyOf,
    todayKey,
    onlyActivated,
    lookbackStartKey,
  } = options;
  const bucketOf = cohortBy === "week" ? weekStartKey : monthStartKey;

  const daysByArtist = new Map<string, Set<string>>();
  for (const row of activityDays) {
    let set = daysByArtist.get(row.artist_id);
    if (!set) {
      set = new Set<string>();
      daysByArtist.set(row.artist_id, set);
    }
    set.add(row.day);
  }

  const cohorts = new Map<string, ArtistStatsRow[]>();
  for (const row of rows) {
    if (!isCountedArtist(row)) continue;
    if (onlyActivated && !isActivated(row)) continue;
    const bucket = bucketOf(dayKeyOf(row.profile_claimed_at));
    const list = cohorts.get(bucket);
    if (list) list.push(row);
    else cohorts.set(bucket, [row]);
  }

  const today = new Date(`${todayKey}T00:00:00Z`).getTime();
  const lookbackStart = lookbackStartKey
    ? new Date(`${lookbackStartKey}T00:00:00Z`).getTime()
    : null;
  const result: CohortRow[] = [];
  for (const [cohort, members] of [...cohorts.entries()].sort()) {
    const cells: CohortCell[] = RETENTION_CHECKPOINTS.map((checkpoint) => {
      let retained = 0;
      let measurable = 0;
      for (const member of members) {
        const claimKey = dayKeyOf(member.profile_claimed_at);
        const start =
          new Date(`${claimKey}T00:00:00Z`).getTime() + checkpoint * 86_400_000;
        const end = start + RETENTION_WINDOW_DAYS * 86_400_000;
        // Measurable only when the FULL window has elapsed (today's activity
        // day is observable, so the window completes once its last day is
        // today or earlier) AND the window lies inside the activity lookback
        // (earlier activity was never fetched: blank, not zero).
        if (end > today + 86_400_000) continue;
        if (lookbackStart !== null && start < lookbackStart) continue;
        measurable++;
        const days = daysByArtist.get(member.id);
        if (!days) continue;
        for (const day of days) {
          const t = new Date(`${day}T00:00:00Z`).getTime();
          if (t >= start && t < end) {
            retained++;
            break;
          }
        }
      }
      return {
        checkpoint,
        retained,
        measurable,
        pct: measurable > 0 ? Math.round((retained / measurable) * 100) : null,
      };
    });
    result.push({ cohort, size: members.length, cells });
  }
  return result;
}

export type EngagementSummary = {
  dau: { day: string; count: number }[];
  wau: { week: string; count: number }[];
  mau: { month: string; count: number }[];
  /** WAU/MAU over the latest full buckets, null with insufficient data. */
  stickiness: number | null;
  activeDaysPerArtist: { artistId: string; days: number }[];
};

/** DAU/WAU/MAU from activity-day rows (already tester/admin-excluded). */
export function buildEngagementSummary(
  activityDays: ActivityDayRow[],
): EngagementSummary {
  const byDay = new Map<string, Set<string>>();
  const byWeek = new Map<string, Set<string>>();
  const byMonth = new Map<string, Set<string>>();
  const byArtist = new Map<string, Set<string>>();

  for (const row of activityDays) {
    const week = weekStartKey(row.day);
    const month = monthStartKey(row.day);
    (byDay.get(row.day) ?? byDay.set(row.day, new Set()).get(row.day)!).add(
      row.artist_id,
    );
    (byWeek.get(week) ?? byWeek.set(week, new Set()).get(week)!).add(
      row.artist_id,
    );
    (byMonth.get(month) ?? byMonth.set(month, new Set()).get(month)!).add(
      row.artist_id,
    );
    (
      byArtist.get(row.artist_id) ??
      byArtist.set(row.artist_id, new Set()).get(row.artist_id)!
    ).add(row.day);
  }

  const dau = [...byDay.entries()]
    .sort()
    .map(([day, set]) => ({ day, count: set.size }));
  const wau = [...byWeek.entries()]
    .sort()
    .map(([week, set]) => ({ week, count: set.size }));
  const mau = [...byMonth.entries()]
    .sort()
    .map(([month, set]) => ({ month, count: set.size }));

  // Stickiness = distinct actors in the last FULL week over distinct actors in
  // the trailing 28 days ending with that week. Calendar-month MAU would make
  // the ratio exceed 100% early in a month (partial-month denominator).
  let stickiness: number | null = null;
  if (wau.length >= 2) {
    const lastFullWeekKey = wau[wau.length - 2].week;
    const weekStart = new Date(`${lastFullWeekKey}T00:00:00Z`).getTime();
    const weekEnd = weekStart + 7 * 86_400_000;
    const windowStart = weekEnd - 28 * 86_400_000;
    const weekActors = new Set<string>();
    const trailingActors = new Set<string>();
    for (const row of activityDays) {
      const t = new Date(`${row.day}T00:00:00Z`).getTime();
      if (t >= windowStart && t < weekEnd) trailingActors.add(row.artist_id);
      if (t >= weekStart && t < weekEnd) weekActors.add(row.artist_id);
    }
    if (trailingActors.size > 0) {
      stickiness = Math.round((weekActors.size / trailingActors.size) * 100);
    }
  }

  return {
    dau,
    wau,
    mau,
    stickiness,
    activeDaysPerArtist: [...byArtist.entries()]
      .map(([artistId, days]) => ({ artistId, days: days.size }))
      .sort((a, b) => b.days - a.days),
  };
}
