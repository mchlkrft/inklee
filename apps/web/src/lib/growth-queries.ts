/**
 * Growth cockpit data layer. Every function here runs server-side on the
 * service-role client behind requireAdmin() call sites (/admin/growth/*).
 *
 * Principles:
 * - Aggregation happens in Postgres (views + RPCs from migration 0067), never
 *   as unbounded PostgREST row fetches: PostgREST silently truncates .select()
 *   results at max_rows=1000, which already threatens the old /admin queries.
 * - Tester accounts, admin-owned accounts, and suspended/deleted accounts are
 *   excluded from every aggregate (profiles.is_tester, ADMIN_EMAILS matching,
 *   account_status). The exclusion id list is passed INTO the SQL functions.
 * - Pure metric logic lives in src/lib/growth/* (unit-tested); this module
 *   only fetches and assembles.
 */

import "server-only";
import { cache } from "react";
import { serviceClient } from "@/lib/supabase/service";
import { isAdminEmail } from "@/lib/admin-guard";
import { LIFECYCLE_DEFINITIONS } from "@/lib/email-campaigns/lifecycle/definitions";
import { resolveSegmentArtists } from "@/lib/email-campaigns/resolve-segment";
import { getSupportSummary } from "@/lib/server/support";
import {
  buildActivationFunnel,
  classifyStage,
  compare,
  daysBetween,
  firstApprovalAt,
  groupByAttribution,
  hoursBetween,
  isActivated,
  isCountedArtist,
  isPagePublished,
  median,
  medianDaysToActivation,
  medianDaysToFirstRequest,
  rate,
  sampleGuard,
} from "@/lib/growth/metrics";
import {
  buildEngagementSummary,
  buildRetentionCohorts,
  classifyRetention,
  daysSinceLastActivity,
  findReactivations,
  type RetentionThresholds,
} from "@/lib/growth/retention";
import { buildInsights, type InsightsBundle } from "@/lib/growth/insights";
import {
  associateLifecycleConversions,
  type LifecycleMarker,
} from "@/lib/growth/email-metrics";
import {
  dayKeyInTimeZone,
  resolveGrowthRange,
  type ResolvedRange,
} from "@/lib/growth/date-range";
import { loadGrowthSettings, type GrowthSettings } from "@/lib/growth/settings";
import type {
  ActivityDayRow,
  ActivityKindRow,
  ArtistStatsRow,
  AuthSummaryRow,
  BookingSeriesRow,
  DecisionLatencyRow,
  DepositTotalsRow,
  Insight,
  LifecycleEngagementRow,
  RetentionState,
  SignupSeriesRow,
} from "@/lib/growth/types";

// ---------------------------------------------------------------------------
// Shared context + exclusion
// ---------------------------------------------------------------------------

/** Profile/auth ids excluded from every metric: testers, suspended/archived
 *  and soft-deleted accounts, and ADMIN_EMAILS accounts (the "Counted artist"
 *  contract). Failures THROW: a silently empty exclusion list would pollute
 *  every aggregate (and the snapshot cron writes permanent rows). */
export const getExcludedIds = cache(async (): Promise<string[]> => {
  const testers = await serviceClient
    .from("profiles")
    .select("id")
    .or("is_tester.eq.true,account_status.neq.active,deleted_at.not.is.null");
  if (testers.error) throw new Error(`excluded ids: ${testers.error.message}`);
  const ids = new Set<string>((testers.data ?? []).map((row) => row.id));

  // Page the full auth user list (listUsers returns at most one page).
  for (let page = 1; ; page++) {
    const { data, error } = await serviceClient.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw new Error(`listUsers: ${error.message}`);
    for (const user of data.users) {
      if (isAdminEmail(user.email)) ids.add(user.id);
    }
    if (data.users.length < 1000) break;
    if (page > 50) break; // hard safety stop (50k accounts)
  }
  return [...ids];
});

export type GrowthContext = {
  settings: GrowthSettings;
  range: ResolvedRange;
  excludedIds: string[];
  now: Date;
};

export async function getGrowthContext(params: {
  range?: string;
  from?: string;
  to?: string;
}): Promise<GrowthContext> {
  const settings = await loadGrowthSettings();
  const now = new Date();
  return {
    settings,
    range: resolveGrowthRange(params, settings.reporting_timezone, now),
    excludedIds: await getExcludedIds(),
    now,
  };
}

// ---------------------------------------------------------------------------
// Raw fetches (view + RPCs)
// ---------------------------------------------------------------------------

const PAGE_SIZE = 1000;

/** All artist stats rows, paged past the PostgREST max_rows cap, with
 *  admin-owned rows removed (testers stay: the explorer can show them
 *  flagged; aggregates drop them via isCountedArtist). */
export const getAllArtistStats = cache(async (): Promise<ArtistStatsRow[]> => {
  const excluded = new Set(await getExcludedIds());
  const rows: ArtistStatsRow[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await serviceClient
      .from("growth_artist_stats")
      .select("*")
      // The id tiebreaker makes the ordering unique so offset pages are
      // disjoint (claimed_at alone can collide across a page boundary).
      .order("profile_claimed_at", { ascending: false })
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`growth_artist_stats: ${error.message}`);
    const page = (data ?? []) as ArtistStatsRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    if (offset > 50_000) break; // hard safety stop, documented limitation
  }
  // Admin-owned accounts are not flagged in the view (ADMIN_EMAILS is env
  // config); drop them here so no consumer can forget. Tester and
  // suspended/deleted rows pass through carrying their flags (aggregates drop
  // them via isCountedArtist; the explorer can show testers marked).
  return rows.filter(
    (row) =>
      row.is_tester ||
      row.account_status !== "active" ||
      row.soft_deleted ||
      !excluded.has(row.id),
  );
});

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T[]> {
  const { data, error } = await serviceClient.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return (data ?? []) as T[];
}

/** Set-returning RPCs are ALSO capped at PostgREST max_rows (1000): page them
 *  with Range headers. Requires the function to have a deterministic ORDER BY
 *  (0068) so pages are disjoint. */
async function pagedRpc<T>(
  fn: string,
  args: Record<string, unknown>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await serviceClient
      .rpc(fn, args)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`${fn}: ${error.message}`);
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    if (offset > 200_000) break; // hard safety stop, documented limitation
  }
  return rows;
}

export async function getSignupSeries(
  context: GrowthContext,
): Promise<SignupSeriesRow[]> {
  return rpc<SignupSeriesRow>("growth_signup_series", {
    p_from: context.range.from.toISOString(),
    p_to: context.range.to.toISOString(),
    p_tz: context.settings.reporting_timezone,
    p_bucket: context.range.bucket,
    p_exclude: context.excludedIds,
  });
}

export async function getBookingSeries(
  context: GrowthContext,
): Promise<BookingSeriesRow[]> {
  return rpc<BookingSeriesRow>("growth_booking_series", {
    p_from: context.range.from.toISOString(),
    p_to: context.range.to.toISOString(),
    p_tz: context.settings.reporting_timezone,
    p_bucket: context.range.bucket,
    p_exclude: context.excludedIds,
  });
}

export async function getDepositTotals(
  context: GrowthContext,
  bounds?: { from: Date; to: Date },
): Promise<DepositTotalsRow[]> {
  return rpc<DepositTotalsRow>("growth_deposit_totals", {
    p_from: (bounds?.from ?? context.range.from).toISOString(),
    p_to: (bounds?.to ?? context.range.to).toISOString(),
    p_exclude: context.excludedIds,
  });
}

export async function getActivityDays(
  context: GrowthContext,
  bounds?: { fromDay: string; toDay: string },
): Promise<ActivityDayRow[]> {
  const tz = context.settings.reporting_timezone;
  return pagedRpc<ActivityDayRow>("growth_activity_days_series", {
    p_from: bounds?.fromDay ?? dayKeyInTimeZone(context.range.from, tz),
    // range.to is EXCLUSIVE; the RPC takes inclusive day bounds, so the last
    // included day is the one containing (to - 1ms). Using range.to directly
    // would add a full extra day to every engagement metric.
    p_to:
      bounds?.toDay ??
      dayKeyInTimeZone(new Date(context.range.to.getTime() - 1), tz),
    p_tz: tz,
    p_exclude: context.excludedIds,
  });
}

export async function getAuthSummary(
  context: GrowthContext,
): Promise<AuthSummaryRow | null> {
  const rows = await rpc<AuthSummaryRow>("growth_auth_summary", {
    p_exclude: context.excludedIds,
  });
  return rows[0] ?? null;
}

export async function getDecisionLatency(
  context: GrowthContext,
  bounds?: { from: Date; to: Date },
): Promise<DecisionLatencyRow[]> {
  return pagedRpc<DecisionLatencyRow>("growth_decision_latency", {
    p_from: (bounds?.from ?? context.range.from).toISOString(),
    p_to: (bounds?.to ?? context.range.to).toISOString(),
    p_exclude: context.excludedIds,
  });
}

export async function getAuditActionCounts(
  context: GrowthContext,
  actions: string[],
  bounds?: { from: Date; to: Date },
): Promise<Map<string, number>> {
  const rows = await rpc<{ action: string; occurrences: number }>(
    "growth_audit_action_counts",
    {
      p_actions: actions,
      p_from: (bounds?.from ?? context.range.from).toISOString(),
      p_to: (bounds?.to ?? context.range.to).toISOString(),
      p_exclude: context.excludedIds,
    },
  );
  return new Map(rows.map((row) => [row.action, row.occurrences]));
}

export async function getActivityKindCounts(
  context: GrowthContext,
): Promise<ActivityKindRow[]> {
  return rpc<ActivityKindRow>("growth_activity_kind_counts", {
    p_from: context.range.from.toISOString(),
    p_to: context.range.to.toISOString(),
    p_exclude: context.excludedIds,
  });
}

export async function getLifecycleEngagement(
  context: GrowthContext,
): Promise<LifecycleEngagementRow[]> {
  return rpc<LifecycleEngagementRow>("growth_lifecycle_engagement", {
    p_exclude: context.excludedIds,
  });
}

// ---------------------------------------------------------------------------
// Assembly helpers
// ---------------------------------------------------------------------------

function countedRows(rows: ArtistStatsRow[]): ArtistStatsRow[] {
  return rows.filter(isCountedArtist);
}

function claimedInRange(
  rows: ArtistStatsRow[],
  from: Date,
  to: Date,
): ArtistStatsRow[] {
  return rows.filter((row) => {
    const claimed = new Date(row.profile_claimed_at);
    return claimed >= from && claimed < to;
  });
}

function thresholds(settings: GrowthSettings): RetentionThresholds {
  return {
    activeDays: settings.active_days,
    churnRiskDays: settings.churn_risk_days,
    dormantDays: settings.dormant_days,
    churnedDays: settings.churned_days,
    reactivationGapDays: settings.reactivation_gap_days,
  };
}

function retentionStates(
  rows: ArtistStatsRow[],
  context: GrowthContext,
): Map<string, RetentionState> {
  const limits = thresholds(context.settings);
  return new Map(
    rows.map((row) => [row.id, classifyRetention(row, context.now, limits)]),
  );
}

/** Activity days for the trailing 180 days (retention/reactivation lookback),
 *  independent of the selected reporting range. */
const getTrailingActivityDays = cache(
  async (context: GrowthContext): Promise<ActivityDayRow[]> => {
    const tz = context.settings.reporting_timezone;
    const to = dayKeyInTimeZone(context.now, tz);
    const from = dayKeyInTimeZone(
      new Date(context.now.getTime() - 180 * 86_400_000),
      tz,
    );
    return getActivityDays(context, { fromDay: from, toDay: to });
  },
);

// ---------------------------------------------------------------------------
// Section: Overview
// ---------------------------------------------------------------------------

export async function getOverviewData(context: GrowthContext) {
  const [
    rows,
    authSummary,
    signupSeries,
    bookingSeries,
    depositTotals,
    trailingActivity,
    support,
  ] = await Promise.all([
    getAllArtistStats(),
    getAuthSummary(context),
    getSignupSeries(context),
    getBookingSeries(context),
    getDepositTotals(context),
    getTrailingActivityDays(context),
    getSupportSummary(),
  ]);

  const counted = countedRows(rows);
  const { range, settings } = context;
  const currentCohort = claimedInRange(counted, range.from, range.to);
  const previousCohort =
    range.previousFrom && range.previousTo
      ? claimedInRange(counted, range.previousFrom, range.previousTo)
      : null;

  const authInRange = signupSeries.reduce(
    (sum, row) => sum + row.auth_signups,
    0,
  );
  const states = retentionStates(counted, context);
  const stateCounts = {
    active: 0,
    churn_risk: 0,
    dormant: 0,
    churned: 0,
    pre_activation: 0,
  };
  for (const state of states.values()) stateCounts[state]++;

  const reactivated = findReactivations(
    trailingActivity,
    settings.reactivation_gap_days,
  );

  const requestsCurrent = bookingSeries.reduce(
    (sum, row) => sum + row.requests,
    0,
  );
  const approvalsCurrent = bookingSeries.reduce(
    (sum, row) => sum + row.approvals,
    0,
  );

  let previousComparison: {
    signups: number;
    requests: number;
    approvals: number;
    depositsPaid: number;
  } | null = null;
  if (range.previousFrom && range.previousTo) {
    const previousContext: GrowthContext = {
      ...context,
      range: { ...range, from: range.previousFrom, to: range.previousTo },
    };
    const [previousBookings, previousSignups] = await Promise.all([
      getBookingSeries(previousContext),
      getSignupSeries(previousContext),
    ]);
    previousComparison = {
      signups: previousSignups.reduce((sum, row) => sum + row.auth_signups, 0),
      requests: previousBookings.reduce((sum, row) => sum + row.requests, 0),
      approvals: previousBookings.reduce((sum, row) => sum + row.approvals, 0),
      depositsPaid: previousBookings.reduce(
        (sum, row) => sum + row.deposits_paid,
        0,
      ),
    };
  }

  const activated = counted.filter(isActivated);
  const funnel = buildActivationFunnel(
    counted,
    authSummary?.total_users ?? null,
  );
  const cohortFunnel = buildActivationFunnel(counted, authInRange, {
    from: range.from,
    to: range.to,
  });

  return {
    totals: {
      totalArtists: counted.length,
      activatedArtists: activated.length,
      activationRate: rate(activated.length, counted.length),
      pagesPublished: counted.filter(isPagePublished).length,
      receivedFirstRequest: counted.filter((row) => row.total_requests > 0)
        .length,
      approvedFirstRequest: counted.filter(
        (row) => firstApprovalAt(row) !== null,
      ).length,
      authUsersWithoutProfile: authSummary?.users_without_profile ?? null,
    },
    period: {
      newAccounts: compare(authInRange, previousComparison?.signups ?? null),
      newClaims: compare(
        currentCohort.length,
        previousCohort ? previousCohort.length : null,
      ),
      cohortActivated: currentCohort.filter(isActivated).length,
      cohortActivationRate: rate(
        currentCohort.filter(isActivated).length,
        currentCohort.length,
      ),
      requests: compare(requestsCurrent, previousComparison?.requests ?? null),
      approvals: compare(
        approvalsCurrent,
        previousComparison?.approvals ?? null,
      ),
      approvalRate: rate(approvalsCurrent, requestsCurrent),
      depositsPaid: compare(
        bookingSeries.reduce((sum, row) => sum + row.deposits_paid, 0),
        previousComparison?.depositsPaid ?? null,
      ),
      depositTotals,
    },
    velocity: {
      medianDaysToFirstRequest: medianDaysToFirstRequest(counted),
      medianDaysToActivation: medianDaysToActivation(counted),
    },
    retention: {
      ...stateCounts,
      reactivatedRecently: reactivated.size,
    },
    lifecycleEmail: {
      // Verified in prod 2026-07-11: email_events is effectively empty, so the
      // overview shows sends only; engagement lives on /admin/growth/email
      // with its own data-health notice.
      sends: counted.reduce((sum, row) => sum + row.lifecycle_sends, 0),
    },
    funnel,
    cohortFunnel,
    signupSeries,
    bookingSeries,
    support,
    sampleGuard: sampleGuard(currentCohort.length, settings.min_sample_size),
  };
}

// ---------------------------------------------------------------------------
// Section: Acquisition
// ---------------------------------------------------------------------------

export type AcquisitionRow = {
  key: string;
  accounts: number;
  onboardingCompletedPct: number | null;
  activationPct: number | null;
  firstRequestPct: number | null;
  firstApprovalPct: number | null;
  retainedPct: number | null;
  depositsPaid: number;
  smallSample: boolean;
};

export async function getAcquisitionData(context: GrowthContext) {
  const rows = countedRows(await getAllArtistStats());
  const states = retentionStates(rows, context);
  const minSample = context.settings.min_sample_size;

  const dimension = (
    key:
      | "attribution_source"
      | "attribution_medium"
      | "attribution_campaign"
      | "attribution_referrer"
      | "attribution_entry_path"
      | "attribution_platform",
  ): AcquisitionRow[] =>
    [...groupByAttribution(rows, key).entries()]
      .map(([groupKey, members]) => ({
        key: groupKey,
        accounts: members.length,
        onboardingCompletedPct: rate(
          members.filter((row) => row.onboarding_completed).length,
          members.length,
        ),
        activationPct: rate(members.filter(isActivated).length, members.length),
        firstRequestPct: rate(
          members.filter((row) => row.total_requests > 0).length,
          members.length,
        ),
        firstApprovalPct: rate(
          members.filter((row) => firstApprovalAt(row) !== null).length,
          members.length,
        ),
        retainedPct: rate(
          members.filter((row) => states.get(row.id) === "active").length,
          members.length,
        ),
        depositsPaid: members.reduce((sum, row) => sum + row.deposits_paid, 0),
        smallSample: members.length < minSample,
      }))
      .sort((a, b) => b.accounts - a.accounts);

  const withAttribution = rows.filter(
    (row) => row.attribution_source !== null,
  ).length;

  return {
    coverage: {
      total: rows.length,
      withAttribution,
      // Attribution persistence shipped with the cockpit (0067); every earlier
      // account is honestly "unknown" and can never be backfilled.
      note:
        withAttribution === 0
          ? "No attribution has been captured yet. Attribution persistence starts with this deployment; accounts created earlier stay unknown."
          : `${withAttribution} of ${rows.length} artists carry first-touch attribution (capture began 2026-07 with the cockpit release).`,
    },
    bySource: dimension("attribution_source"),
    byMedium: dimension("attribution_medium"),
    byCampaign: dimension("attribution_campaign"),
    byReferrer: dimension("attribution_referrer"),
    byLandingPage: dimension("attribution_entry_path"),
    bySignupPlatform: dimension("attribution_platform"),
    mobileAdoption: {
      withDevices: rows.filter((row) => (row.device_platforms ?? []).length > 0)
        .length,
      ios: rows.filter((row) => (row.device_platforms ?? []).includes("ios"))
        .length,
      android: rows.filter((row) =>
        (row.device_platforms ?? []).includes("android"),
      ).length,
    },
  };
}

// ---------------------------------------------------------------------------
// Section: Activation
// ---------------------------------------------------------------------------

export async function getActivationData(context: GrowthContext) {
  const [rows, authSummary, signupSeries] = await Promise.all([
    getAllArtistStats(),
    getAuthSummary(context),
    getSignupSeries(context),
  ]);
  const counted = countedRows(rows);
  const { range, settings } = context;
  const states = retentionStates(counted, context);

  const authInRange = signupSeries.reduce(
    (sum, row) => sum + row.auth_signups,
    0,
  );
  const cohort = claimedInRange(counted, range.from, range.to);

  const segments = [
    {
      key: "no_profile",
      label: "Account created, booking page not claimed",
      description:
        "Auth accounts with no profile row. Not individually listable (they have no profile); the count comes from auth.users.",
      count: authSummary?.users_without_profile ?? 0,
      href: null as string | null,
    },
    {
      key: "claimed_not_completed",
      label: "Page claimed, onboarding not completed",
      count: counted.filter(
        (row) => classifyStage(row) === "claimed_not_completed",
      ).length,
      href: "/admin/growth/users?stage=claimed_not_completed",
      description: null as string | null,
    },
    {
      key: "completed_no_requests",
      label: "Onboarding completed, no requests yet",
      count: counted.filter(
        (row) => classifyStage(row) === "completed_no_requests",
      ).length,
      href: "/admin/growth/users?stage=completed_no_requests",
      description: null,
    },
    {
      key: "requests_no_approval",
      label: "Requests received, none approved",
      count: counted.filter(
        (row) => classifyStage(row) === "requests_no_approval",
      ).length,
      href: "/admin/growth/users?stage=requests_no_approval",
      description: null,
    },
    {
      key: "activated_inactive",
      label: "Activated, later inactive",
      count: counted.filter(
        (row) =>
          isActivated(row) &&
          ["churn_risk", "dormant", "churned"].includes(
            states.get(row.id) ?? "",
          ),
      ).length,
      href: "/admin/growth/users?stage=activated_inactive",
      description: null,
    },
  ];

  // Activation rate by account age bucket (claim date).
  const ageBuckets: {
    label: string;
    minDays: number;
    maxDays: number | null;
  }[] = [
    { label: "0 to 7 days", minDays: 0, maxDays: 7 },
    { label: "8 to 30 days", minDays: 8, maxDays: 30 },
    { label: "31 to 90 days", minDays: 31, maxDays: 90 },
    { label: "Over 90 days", minDays: 91, maxDays: null },
  ];
  const byAge = ageBuckets.map((bucket) => {
    const members = counted.filter((row) => {
      const age = daysBetween(
        row.profile_claimed_at,
        context.now.toISOString(),
      );
      return (
        age >= bucket.minDays &&
        (bucket.maxDays === null || age <= bucket.maxDays)
      );
    });
    return {
      label: bucket.label,
      artists: members.length,
      activationPct: rate(members.filter(isActivated).length, members.length),
      smallSample: members.length < settings.min_sample_size,
    };
  });

  const bySource = [
    ...groupByAttribution(counted, "attribution_source").entries(),
  ].map(([source, members]) => ({
    source,
    artists: members.length,
    activationPct: rate(members.filter(isActivated).length, members.length),
    smallSample: members.length < settings.min_sample_size,
  }));

  const funnel = buildActivationFunnel(
    counted,
    authSummary?.total_users ?? null,
  );
  const cohortFunnel = buildActivationFunnel(counted, authInRange, {
    from: range.from,
    to: range.to,
  });

  // The biggest drop between adjacent stages of the all-time funnel.
  let mainAbandonment: { from: string; to: string; lostPct: number } | null =
    null;
  for (let i = 1; i < funnel.length; i++) {
    const previousStage = funnel[i - 1];
    const stage = funnel[i];
    // The funnel interleaves parallel milestones after "activated"; only the
    // ordered head (account -> claimed -> completed -> published -> activated)
    // is a true pipeline.
    if (i > 4 || previousStage.count === 0) continue;
    const lostPct = Math.round(
      ((previousStage.count - stage.count) / previousStage.count) * 100,
    );
    if (!mainAbandonment || lostPct > mainAbandonment.lostPct) {
      mainAbandonment = { from: previousStage.label, to: stage.label, lostPct };
    }
  }

  return {
    definition:
      "Activated = onboarding completed AND booking page live AND at least one booking signal (request received, request approved, bookable slot created, books open, guest spot published, or flash published). Full definition on the definitions tab.",
    funnel,
    cohortFunnel,
    cohortSize: cohort.length,
    medianDaysToActivation: medianDaysToActivation(counted),
    segments,
    byAge,
    bySource,
    mainAbandonment,
    sampleGuard: sampleGuard(cohort.length, settings.min_sample_size),
  };
}

// ---------------------------------------------------------------------------
// Section: Engagement
// ---------------------------------------------------------------------------

export async function getEngagementData(context: GrowthContext) {
  const [rows, activityDays, kindCounts] = await Promise.all([
    getAllArtistStats(),
    getActivityDays(context),
    getActivityKindCounts(context),
  ]);
  const counted = countedRows(rows);
  const summary = buildEngagementSummary(activityDays);
  const states = retentionStates(counted, context);

  const activatedIds = new Set(
    counted.filter(isActivated).map((row) => row.id),
  );
  const actionsByArtist = new Map<string, number>();
  for (const day of activityDays) {
    actionsByArtist.set(
      day.artist_id,
      (actionsByArtist.get(day.artist_id) ?? 0) + day.actions,
    );
  }
  const actionsActivated = [...actionsByArtist.entries()]
    .filter(([id]) => activatedIds.has(id))
    .map(([, count]) => count);
  const actionsNonActivated = [...actionsByArtist.entries()]
    .filter(([id]) => !activatedIds.has(id))
    .map(([, count]) => count);

  const nameById = new Map(counted.map((row) => [row.id, row.display_name]));

  return {
    summary,
    kindCounts: kindCounts.sort((a, b) => b.occurrences - a.occurrences),
    medianActionsPerActiveArtist: median(
      [...actionsByArtist.values()].filter((count) => count > 0),
    ),
    activatedVsNot: {
      activatedMedian: median(actionsActivated),
      nonActivatedMedian: median(actionsNonActivated),
    },
    topArtists: summary.activeDaysPerArtist.slice(0, 10).map((entry) => ({
      ...entry,
      displayName: nameById.get(entry.artistId) ?? "(unknown)",
    })),
    declining: counted
      .filter((row) => states.get(row.id) === "churn_risk")
      .map((row) => ({
        id: row.id,
        displayName: row.display_name,
        slug: row.slug,
        daysSince: daysSinceLastActivity(row, context.now),
      }))
      .sort((a, b) => (b.daysSince ?? 0) - (a.daysSince ?? 0)),
    presenceNote:
      "Day-grain presence (web and mobile app opens) is recorded from the cockpit release onward. Earlier periods only contain recorded actions, which undercounts artists who logged in without acting.",
  };
}

// ---------------------------------------------------------------------------
// Section: Retention
// ---------------------------------------------------------------------------

export async function getRetentionData(context: GrowthContext) {
  const [rows, trailingActivity] = await Promise.all([
    getAllArtistStats(),
    getTrailingActivityDays(context),
  ]);
  const counted = countedRows(rows);
  const { settings } = context;
  const tz = settings.reporting_timezone;
  const states = retentionStates(counted, context);

  const stateCounts: Record<RetentionState, number> = {
    active: 0,
    churn_risk: 0,
    dormant: 0,
    churned: 0,
    pre_activation: 0,
  };
  for (const state of states.values()) stateCounts[state]++;

  const reactivations = findReactivations(
    trailingActivity,
    settings.reactivation_gap_days,
  );

  const dayKeyOf = (iso: string) => dayKeyInTimeZone(new Date(iso), tz);
  const todayKey = dayKeyInTimeZone(context.now, tz);
  // Activity is fetched for the trailing 180 days only: checkpoint windows
  // before that must render blank (unmeasurable), never zero.
  const lookbackStartKey = dayKeyInTimeZone(
    new Date(context.now.getTime() - 180 * 86_400_000),
    tz,
  );

  const cohortsAll = buildRetentionCohorts({
    rows: counted,
    activityDays: trailingActivity,
    cohortBy: "month",
    dayKeyOf,
    todayKey,
    lookbackStartKey,
  });
  const cohortsActivated = buildRetentionCohorts({
    rows: counted,
    activityDays: trailingActivity,
    cohortBy: "month",
    dayKeyOf,
    todayKey,
    onlyActivated: true,
    lookbackStartKey,
  });

  const bySource = [
    ...groupByAttribution(counted, "attribution_source").entries(),
  ].map(([source, members]) => ({
    source,
    artists: members.length,
    activePct: rate(
      members.filter((row) => states.get(row.id) === "active").length,
      members.length,
    ),
    smallSample: members.length < settings.min_sample_size,
  }));

  return {
    thresholds: thresholds(settings),
    stateCounts,
    reactivated: [...reactivations.keys()].map((id) => {
      const row = counted.find((candidate) => candidate.id === id);
      return {
        id,
        displayName: row?.display_name ?? "(unknown)",
        slug: row?.slug ?? null,
        reactivatedOn: reactivations.get(id)?.at(-1) ?? null,
      };
    }),
    cohortsAll,
    cohortsActivated,
    bySource,
    historyNote:
      "Retention before the cockpit release is derived from recorded actions only (bookings, settings changes, decisions). Pure logins were not recorded historically, so early cohorts read lower than reality.",
  };
}

// ---------------------------------------------------------------------------
// Section: Feature adoption
// ---------------------------------------------------------------------------

export type FeatureAdoptionEntry = {
  key: string;
  label: string;
  eligible: number;
  configured: number;
  used: number;
  repeat: number;
  adoptionPct: number | null;
  medianDaysToFirstUse: number | null;
  adopterActivePct: number | null;
  nonAdopterActivePct: number | null;
  smallSample: boolean;
  firstUseUnknown: boolean;
};

export async function getFeatureAdoptionData(context: GrowthContext) {
  const rows = countedRows(await getAllArtistStats());
  const states = retentionStates(rows, context);
  const minSample = context.settings.min_sample_size;

  const activePct = (members: ArtistStatsRow[]): number | null =>
    rate(
      members.filter((row) => states.get(row.id) === "active").length,
      members.length,
    );

  function entry(options: {
    key: string;
    label: string;
    configuredOf: (row: ArtistStatsRow) => boolean;
    usedOf: (row: ArtistStatsRow) => boolean;
    repeatOf: (row: ArtistStatsRow) => boolean;
    firstUseAt?: (row: ArtistStatsRow) => string | null;
    firstUseUnknown?: boolean;
  }): FeatureAdoptionEntry {
    const configured = rows.filter(options.configuredOf);
    const used = rows.filter(options.usedOf);
    const adopters = used;
    const nonAdopters = rows.filter((row) => !options.usedOf(row));
    const firstUseDays = options.firstUseAt
      ? rows
          .map((row) => {
            const first = options.firstUseAt!(row);
            return first ? daysBetween(row.profile_claimed_at, first) : null;
          })
          .filter((days): days is number => days !== null && days >= 0)
      : [];
    const medianFirstUse = median(firstUseDays);
    return {
      key: options.key,
      label: options.label,
      eligible: rows.length,
      configured: configured.length,
      used: used.length,
      repeat: rows.filter(options.repeatOf).length,
      adoptionPct: rate(used.length, rows.length),
      medianDaysToFirstUse:
        medianFirstUse === null ? null : Math.round(medianFirstUse * 10) / 10,
      adopterActivePct: activePct(adopters),
      nonAdopterActivePct: activePct(nonAdopters),
      smallSample: adopters.length < minSample,
      firstUseUnknown: options.firstUseUnknown ?? false,
    };
  }

  const features: FeatureAdoptionEntry[] = [
    entry({
      key: "booking_page",
      label: "Public booking page",
      configuredOf: (row) => !!row.slug,
      usedOf: (row) => row.total_requests > 0,
      repeatOf: (row) => row.total_requests > 1,
      firstUseAt: (row) => row.first_request_at,
    }),
    entry({
      key: "custom_form",
      label: "Custom request form",
      configuredOf: (row) => row.custom_field_count > 0 || row.form_configured,
      usedOf: (row) => row.custom_field_count > 0,
      repeatOf: (row) => row.custom_field_count > 1,
      firstUseUnknown: true,
    }),
    entry({
      key: "slots",
      label: "Bookable slots",
      configuredOf: (row) => row.slot_count > 0,
      usedOf: (row) => row.slot_count > 0,
      repeatOf: (row) => row.slot_count > 2,
      firstUseAt: (row) => row.first_slot_created_at,
      firstUseUnknown: true, // created_at only exists for slots made after 0067
    }),
    entry({
      key: "books_open",
      label: "Books open",
      configuredOf: (row) => row.books_configured,
      usedOf: (row) => row.books_configured && row.books_open_flag,
      repeatOf: () => false,
      firstUseUnknown: true,
    }),
    entry({
      key: "waitlist",
      label: "Waitlist",
      configuredOf: (row) => row.waitlist_count > 0,
      usedOf: (row) => row.waitlist_count > 0,
      repeatOf: (row) => row.waitlist_count > 1,
      firstUseUnknown: true,
    }),
    entry({
      key: "guest_spots",
      label: "Guest spots and travel",
      configuredOf: (row) => row.trip_count > 0,
      usedOf: (row) => row.published_trip_count > 0,
      repeatOf: (row) => row.trip_count > 1,
      firstUseAt: (row) => row.first_trip_at,
    }),
    entry({
      key: "flash",
      label: "Flash designs",
      configuredOf: (row) => row.flash_count > 0,
      usedOf: (row) => row.published_flash_count > 0,
      repeatOf: (row) => row.flash_count > 2,
      firstUseAt: (row) => row.first_flash_at,
    }),
    entry({
      key: "deposits",
      label: "Deposits",
      configuredOf: (row) =>
        row.deposits_requested > 0 || row.stripe_account_status === "active",
      usedOf: (row) => row.deposits_paid > 0,
      repeatOf: (row) => row.deposits_paid > 1,
      firstUseAt: (row) => row.first_deposit_paid_at,
    }),
    entry({
      key: "email_templates",
      label: "Email templates",
      configuredOf: (row) => row.email_template_count > 0,
      usedOf: (row) => row.email_template_count > 0,
      repeatOf: (row) => row.email_template_count > 1,
      firstUseUnknown: true,
    }),
    entry({
      key: "instagram",
      label: "Instagram import",
      configuredOf: (row) => row.instagram_connected,
      usedOf: (row) => row.instagram_connected,
      repeatOf: () => false,
      firstUseUnknown: true,
    }),
    entry({
      key: "mobile_app",
      label: "Mobile app",
      configuredOf: (row) => (row.device_platforms ?? []).length > 0,
      usedOf: (row) => (row.device_platforms ?? []).length > 0,
      repeatOf: (row) => (row.device_platforms ?? []).length > 1,
      firstUseAt: (row) => row.first_device_at,
    }),
    entry({
      key: "support",
      label: "Support",
      configuredOf: (row) => row.support_ticket_count > 0,
      usedOf: (row) => row.support_ticket_count > 0,
      repeatOf: (row) => row.support_ticket_count > 1,
      firstUseUnknown: true,
    }),
  ];

  return {
    features,
    associationNote:
      "Retention differences between users and non-users of a feature are associations. They do not show that the feature causes retention.",
  };
}

// ---------------------------------------------------------------------------
// Section: Booking performance
// ---------------------------------------------------------------------------

export async function getBookingPerformanceData(context: GrowthContext) {
  const { range } = context;
  const [
    rows,
    bookingSeries,
    depositTotals,
    latency,
    auditCounts,
    methodCounts,
  ] = await Promise.all([
    getAllArtistStats(),
    getBookingSeries(context),
    getDepositTotals(context),
    getDecisionLatency(context),
    getAuditActionCounts(context, [
      "customer_cancelled",
      "deposit_payment_failed",
      "deposit_refunded",
      "deposit_forfeited",
    ]),
    getBookingMethodCounts(context),
  ]);

  const counted = countedRows(rows);
  const requests = bookingSeries.reduce((sum, row) => sum + row.requests, 0);
  const approvals = bookingSeries.reduce((sum, row) => sum + row.approvals, 0);
  const declines = bookingSeries.reduce((sum, row) => sum + row.declines, 0);
  const cancellations = bookingSeries.reduce(
    (sum, row) => sum + row.cancellations,
    0,
  );
  const depositsRequested = bookingSeries.reduce(
    (sum, row) => sum + row.deposits_requested,
    0,
  );
  const depositsPaid = bookingSeries.reduce(
    (sum, row) => sum + row.deposits_paid,
    0,
  );

  const latencyHours = latency
    .map((row) => hoursBetween(row.created_at, row.first_decision_at))
    .filter((hours) => hours >= 0);

  const activeArtistIds = new Set(
    counted
      .filter((row) => {
        // Interval overlap with the window: an artist whose only requests came
        // AFTER a historical window must not enter that window's denominator.
        const first = row.first_request_at;
        const last = row.last_request_at ?? row.first_request_at;
        return (
          first &&
          last &&
          new Date(first) < range.to &&
          new Date(last) >= range.from
        );
      })
      .map((row) => row.id),
  );
  const activatedCount = counted.filter(isActivated).length;

  let previous: {
    requests: number;
    approvals: number;
    depositsPaid: number;
  } | null = null;
  if (range.previousFrom && range.previousTo) {
    const previousContext: GrowthContext = {
      ...context,
      range: { ...range, from: range.previousFrom, to: range.previousTo },
    };
    const series = await getBookingSeries(previousContext);
    previous = {
      requests: series.reduce((sum, row) => sum + row.requests, 0),
      approvals: series.reduce((sum, row) => sum + row.approvals, 0),
      depositsPaid: series.reduce((sum, row) => sum + row.deposits_paid, 0),
    };
  }

  return {
    counts: {
      requests: compare(requests, previous?.requests ?? null),
      reviewed: latency.length,
      approvals: compare(approvals, previous?.approvals ?? null),
      declines,
      cancellations,
      customerCancellations: auditCounts.get("customer_cancelled") ?? 0,
      artistCancellations: Math.max(
        0,
        cancellations - (auditCounts.get("customer_cancelled") ?? 0),
      ),
      stalePending: counted.reduce((sum, row) => sum + row.pending_requests, 0),
    },
    rates: {
      approvalRate: rate(approvals, requests),
      cancellationRate: rate(cancellations, requests),
      depositConversionRate: rate(depositsPaid, depositsRequested),
    },
    latency: {
      medianResponseHours: median(latencyHours),
      decidedCount: latency.length,
    },
    perArtist: {
      requestsPerActiveArtist:
        activeArtistIds.size > 0
          ? Math.round((requests / activeArtistIds.size) * 10) / 10
          : null,
      approvedPerActivatedArtist:
        activatedCount > 0
          ? Math.round((approvals / activatedCount) * 10) / 10
          : null,
    },
    methods: methodCounts,
    deposits: {
      requested: depositsRequested,
      paid: depositsPaid,
      failed: auditCounts.get("deposit_payment_failed") ?? 0,
      refunded: auditCounts.get("deposit_refunded") ?? 0,
      forfeited: auditCounts.get("deposit_forfeited") ?? 0,
      totals: depositTotals,
    },
    // The durable conversion marker is form_data->>'source'='waitlist' on the
    // created booking (no audit action has ever been written for conversions).
    waitlistConversions: methodCounts.waitlistConverted,
    series: bookingSeries,
    expiryNote:
      "Inklee has no automatic request expiry; requests pending longer than 7 days are the closest measurable equivalent. Rejected and cancelled requests without money attached are deleted after 30 days (privacy cleanup), so long-range totals undercount them; the daily growth snapshot preserves the aggregates from its start date.",
  };
}

async function getBookingMethodCounts(context: GrowthContext) {
  // One aggregate RPC (0068): five separate PostgREST count queries would each
  // embed the excluded-id list in the request URL, which breaks once the list
  // has a few hundred entries.
  const rows = await rpc<{
    total: number;
    slot_based: number;
    flash_originated: number;
    guest_spot: number;
    artist_created: number;
    waitlist_converted: number;
  }>("growth_booking_method_counts", {
    p_from: context.range.from.toISOString(),
    p_to: context.range.to.toISOString(),
    p_exclude: context.excludedIds,
  });
  const row = rows[0];
  const totalCount = row?.total ?? 0;
  return {
    total: totalCount,
    slotBased: row?.slot_based ?? 0,
    preferredDate: Math.max(0, totalCount - (row?.slot_based ?? 0)),
    flashOriginated: row?.flash_originated ?? 0,
    guestSpot: row?.guest_spot ?? 0,
    artistCreated: row?.artist_created ?? 0,
    waitlistConverted: row?.waitlist_converted ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Section: Lifecycle email
// ---------------------------------------------------------------------------

/** All lifecycle markers, paged past the PostgREST max_rows cap. Bounded in
 *  practice: at most one marker per (definition, artist), so rows ~= 4x the
 *  artist count; the safety stop matches getAllArtistStats' scale ceiling. */
async function fetchAllLifecycleMarkers(): Promise<LifecycleMarker[]> {
  const markers: LifecycleMarker[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await serviceClient
      .from("email_lifecycle_markers")
      .select("definition_key, artist_id, status, created_at")
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`lifecycle markers: ${error.message}`);
    const page = (data ?? []) as LifecycleMarker[];
    markers.push(...page);
    if (page.length < PAGE_SIZE) break;
    if (offset > 200_000) break; // hard safety stop
  }
  return markers;
}

export async function getEmailData(context: GrowthContext) {
  const [rows, engagement, markers, runsResult, eventHealth] =
    await Promise.all([
      getAllArtistStats(),
      getLifecycleEngagement(context),
      fetchAllLifecycleMarkers(),
      serviceClient
        .from("email_lifecycle_runs")
        .select(
          "definition_key, status, audience_size, eligible, sent_count, failed_count, skipped_count, skipped_detail, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(50),
      getEmailEventHealth(),
    ]);

  const counted = countedRows(rows);
  const statsById = new Map(counted.map((row) => [row.id, row]));
  const runs = runsResult.data ?? [];
  const engagementByKey = new Map(
    engagement.map((row) => [row.definition_key, row]),
  );

  const conversions = associateLifecycleConversions(
    markers,
    statsById,
    context.settings.email_attribution_window_days,
  );
  const conversionsByKey = new Map(
    conversions.map((row) => [row.definitionKey, row]),
  );

  const definitions = await Promise.all(
    LIFECYCLE_DEFINITIONS.map(async (definition) => {
      const markerRows = markers.filter(
        (marker) => marker.definition_key === definition.key,
      );
      let eligibleNow: number | null = null;
      try {
        const audience = await resolveSegmentArtists(definition.audienceKey);
        eligibleNow = audience.length;
      } catch {
        eligibleNow = null;
      }
      const latestRun =
        runs.find((run) => run.definition_key === definition.key) ?? null;
      return {
        key: definition.key,
        name: definition.name,
        status: definition.status,
        audienceKey: definition.audienceKey,
        throttleDays: definition.throttleDays,
        eligibleNow,
        sent: markerRows.filter((marker) => marker.status === "sent").length,
        blockedPendingOrFailed: markerRows.filter(
          (marker) => marker.status !== "sent",
        ).length,
        lastSentAt:
          markerRows.find((marker) => marker.status === "sent")?.created_at ??
          null,
        latestRun,
        engagement: engagementByKey.get(definition.key) ?? null,
        conversion: conversionsByKey.get(definition.key) ?? null,
      };
    }),
  );

  const activeKeys = new Set(
    LIFECYCLE_DEFINITIONS.filter(
      (definition) => definition.status === "active",
    ).map((definition) => definition.key),
  );
  const gaps: string[] = [];
  const states = retentionStates(counted, context);
  const dormantActivated = counted.filter(
    (row) =>
      isActivated(row) &&
      ["dormant", "churned"].includes(states.get(row.id) ?? ""),
  ).length;
  if (dormantActivated > 0) {
    gaps.push(
      `${dormantActivated} activated ${dormantActivated === 1 ? "artist is" : "artists are"} dormant, and no reactivation lifecycle email exists.`,
    );
  }
  for (const definition of definitions) {
    if (definition.status === "active" && definition.eligibleNow === 0) {
      gaps.push(
        `${definition.name} is active but currently has no eligible artists.`,
      );
    }
    if (definition.status !== "active") {
      gaps.push(`${definition.name} is imported but not active.`);
    }
  }
  const claimedNotCompleted = counted.filter(
    (row) => !row.onboarding_completed,
  ).length;
  if (
    claimedNotCompleted > 0 &&
    ![...activeKeys].some((key) => key.startsWith("no_requests"))
  ) {
    gaps.push(
      `${claimedNotCompleted} artists are stuck before completing onboarding with no lifecycle email covering that stage.`,
    );
  }

  return {
    definitions,
    runs: runs.slice(0, 10),
    conversionWindowDays: context.settings.email_attribution_window_days,
    attributionNote:
      "Conversions are outcomes observed within the attribution window after a send. They are associated conversions, not proof the email caused the outcome.",
    eventHealth,
    gaps,
  };
}

async function getEmailEventHealth() {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const types = [
    "delivered",
    "opened",
    "clicked",
    "bounced",
    "unsubscribed",
  ] as const;
  const counts = await Promise.all(
    types.map((type) =>
      serviceClient
        .from("email_events")
        .select("id", { count: "exact", head: true })
        .eq("event_type", type)
        .gte("created_at", since)
        .then((result) => [type, result.count ?? 0] as const),
    ),
  );
  const total = counts.reduce((sum, [, count]) => sum + count, 0);
  return {
    last30Days: Object.fromEntries(counts) as Record<
      (typeof types)[number],
      number
    >,
    healthy: total > 0,
    note:
      total === 0
        ? "No Resend webhook events in the last 30 days. Open and click numbers cannot be trusted until events arrive (verify the webhook and Resend tracking toggles)."
        : null,
  };
}

// ---------------------------------------------------------------------------
// Section: User explorer
// ---------------------------------------------------------------------------

export type ExplorerFilters = {
  stage?: string;
  retention?: string;
  source?: string;
  platform?: string;
  feature?: string;
  search?: string;
  claimedFrom?: string;
  claimedTo?: string;
  includeTesters?: boolean;
  page?: number;
};

export const EXPLORER_PAGE_SIZE = 50;

/** First value of a possibly-repeated query key (Next's searchParams contract
 *  is string | string[] | undefined; ?search=a&search=b must not crash). */
function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseExplorerFilters(
  params: Record<string, string | string[] | undefined>,
): ExplorerFilters {
  const rawPage = firstParam(params.page);
  const page = rawPage ? parseInt(rawPage, 10) : 1;
  return {
    stage: firstParam(params.stage),
    retention: firstParam(params.retention),
    source: firstParam(params.source),
    platform: firstParam(params.platform),
    feature: firstParam(params.feature),
    search: firstParam(params.search)?.slice(0, 100),
    claimedFrom: firstParam(params.claimedFrom),
    claimedTo: firstParam(params.claimedTo),
    includeTesters: firstParam(params.testers) === "1",
    page: Number.isFinite(page) && page >= 1 ? page : 1,
  };
}

const FEATURE_PREDICATES: Record<string, (row: ArtistStatsRow) => boolean> = {
  slots: (row) => row.slot_count > 0,
  flash: (row) => row.published_flash_count > 0,
  guest_spots: (row) => row.published_trip_count > 0,
  waitlist: (row) => row.waitlist_count > 0,
  deposits: (row) => row.deposits_paid > 0,
  instagram: (row) => row.instagram_connected,
  custom_form: (row) => row.custom_field_count > 0,
  email_templates: (row) => row.email_template_count > 0,
  mobile_app: (row) => (row.device_platforms ?? []).length > 0,
  support: (row) => row.support_ticket_count > 0,
  books_open: (row) => row.books_configured && row.books_open_flag,
  lifecycle_emailed: (row) => row.lifecycle_sends > 0,
};

/** Unpaginated explorer core: ALL matching rows, mapped. The page slices it;
 *  the CSV export consumes it directly (looping paged calls from a route
 *  handler would refetch the whole dataset per page, since React cache() only
 *  dedupes during RSC rendering). */
export async function getUserExplorerRows(
  context: GrowthContext,
  filters: ExplorerFilters,
) {
  const rows = await getAllArtistStats();

  let filtered = rows.filter((row) =>
    filters.includeTesters ? true : isCountedArtist(row),
  );
  // Retention states over the same set the explorer displays, so tester rows
  // (when included) carry a real state instead of a missing-map fallback.
  const states = retentionStates(filtered, context);

  if (filters.stage && filters.stage !== "all") {
    if (filters.stage === "activated_inactive") {
      filtered = filtered.filter(
        (row) =>
          isActivated(row) &&
          ["churn_risk", "dormant", "churned"].includes(
            states.get(row.id) ?? "",
          ),
      );
    } else {
      filtered = filtered.filter((row) => classifyStage(row) === filters.stage);
    }
  }
  if (filters.retention) {
    filtered = filtered.filter(
      (row) => states.get(row.id) === filters.retention,
    );
  }
  if (filters.source) {
    filtered = filtered.filter(
      (row) => (row.attribution_source ?? "unknown") === filters.source,
    );
  }
  if (filters.platform) {
    filtered = filtered.filter((row) =>
      filters.platform === "mobile"
        ? (row.device_platforms ?? []).length > 0
        : (row.device_platforms ?? []).length === 0,
    );
  }
  if (filters.feature && FEATURE_PREDICATES[filters.feature]) {
    filtered = filtered.filter(FEATURE_PREDICATES[filters.feature]);
  }
  if (filters.search) {
    const needle = filters.search.toLowerCase();
    filtered = filtered.filter(
      (row) =>
        row.display_name.toLowerCase().includes(needle) ||
        row.slug.toLowerCase().includes(needle),
    );
  }
  if (filters.claimedFrom && /^\d{4}-\d{2}-\d{2}$/.test(filters.claimedFrom)) {
    filtered = filtered.filter(
      (row) => row.profile_claimed_at >= `${filters.claimedFrom}T00:00:00Z`,
    );
  }
  if (filters.claimedTo && /^\d{4}-\d{2}-\d{2}$/.test(filters.claimedTo)) {
    filtered = filtered.filter(
      (row) => row.profile_claimed_at <= `${filters.claimedTo}T23:59:59Z`,
    );
  }

  return {
    mapped: filtered.map((row) => ({
      id: row.id,
      slug: row.slug,
      displayName: row.display_name,
      isTester: row.is_tester,
      claimedAt: row.profile_claimed_at,
      stage: classifyStage(row),
      retention: states.get(row.id) ?? ("pre_activation" as RetentionState),
      activated: isActivated(row),
      source: row.attribution_source ?? "unknown",
      totalRequests: row.total_requests,
      approvedRequests: row.approved_requests,
      depositsPaid: row.deposits_paid,
      lifecycleSends: row.lifecycle_sends,
      supportTickets: row.support_ticket_count,
      lastActivityDaysAgo: daysSinceLastActivity(row, context.now),
      mobile: (row.device_platforms ?? []).length > 0,
    })),
    sourceOptions: [
      ...new Set(rows.map((row) => row.attribution_source ?? "unknown")),
    ].sort(),
  };
}

export async function getUserExplorerData(
  context: GrowthContext,
  filters: ExplorerFilters,
) {
  const { mapped, sourceOptions } = await getUserExplorerRows(context, filters);
  const page = filters.page ?? 1;
  return {
    total: mapped.length,
    page,
    pageSize: EXPLORER_PAGE_SIZE,
    rows: mapped.slice(
      (page - 1) * EXPLORER_PAGE_SIZE,
      page * EXPLORER_PAGE_SIZE,
    ),
    sourceOptions,
  };
}

/** Compact growth timeline for one artist (shown on /admin/accounts/[id]). */
export async function getArtistGrowthTimeline(artistId: string) {
  const [statsResult, excludedIds, events, markers] = await Promise.all([
    // Single-row view fetch: materializing the whole per-artist view to
    // render ONE account page would be pure waste.
    serviceClient
      .from("growth_artist_stats")
      .select("*")
      .eq("id", artistId)
      .maybeSingle(),
    getExcludedIds(),
    serviceClient
      .from("analytics_events")
      .select("event_name, properties, source, occurred_at")
      .eq("artist_id", artistId)
      .order("occurred_at", { ascending: false })
      .limit(50),
    serviceClient
      .from("email_lifecycle_markers")
      .select("definition_key, status, created_at")
      .eq("artist_id", artistId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const row = statsResult.data as ArtistStatsRow | null;
  // Admin-owned accounts stay hidden here, matching getAllArtistStats.
  if (!row || (!row.is_tester && excludedIds.includes(row.id))) return null;

  const timeline: { at: string; label: string; detail: string | null }[] = [];
  const push = (
    at: string | null,
    label: string,
    detail: string | null = null,
  ) => {
    if (at) timeline.push({ at, label, detail });
  };

  push(row.account_created_at, "Account created");
  push(row.profile_claimed_at, "Booking page claimed", `/${row.slug}`);
  push(row.onboarding_completed_event_at, "Onboarding completed");
  push(row.first_slot_created_at, "First bookable slot created");
  push(row.first_trip_at, "First guest spot trip created");
  push(row.first_flash_at, "First flash design created");
  push(row.first_request_at, "First booking request received");
  push(firstApprovalAt(row), "First request approved");
  push(row.first_deposit_paid_at, "First deposit paid");
  push(row.first_device_at, "Mobile app first seen");

  for (const event of events.data ?? []) {
    if (event.event_name === "booking_link_copied") {
      const props = (event.properties ?? {}) as Record<string, string>;
      push(event.occurred_at, "Booking link copied", props.surface ?? null);
    }
  }
  for (const marker of markers.data ?? []) {
    if (marker.status === "sent") {
      push(marker.created_at, "Lifecycle email sent", marker.definition_key);
    }
  }

  return {
    activated: isActivated(row),
    stage: classifyStage(row),
    timeline: timeline.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 60),
  };
}

// ---------------------------------------------------------------------------
// Section: Insights
// ---------------------------------------------------------------------------

export async function getInsightsData(context: GrowthContext): Promise<{
  insights: Insight[];
  generatedAt: string;
}> {
  const { range, settings } = context;
  const [rows, signupSeries, emailData, currentFailures, previousFailures] =
    await Promise.all([
      getAllArtistStats(),
      getSignupSeries(context),
      getEmailData(context),
      getAuditActionCounts(context, ["deposit_payment_failed"]),
      range.previousFrom && range.previousTo
        ? getAuditActionCounts(context, ["deposit_payment_failed"], {
            from: range.previousFrom,
            to: range.previousTo,
          })
        : Promise.resolve(new Map<string, number>()),
    ]);

  const counted = countedRows(rows);
  const states = retentionStates(counted, context);
  const currentCohort = claimedInRange(counted, range.from, range.to);
  const previousCohort =
    range.previousFrom && range.previousTo
      ? claimedInRange(counted, range.previousFrom, range.previousTo)
      : null;

  const cohortRate = (cohort: ArtistStatsRow[] | null): number | null =>
    cohort && cohort.length > 0
      ? Math.round((cohort.filter(isActivated).length / cohort.length) * 100)
      : null;

  const medianFor = (cohort: ArtistStatsRow[] | null): number | null =>
    cohort ? medianDaysToFirstRequest(cohort) : null;

  const featureData = await getFeatureAdoptionData(context);

  const bundle: InsightsBundle = {
    periodLabel: range.label,
    minSampleSize: settings.min_sample_size,
    changeThresholdPct: settings.insight_change_threshold_pct,
    activationRate: {
      current: cohortRate(currentCohort),
      previous: cohortRate(previousCohort),
      currentN: currentCohort.length,
    },
    sources: [
      ...groupByAttribution(counted, "attribution_source").entries(),
    ].map(([source, members]) => ({
      source,
      signups: members.length,
      activated: members.filter(isActivated).length,
    })),
    overallActivationPct: cohortRate(counted),
    authSignups: signupSeries.reduce((sum, row) => sum + row.auth_signups, 0),
    profilesClaimed: signupSeries.reduce(
      (sum, row) => sum + row.profiles_claimed,
      0,
    ),
    medianDaysToFirstRequest: {
      current: medianFor(currentCohort),
      previous: medianFor(previousCohort),
      currentN: currentCohort.filter((row) => row.first_request_at).length,
    },
    depositFailures: {
      current: currentFailures.get("deposit_payment_failed") ?? 0,
      previous: previousFailures.get("deposit_payment_failed") ?? 0,
    },
    lifecycle: emailData.definitions.map((definition) => ({
      definitionKey: definition.key,
      sent: definition.sent,
      opened: definition.engagement?.opened ?? 0,
      associatedConversions: definition.conversion?.convertedWithinWindow ?? 0,
    })),
    activatedInactive: counted.filter(
      (row) =>
        isActivated(row) &&
        ["churn_risk", "dormant", "churned"].includes(states.get(row.id) ?? ""),
    ).length,
    activatedTotal: counted.filter(isActivated).length,
    featureRetention: featureData.features.map((feature) => ({
      feature: feature.label,
      adopters: feature.used,
      adopterRetainedPct: feature.adopterActivePct,
      nonAdopterRetainedPct: feature.nonAdopterActivePct,
    })),
  };

  return {
    insights: buildInsights(bundle),
    generatedAt: context.now.toISOString(),
  };
}
