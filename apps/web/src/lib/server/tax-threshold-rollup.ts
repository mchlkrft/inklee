import "server-only";
import * as Sentry from "@sentry/nextjs";
import { serviceClient } from "@/lib/supabase/service";
import { calendarYearStart } from "@/lib/server/retention-cutoffs";

/**
 * A2 threshold monitor (docs/legal/counsel-accountant-handoff-2026-08.md
 * PART 4 A2): `tax_thresholds` (migration 0108) documented `current_minor` as
 * "maintained by ops / a future rollup over settlements" — nothing maintained
 * it, and the 35k/8k early-warning points the accountant confirmed existed
 * only in prose (docs/product/pricing-model.md:196). This module is that
 * rollup, and 0145 is where the warning points became data
 * (`tax_thresholds.warning_minor`).
 *
 * THE CONSERVATIVE COUNTING RULE (A2, verbatim from the accountant's answer):
 * "platform-fee revenue counts — it is Inklee's own turnover. Until the LO-10
 * round settles fee classification, count ALL fee revenue toward the 35k
 * domestic alert; over-counting toward an alert is safe, under-counting is
 * the silent failure." That is encoded below as: every fee-revenue source is
 * summed WITHOUT splitting by artist/customer country, and the total is
 * written to the `ee_registration_40k` row specifically (not spread across
 * thresholds by geography, which nobody can compute correctly yet).
 *
 * `eu_b2c_oss_10k` and `union_turnover_sme` are DELIBERATELY left at their
 * seeded value here. Fee revenue is Inklee's B2B charge to the artist as
 * trader (A4), not a B2C supply to a cross-border consumer, so it is not the
 * right input for the OSS threshold; and no other B2C cross-border revenue
 * stream exists yet (consumer Plus billing has never gone live — 0 paying
 * customers, 0 live-mode charges, as of this writing). Feeding fee revenue
 * into those two rows would not be "conservative", it would be wrong
 * classification, which is exactly what the accountant asked us to hold off
 * inventing until LO-10.
 */

export type ThresholdStatus = "under" | "approaching" | "exceeded";

/**
 * under / approaching / exceeded from current vs. limit vs. warning.
 *
 * Boundaries are inclusive on BOTH sides (`>=`), the same direction as the
 * counting rule: hitting the warning point exactly means "approaching" has
 * started, and hitting the limit exactly means "exceeded" — never leaving a
 * one-cent gap where the true state is silently invisible. A null
 * `warningMinor` (union_turnover_sme, any country_specific_sme row with no
 * confirmed early-warning figure) means this threshold can only ever report
 * `under` or `exceeded`, never `approaching` — there is no invented default
 * fraction standing in for a number nobody confirmed.
 */
export function resolveThresholdStatus(input: {
  currentMinor: number;
  limitMinor: number;
  warningMinor: number | null;
}): ThresholdStatus {
  if (input.currentMinor >= input.limitMinor) return "exceeded";
  if (input.warningMinor !== null && input.currentMinor >= input.warningMinor) {
    return "approaching";
  }
  return "under";
}

export type FeeRevenueBreakdown = {
  /** booking_requests.platform_fee_collected_cents (0116): the FULL
   *  application_fee_amount Stripe took on a deposit intent, including a
   *  combined deposit+add-on payment's goods portion (webhook route.ts
   *  ~713-717 stamps the whole intent fee here regardless of lane mix). */
  bookingRequestsMinor: number;
  /** orders.platform_fee_amount (0116/0036), STANDALONE orders only
   *  (booking_id IS NULL). A booking-coupled order's platform_fee_amount
   *  (actions.ts add-on prepare, ~line 571) stamps the SAME intent's fee
   *  already counted above, so including it here would double-count every
   *  combined deposit+add-on payment — the one dedup this module has to get
   *  right for "sum every source" to be additive rather than overlapping. */
  standaloneOrdersMinor: number;
  /** payment_collections.application_fee_minor (0125/0131/0136): the
   *  payment-request/quote lane. Always a DIFFERENT Stripe PaymentIntent from
   *  a booking's own deposit intent or an add-on order's intent (this table's
   *  primary key IS the payment_intent_id, and settlePaymentRequestSuccess
   *  never touches booking_requests or orders), so this is always additive,
   *  never an overlap with the two sources above. */
  paymentCollectionsMinor: number;
  totalMinor: number;
};

/** Standalone-order statuses that mean the fee was actually collected at
 *  some point (matches shop-retention.ts's own convention for the same
 *  table): 'pending' and 'cancelled' orders never took a payment, so their
 *  platform_fee_amount (stamped at PREPARE time, before payment) would be
 *  pure invention if counted — that is not the "safe over-count" the
 *  accountant described, it is counting money that never moved. 'refunded' /
 *  'partially_refunded' orders DID collect the fee at settlement (refund
 *  netting is a known, separate gap — see the module doc above and the A6
 *  answer on presenting a retained cost separately — so this pass counts the
 *  gross collected fee, which is over-counting relative to net, i.e. still
 *  the safe direction). */
const COLLECTED_ORDER_STATUSES = [
  "paid",
  "refunded",
  "partially_refunded",
] as const;

/**
 * Sum every known platform-fee-revenue source since `since`. Throws on any
 * read failure (money-adjacent reporting: a swallowed read must never read as
 * "zero revenue", which would silently understate an approaching threshold —
 * the exact failure direction A2 warns against).
 */
export async function computeFeeRevenueSinceMinor(
  since: Date,
): Promise<FeeRevenueBreakdown> {
  const sinceIso = since.toISOString();

  const { data: bookingRows, error: bookingErr } = await serviceClient
    .from("booking_requests")
    .select("platform_fee_collected_cents")
    .not("platform_fee_collected_cents", "is", null)
    .gte("deposit_paid_at", sinceIso);
  if (bookingErr) {
    throw new Error(
      `tax-threshold rollup: booking_requests fee read failed: ${bookingErr.message}`,
    );
  }

  const { data: orderRows, error: orderErr } = await serviceClient
    .from("orders")
    .select("platform_fee_amount")
    .is("booking_id", null)
    .in("status", COLLECTED_ORDER_STATUSES)
    .not("platform_fee_amount", "is", null)
    .gte("created_at", sinceIso);
  if (orderErr) {
    throw new Error(
      `tax-threshold rollup: orders fee read failed: ${orderErr.message}`,
    );
  }

  const { data: collectionRows, error: collectionErr } = await serviceClient
    .from("payment_collections")
    .select("application_fee_minor")
    .not("application_fee_minor", "is", null)
    .gte("created_at", sinceIso);
  if (collectionErr) {
    throw new Error(
      `tax-threshold rollup: payment_collections fee read failed: ${collectionErr.message}`,
    );
  }

  const bookingRequestsMinor = (bookingRows ?? []).reduce(
    (sum, r) => sum + (Number(r.platform_fee_collected_cents) || 0),
    0,
  );
  // orders amounts are numeric EUR (0036); round to minor units the same way
  // fee-savings-query.ts does for the same column.
  const standaloneOrdersMinor = (orderRows ?? []).reduce(
    (sum, r) => sum + Math.round((Number(r.platform_fee_amount) || 0) * 100),
    0,
  );
  const paymentCollectionsMinor = (collectionRows ?? []).reduce(
    (sum, r) => sum + (Number(r.application_fee_minor) || 0),
    0,
  );

  return {
    bookingRequestsMinor,
    standaloneOrdersMinor,
    paymentCollectionsMinor,
    totalMinor:
      bookingRequestsMinor + standaloneOrdersMinor + paymentCollectionsMinor,
  };
}

export type ThresholdUpdate = {
  thresholdType: string;
  currentMinor: number;
  status: ThresholdStatus;
};

export type TaxThresholdRollupResult = {
  revenue: FeeRevenueBreakdown;
  since: string;
  updated: ThresholdUpdate[];
};

/**
 * Recompute `current_minor`/`status` for the thresholds this module has a
 * real revenue source for. Windowed to the CURRENT CALENDAR YEAR
 * (`calendarYearStart`), matching the calendar-year turnover basis both the
 * EE registration threshold and the EU B2C OSS threshold actually use — so
 * the rollup resets itself on 1 Jan by construction, with no separate reset
 * step to forget.
 *
 * Only `ee_registration_40k` is written (the A2 conservative rule names that
 * one specifically). Every other row in the table is left untouched, not
 * zeroed — zeroing rows this module has no evidence for would overwrite
 * whatever a later, correctly-scoped rollup or a manual accountant entry put
 * there.
 */
export async function rollupTaxThresholds(
  now: Date = new Date(),
): Promise<TaxThresholdRollupResult> {
  const since = calendarYearStart(now);
  const revenue = await computeFeeRevenueSinceMinor(since);

  const { data: thresholds, error: readErr } = await serviceClient
    .from("tax_thresholds")
    .select("id, threshold_type, limit_minor, warning_minor")
    .eq("threshold_type", "ee_registration_40k");
  if (readErr) {
    throw new Error(
      `tax-threshold rollup: tax_thresholds read failed: ${readErr.message}`,
    );
  }

  const updated: ThresholdUpdate[] = [];
  for (const t of thresholds ?? []) {
    const status = resolveThresholdStatus({
      currentMinor: revenue.totalMinor,
      limitMinor: Number(t.limit_minor),
      warningMinor:
        t.warning_minor === null || t.warning_minor === undefined
          ? null
          : Number(t.warning_minor),
    });
    const { error: updateErr } = await serviceClient
      .from("tax_thresholds")
      .update({
        current_minor: revenue.totalMinor,
        status,
        updated_at: now.toISOString(),
      })
      .eq("id", t.id as string);
    if (updateErr) {
      throw new Error(
        `tax-threshold rollup: tax_thresholds update failed for ${t.threshold_type}: ${updateErr.message}`,
      );
    }
    updated.push({
      thresholdType: t.threshold_type as string,
      currentMinor: revenue.totalMinor,
      status,
    });
  }

  return { revenue, since: since.toISOString(), updated };
}

export type TaxThresholdRollupStepResult =
  | { ok: true; count: number }
  | { ok: false; error: string };

/**
 * Cron-ready wrapper matching the shop-retention / billing-record-retention
 * convention: catches its own failure, reports it to Sentry, and returns a
 * `Record<string, StepResult>` the retention-purge route merges in directly
 * (`for (const [name, result] of Object.entries(...)) steps[name] = result`),
 * so one failing step here can never prevent the OTHER retention steps in
 * that route from running.
 */
export async function runTaxThresholdRollup(
  now: Date = new Date(),
): Promise<Record<string, TaxThresholdRollupStepResult>> {
  try {
    const result = await rollupTaxThresholds(now);
    return {
      tax_threshold_rollup: { ok: true, count: result.updated.length },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    Sentry.captureException(err, {
      tags: { action: "tax_threshold_rollup" },
    });
    return { tax_threshold_rollup: { ok: false, error: message } };
  }
}
