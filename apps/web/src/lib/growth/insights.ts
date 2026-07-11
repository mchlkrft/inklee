/**
 * Deterministic, rule-based insights. No generation, no causal claims: each
 * rule compares computed metrics against thresholds and emits neutral,
 * investigation-oriented wording with an explicit sample-size warning when the
 * underlying n is small. Pure and unit-tested; growth-queries assembles the
 * MetricsBundle from live data.
 */

import type { Insight } from "./types";

export type InsightsBundle = {
  periodLabel: string;
  minSampleSize: number;
  changeThresholdPct: number;
  /** Activation rate (activated / counted artists), current vs previous period cohorts. */
  activationRate: {
    current: number | null;
    previous: number | null;
    currentN: number;
  };
  /** Signups and activation per attribution source. */
  sources: { source: string; signups: number; activated: number }[];
  /** Overall activation rate across all counted artists (baseline for sources). */
  overallActivationPct: number | null;
  /** auth accounts vs claimed profiles in the period. */
  authSignups: number;
  profilesClaimed: number;
  /** Median days from claim to first request, current vs previous cohort. */
  medianDaysToFirstRequest: {
    current: number | null;
    previous: number | null;
    currentN: number;
  };
  /** Deposit payment failures (audit deposit_payment_failed), current vs previous. */
  depositFailures: { current: number; previous: number };
  /** Lifecycle definitions: unique open/click/conversion counts. */
  lifecycle: {
    definitionKey: string;
    sent: number;
    opened: number;
    associatedConversions: number;
  }[];
  /** Activated artists currently dormant or churn-risk. */
  activatedInactive: number;
  activatedTotal: number;
  /** Feature adoption vs retention association (pre-computed pairs). */
  featureRetention: {
    feature: string;
    adopters: number;
    adopterRetainedPct: number | null;
    nonAdopterRetainedPct: number | null;
  }[];
};

function pct(value: number | null): string {
  return value === null ? "n/a" : `${value}%`;
}

function sampleWarning(n: number, min: number): string | null {
  return n >= min
    ? null
    : `Sample of ${n}, below the configured minimum of ${min}.`;
}

export function buildInsights(bundle: InsightsBundle): Insight[] {
  const insights: Insight[] = [];
  const { periodLabel, minSampleSize, changeThresholdPct } = bundle;

  // 1. Activation rate moved vs the previous period.
  const act = bundle.activationRate;
  if (act.current !== null && act.previous !== null && act.previous > 0) {
    const delta = act.current - act.previous;
    if (Math.abs(delta) >= changeThresholdPct / 2) {
      insights.push({
        id: "activation-rate-shift",
        severity: delta < 0 ? "attention" : "info",
        title:
          delta < 0
            ? "Activation rate decreased vs the previous period"
            : "Activation rate increased vs the previous period",
        body: `Artists who signed up in ${periodLabel} activated at ${pct(act.current)}, compared with ${pct(act.previous)} for the previous equivalent period.`,
        currentValue: pct(act.current),
        comparisonValue: pct(act.previous),
        period: periodLabel,
        segment: null,
        sampleWarning: sampleWarning(act.currentN, minSampleSize),
        suggestion:
          "Review the onboarding funnel for the current cohort and compare acquisition sources between the two periods.",
        href: "/admin/growth/activation",
      });
    }
  }

  // 2. A source produces signups but few activated artists.
  for (const source of bundle.sources) {
    if (source.signups < minSampleSize) continue;
    if (bundle.overallActivationPct === null) continue;
    const sourcePct = Math.round((source.activated / source.signups) * 100);
    if (sourcePct < bundle.overallActivationPct / 2) {
      insights.push({
        id: `weak-source-${source.source}`,
        severity: "watch",
        title: `Signups from ${source.source} rarely activate`,
        body: `Activation from ${source.source} signups is ${sourcePct}%, lower than the overall average of ${bundle.overallActivationPct}%. Review the landing page promise, signup intent and onboarding behaviour for this segment.`,
        currentValue: `${sourcePct}%`,
        comparisonValue: `${bundle.overallActivationPct}% overall`,
        // Source groups are lifetime cohorts (attribution is per account, not
        // per period); labeling them with the selected period would lie.
        period: "all time",
        segment: source.source,
        sampleWarning: sampleWarning(source.signups, minSampleSize),
        suggestion:
          "Open the acquisition view filtered to this source and inspect where its artists stop.",
        href: `/admin/growth/acquisition`,
      });
    }
  }

  // 3. Accounts are created but booking pages are not claimed.
  if (bundle.authSignups >= minSampleSize) {
    const claimPct = Math.round(
      (bundle.profilesClaimed / bundle.authSignups) * 100,
    );
    if (claimPct <= 60) {
      insights.push({
        id: "pre-claim-drop",
        severity: "attention",
        title: "Many new accounts never claim a booking page",
        body: `Only ${claimPct}% of accounts created in ${periodLabel} claimed a booking page. The drop happens before onboarding is visible in the profiles table.`,
        currentValue: `${claimPct}% claimed`,
        comparisonValue: null,
        period: periodLabel,
        segment: null,
        sampleWarning: sampleWarning(bundle.authSignups, minSampleSize),
        suggestion:
          "Check the email confirmation step and the first onboarding screen; these accounts exist in auth but never reach claim-slug.",
        href: "/admin/growth/activation",
      });
    }
  }

  // 4. Median time to first request moved up.
  const ttr = bundle.medianDaysToFirstRequest;
  if (
    ttr.current !== null &&
    ttr.previous !== null &&
    ttr.previous > 0 &&
    ttr.current > ttr.previous * (1 + changeThresholdPct / 100)
  ) {
    insights.push({
      id: "time-to-first-request-up",
      severity: "watch",
      title: "Median time to first request has increased",
      body: `Artists in ${periodLabel} took a median of ${ttr.current} days from claiming a page to their first request, up from ${ttr.previous} days in the previous period.`,
      currentValue: `${ttr.current} days`,
      comparisonValue: `${ttr.previous} days`,
      period: periodLabel,
      segment: null,
      sampleWarning: sampleWarning(ttr.currentN, minSampleSize),
      suggestion:
        "Check whether recent cohorts share their booking link (link copies) and whether their books are open.",
      href: "/admin/growth/bookings",
    });
  }

  // 5. Deposit failures increased.
  if (
    bundle.depositFailures.current > bundle.depositFailures.previous &&
    bundle.depositFailures.current >= 3
  ) {
    insights.push({
      id: "deposit-failures-up",
      severity: "attention",
      title: "Deposit payment failures increased",
      body: `${bundle.depositFailures.current} deposit payment failures in ${periodLabel}, up from ${bundle.depositFailures.previous} in the previous period.`,
      currentValue: String(bundle.depositFailures.current),
      comparisonValue: String(bundle.depositFailures.previous),
      period: periodLabel,
      segment: null,
      sampleWarning: null,
      suggestion:
        "Inspect Stripe decline codes for the failing payments and whether they concentrate on one artist or card country.",
      href: "/admin/growth/bookings",
    });
  }

  // 6. Lifecycle email opens without downstream conversion.
  for (const definition of bundle.lifecycle) {
    if (definition.sent < minSampleSize) continue;
    const openPct = Math.round((definition.opened / definition.sent) * 100);
    const convPct = Math.round(
      (definition.associatedConversions / definition.sent) * 100,
    );
    if (openPct >= 40 && convPct <= 5) {
      insights.push({
        id: `lifecycle-weak-conversion-${definition.definitionKey}`,
        severity: "watch",
        title: `${definition.definitionKey} is opened but rarely followed by the target action`,
        body: `${openPct}% of recipients opened this email, but only ${convPct}% showed the associated conversion within the attribution window. Opens do not imply the message worked; the gap suggests the content or the ask needs review.`,
        currentValue: `${convPct}% associated conversion`,
        comparisonValue: `${openPct}% opened`,
        period: "all sends",
        segment: definition.definitionKey,
        sampleWarning: sampleWarning(definition.sent, minSampleSize),
        suggestion:
          "Review the email's call to action against what recipients actually did next.",
        href: "/admin/growth/email",
      });
    }
  }

  // 7. A large share of activated artists has gone quiet.
  if (bundle.activatedTotal >= minSampleSize) {
    const inactivePct = Math.round(
      (bundle.activatedInactive / bundle.activatedTotal) * 100,
    );
    if (inactivePct >= 30) {
      insights.push({
        id: "activated-dormant",
        severity: "attention",
        title: "A large group of activated artists is inactive",
        body: `${bundle.activatedInactive} of ${bundle.activatedTotal} activated artists (${inactivePct}%) are currently churn-risk or dormant.`,
        currentValue: `${inactivePct}%`,
        comparisonValue: null,
        period: "now",
        segment: "activated artists",
        sampleWarning: sampleWarning(bundle.activatedTotal, minSampleSize),
        suggestion:
          "Open the retention view and check whether a lifecycle email exists for this segment.",
        href: "/admin/growth/users?stage=activated_inactive",
      });
    }
  }

  // 8. Feature adoption associated with retention (association, never causation).
  for (const pair of bundle.featureRetention) {
    if (pair.adopters < minSampleSize) continue;
    if (
      pair.adopterRetainedPct !== null &&
      pair.nonAdopterRetainedPct !== null &&
      pair.adopterRetainedPct >= pair.nonAdopterRetainedPct + 25
    ) {
      insights.push({
        id: `feature-retention-${pair.feature}`,
        severity: "info",
        title: `${pair.feature} users currently show higher retention`,
        body: `Artists who use ${pair.feature} currently show ${pair.adopterRetainedPct}% active/retained versus ${pair.nonAdopterRetainedPct}% for non-users. This is an association, not evidence that the feature causes retention.`,
        currentValue: `${pair.adopterRetainedPct}%`,
        comparisonValue: `${pair.nonAdopterRetainedPct}%`,
        period: "now",
        segment: pair.feature,
        sampleWarning: sampleWarning(pair.adopters, minSampleSize),
        suggestion:
          "Consider whether onboarding should introduce this feature earlier, then validate with a cohort comparison.",
        href: "/admin/growth/features",
      });
    }
  }

  const severityRank = { attention: 0, watch: 1, info: 2 } as const;
  return insights.sort(
    (a, b) => severityRank[a.severity] - severityRank[b.severity],
  );
}
