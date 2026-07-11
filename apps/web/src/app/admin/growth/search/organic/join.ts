/**
 * Pure join logic for the combined organic landing-pages view: Search Console
 * page aggregates lined up with first-party organic landing-page visits by
 * normalized path. The two sides are DIFFERENT measurements (Google source
 * dates vs reporting-timezone days); the join never merges or substitutes one
 * for the other, it only puts them side by side. A missing side stays null so
 * the UI and the CSV can render it honestly instead of faking a zero.
 *
 * Shared by the page and its CSV export route; no I/O in this module.
 */

import {
  gscPageToPath,
  type GscAggRow,
  type WaOrganicRow,
} from "@/lib/public-analytics/queries";

export type OrganicJoinRow = {
  /** Normalized path both sides join on. */
  path: string;
  /** Full canonical GSC URL (the highest-impressions one when several URLs
   *  normalize to the same path); null when the GSC side is missing. */
  gscPageUrl: string | null;
  /** Distinct GSC URLs that normalized into this path. */
  gscUrlCount: number;
  impressions: number | null;
  clicks: number | null;
  /** Google CTR in percent (one decimal); null when the GSC side is missing
   *  or recorded no impressions. */
  ctrPct: number | null;
  /** Impression-weighted average Google position; null when GSC is missing. */
  avgPosition: number | null;
  /** First-party organic visitors; null when no visits were recorded. */
  visitors: number | null;
  visits: number | null;
  signupStarts: number | null;
  signupCompletions: number | null;
  /** Visit-to-signup conversion in percent (signup completions out of organic
   *  visits, one decimal); null when visits is 0 or the side is missing. */
  conversionPct: number | null;
};

const round1 = (value: number): number => Math.round(value * 10) / 10;

/** The same duplicate-slash/trailing-slash normalization gscPageToPath
 *  applies, for first-party landing paths, so both sides share join keys.
 *  Sentinel values that are not paths (e.g. "(none)") pass through as-is. */
function normalizeWaPath(path: string): string {
  if (!path.startsWith("/")) return path;
  let clean = path.replace(/\/{2,}/g, "/");
  if (clean.length > 1 && clean.endsWith("/")) clean = clean.slice(0, -1);
  return clean || "/";
}

export function joinOrganicLandingPages(
  gscRows: GscAggRow[],
  waRows: WaOrganicRow[],
): OrganicJoinRow[] {
  type GscSide = {
    impressions: number;
    clicks: number;
    positionWeighted: number;
    positionSum: number;
    rowCount: number;
    topUrl: string;
    topUrlImpressions: number;
    urlCount: number;
  };
  const gscByPath = new Map<string, GscSide>();
  for (const row of gscRows) {
    const path = gscPageToPath(row.dimension_value);
    if (!path) continue;
    const existing = gscByPath.get(path);
    if (!existing) {
      gscByPath.set(path, {
        impressions: row.impressions,
        clicks: row.clicks,
        positionWeighted: row.average_position * row.impressions,
        positionSum: row.average_position,
        rowCount: 1,
        topUrl: row.dimension_value,
        topUrlImpressions: row.impressions,
        urlCount: 1,
      });
    } else {
      existing.impressions += row.impressions;
      existing.clicks += row.clicks;
      existing.positionWeighted += row.average_position * row.impressions;
      existing.positionSum += row.average_position;
      existing.rowCount += 1;
      existing.urlCount += 1;
      if (row.impressions > existing.topUrlImpressions) {
        existing.topUrl = row.dimension_value;
        existing.topUrlImpressions = row.impressions;
      }
    }
  }

  type WaSide = {
    visitors: number;
    visits: number;
    signupStarts: number;
    signupCompletions: number;
  };
  const waByPath = new Map<string, WaSide>();
  for (const row of waRows) {
    const path = normalizeWaPath(row.landing_path);
    const existing = waByPath.get(path);
    if (!existing) {
      waByPath.set(path, {
        visitors: row.visitors,
        visits: row.visits,
        signupStarts: row.signup_starts,
        signupCompletions: row.signup_completions,
      });
    } else {
      // Visits/starts/completions sum exactly. Distinct-visitor counts are
      // per source row, so a merged path (rare trailing-slash variants) can
      // double-count a visitor; treat the sum as an upper bound.
      existing.visitors += row.visitors;
      existing.visits += row.visits;
      existing.signupStarts += row.signup_starts;
      existing.signupCompletions += row.signup_completions;
    }
  }

  const paths = new Set<string>([...gscByPath.keys(), ...waByPath.keys()]);
  const rows: OrganicJoinRow[] = [];
  for (const path of paths) {
    const gsc = gscByPath.get(path) ?? null;
    const wa = waByPath.get(path) ?? null;
    const avgPosition = gsc
      ? gsc.impressions > 0
        ? round1(gsc.positionWeighted / gsc.impressions)
        : round1(gsc.positionSum / gsc.rowCount)
      : null;
    rows.push({
      path,
      gscPageUrl: gsc ? gsc.topUrl : null,
      gscUrlCount: gsc ? gsc.urlCount : 0,
      impressions: gsc ? gsc.impressions : null,
      clicks: gsc ? gsc.clicks : null,
      ctrPct:
        gsc && gsc.impressions > 0
          ? round1((gsc.clicks / gsc.impressions) * 100)
          : null,
      avgPosition,
      visitors: wa ? wa.visitors : null,
      visits: wa ? wa.visits : null,
      signupStarts: wa ? wa.signupStarts : null,
      signupCompletions: wa ? wa.signupCompletions : null,
      conversionPct:
        wa && wa.visits > 0
          ? round1((wa.signupCompletions / wa.visits) * 100)
          : null,
    });
  }
  return rows;
}

export const ORGANIC_SORT_KEYS = [
  "impressions",
  "clicks",
  "visitors",
  "signups",
  "conversion",
] as const;

export type OrganicSortKey = (typeof ORGANIC_SORT_KEYS)[number];

/** Whitelist parse of ?sort=; anything unrecognized falls back to the
 *  default impressions sort. */
export function parseOrganicSort(value: string | undefined): OrganicSortKey {
  return (ORGANIC_SORT_KEYS as readonly string[]).includes(value ?? "")
    ? (value as OrganicSortKey)
    : "impressions";
}

/** Descending sort on the chosen metric; rows missing that side go last
 *  (null is "not measured", not zero). Ties break alphabetically by path. */
export function sortOrganicRows(
  rows: OrganicJoinRow[],
  key: OrganicSortKey,
): OrganicJoinRow[] {
  const metric = (row: OrganicJoinRow): number | null => {
    switch (key) {
      case "impressions":
        return row.impressions;
      case "clicks":
        return row.clicks;
      case "visitors":
        return row.visitors;
      case "signups":
        return row.signupCompletions;
      case "conversion":
        return row.conversionPct;
    }
  };
  return [...rows].sort((a, b) => {
    const av = metric(a);
    const bv = metric(b);
    if (av === null && bv === null) return a.path.localeCompare(b.path);
    if (av === null) return 1;
    if (bv === null) return -1;
    if (bv !== av) return bv - av;
    return a.path.localeCompare(b.path);
  });
}
