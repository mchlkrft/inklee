import * as Sentry from "@sentry/nextjs";
import {
  computeAccountDeletionRefund,
  buildSubscriptionRefundParams,
  subscriptionIdempotencyKey,
} from "@/lib/billing";
import { requireStripe } from "./client";
import { writeWithdrawalCreditNote } from "./tax-snapshot";
import {
  recordDurableConfirmation,
  readPeriod,
  readLatestInvoice,
  resolveChargeId,
  withdrawSubscriptionCore,
} from "./withdrawal";

/**
 * Counsel Q12 (docs/legal/counsel-handoff-2026-08-02.md §5.3): what happens to
 * an ACTIVE PAID subscription when the artist deletes their account.
 *
 *   "Adopt one rule, disclosed on the confirmation screen and in the Terms:
 *    account deletion ends the subscription immediately and refunds the unused
 *    part of the current period pro rata (inside the 14-day window it is
 *    simply processed as a withdrawal, same arithmetic, existing machinery).
 *    Rationale: period-end semantics leave a paid period attached to a
 *    destroyed account; silent forfeiture is the unfair-term shape; and at a
 *    3.00 EUR price the refund is trivial against the risk and support cost."
 *
 * Before this, `deleteOwnAccountCore` cancelled the Stripe subscription
 * immediately (correct half) and refunded nothing (the forfeiture half).
 *
 * TWO LANES, because counsel named two:
 *
 *   • INSIDE the 14-day window -> `withdrawSubscriptionCore`, untouched. It is
 *     the statutory path and it already opens a withdrawal_case, computes the
 *     receipt-time proration, refunds, writes the credit note and the durable
 *     acknowledgement, and downgrades. Re-implementing any of that here would
 *     produce a second withdrawal record with different evidence.
 *
 *   • OUTSIDE it -> `computeAccountDeletionRefund`, this file. Not a
 *     withdrawal: no withdrawal_case, no withdrawal_ack consent, and the used
 *     part of the period is retained because the service was supplied.
 *
 * ORDER: cancel, THEN refund. A refund-first ordering that then failed to
 * cancel would leave a destroyed account on a live subscription that keeps
 * charging. Cancel-first can at worst leave a refund owed, which is recorded.
 *
 * A FAILED REFUND DOES NOT BLOCK ERASURE, and that is a deliberate reading of
 * two rules that pull against each other. Counsel §3 (account-deletion
 * handoff): "erasure is NOT blocked on financial resolution. Deletion always
 * proceeds." Counsel Q12: the remainder must be refunded. Blocking the delete
 * on a Stripe refund failure would let a payment-processor outage suspend a
 * statutory erasure right indefinitely. So the refund is attempted, and if it
 * fails the obligation is written into the retained financial archive
 * (`refundState: "pending"` with the charge id and the amount owed, which is
 * everything needed to complete it by hand) and alerted. This mirrors what the
 * same file already does for an unresolved client deposit: preserve the money
 * route in the pseudonymised record rather than block the erasure. FLAGGED to
 * the supervisor: counsel did not address the failure case, and the opposite
 * reading (refuse the deletion, ask the user to retry) is defensible.
 *
 * A failed CANCEL still blocks, as it did before this change.
 */

export type DeletionRefundState =
  | "not_applicable"
  | "completed"
  | "pending"
  | "failed_cancel";

export type DeletionSubscriptionOutcome = {
  /** False only when the subscription could not be ended (caller must stop). */
  ended: boolean;
  refundState: DeletionRefundState;
  /** Which lane ran; null when there was nothing to end. */
  processedAs: "withdrawal" | "deletion_pro_rata" | null;
  policyVersion: string | null;
  refundGrossMinor: number;
  currency: string | null;
  usedFraction: number | null;
  stripeRefundId: string | null;
  /** Kept so an owed refund can be completed after the account is gone. */
  stripeChargeId: string | null;
  error: string | null;
};

const WITHDRAWAL_WINDOW_DAYS = 14;

function nothingToEnd(): DeletionSubscriptionOutcome {
  return {
    ended: true,
    refundState: "not_applicable",
    processedAs: null,
    policyVersion: null,
    refundGrossMinor: 0,
    currency: null,
    usedFraction: null,
    stripeRefundId: null,
    stripeChargeId: null,
    error: null,
  };
}

export async function endSubscriptionForAccountDeletion(input: {
  artistId: string;
  billingSubscriptionId: string;
  stripeSubscriptionId: string;
  contractCustomerType: string | null;
  now?: Date;
}): Promise<DeletionSubscriptionOutcome> {
  const stripe = requireStripe();
  const now = input.now ?? new Date();

  // Stripe is the truth about the subscription's state, not our mirror row.
  // `latest_invoice.payments` must be expanded or the refundable charge is
  // absent on the pinned API version.
  let sub;
  try {
    sub = await stripe.subscriptions.retrieve(input.stripeSubscriptionId, {
      expand: ["latest_invoice.payments"],
    });
  } catch (err) {
    // Cannot even read it, so cannot know whether it is still charging.
    // Treated as a failed cancel: the caller stops and the user retries.
    return {
      ...nothingToEnd(),
      ended: false,
      refundState: "failed_cancel",
      error: err instanceof Error ? err.message : String(err),
    };
  }

  if (sub.status === "canceled") return nothingToEnd();

  const { periodStart, periodEnd, startDate } = readPeriod(sub);
  const invoice = readLatestInvoice(sub);
  const currency = invoice.currency ?? "eur";

  // Same window arithmetic the withdrawal path enforces, read from the same
  // helper, so "inside the window" cannot mean two different things.
  const windowStart = startDate ?? periodStart ?? now;
  const withinWithdrawalWindow =
    now.getTime() <=
    windowStart.getTime() + WITHDRAWAL_WINDOW_DAYS * 86_400_000;

  if (withinWithdrawalWindow) {
    // Counsel: "inside the 14-day window it is simply processed as a
    // withdrawal, same arithmetic, existing machinery."
    try {
      const result = await withdrawSubscriptionCore({
        artistId: input.artistId,
      });
      if (result.status === "completed") {
        return {
          ended: true,
          refundState: "completed",
          processedAs: "withdrawal",
          policyVersion: null,
          refundGrossMinor: result.refundMinor,
          currency: result.currency,
          usedFraction: null,
          stripeRefundId: null,
          stripeChargeId: invoice.charge,
          error: null,
        };
      }
      // `no_subscription` / `not_available` here would mean the two paths
      // disagree about what exists. Fall through to the pro-rata lane rather
      // than silently ending the subscription with no refund at all.
      Sentry.captureMessage(
        `Account deletion: withdrawal lane returned ${result.status}; falling back to pro-rata`,
        {
          level: "warning",
          tags: { action: "account_deletion_subscription" },
          extra: { artistId: input.artistId },
        },
      );
    } catch (err) {
      Sentry.captureException(err, {
        tags: { action: "account_deletion_subscription" },
        extra: { artistId: input.artistId, lane: "withdrawal" },
      });
      // Same fall-through: a statutory withdrawal that failed must not become
      // a deletion with no refund.
    }
  }

  // ── Pro-rata lane ────────────────────────────────────────────────────────

  // 1. End it. This is the half that must succeed.
  try {
    await stripe.subscriptions.cancel(input.stripeSubscriptionId, undefined, {
      idempotencyKey: subscriptionIdempotencyKey(
        "cancel",
        input.stripeSubscriptionId,
      ),
    });
  } catch (err) {
    let canceled = false;
    try {
      const fresh = await stripe.subscriptions.retrieve(
        input.stripeSubscriptionId,
      );
      canceled = fresh.status === "canceled";
    } catch {
      // Stripe unreachable; cannot confirm.
    }
    if (!canceled) {
      return {
        ...nothingToEnd(),
        ended: false,
        refundState: "failed_cancel",
        processedAs: "deletion_pro_rata",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // 2. The refund the account holder is owed for the unused remainder.
  const refund = computeAccountDeletionRefund({
    paidGrossMinor: invoice.amountPaidMinor ?? 0,
    currency,
    // Unregistered posture => 0, matching the withdrawal path. When Inklee is
    // VAT-registered this must read the original charge snapshot's rate; the
    // credit-note writer below already copies the original treatment, so the
    // split and the tax record change together, not separately.
    taxRate: 0,
    periodStart: periodStart ?? windowStart,
    periodEnd: periodEnd ?? now,
    deletedAt: now,
  });

  const outcome: DeletionSubscriptionOutcome = {
    ended: true,
    refundState: refund.refundGrossMinor > 0 ? "pending" : "not_applicable",
    processedAs: "deletion_pro_rata",
    policyVersion: refund.policyVersion,
    refundGrossMinor: refund.refundGrossMinor,
    currency,
    usedFraction: refund.usedFraction,
    stripeRefundId: null,
    stripeChargeId: null,
    error: null,
  };

  if (refund.refundGrossMinor <= 0) return outcome;

  let chargeId: string | null = null;
  try {
    chargeId = await resolveChargeId(stripe, invoice);
  } catch (err) {
    outcome.error = err instanceof Error ? err.message : String(err);
  }
  outcome.stripeChargeId = chargeId;

  if (!chargeId) {
    // Nothing refundable was found. The obligation is still recorded rather
    // than dropped: `pending` with no charge id is a case for a human.
    outcome.error = outcome.error ?? "no refundable charge on the last invoice";
    Sentry.captureMessage(
      "Account deletion: pro-rata refund owed but no charge could be resolved",
      {
        level: "error",
        tags: { action: "account_deletion_subscription" },
        extra: { artistId: input.artistId, amount: refund.refundGrossMinor },
      },
    );
    return outcome;
  }

  try {
    const { params, idempotencyKey } = buildSubscriptionRefundParams({
      chargeId,
      amountMinor: refund.refundGrossMinor,
      billingSubscriptionId: input.billingSubscriptionId,
      reason: "account_deletion",
      // Its own scope: a deletion can follow a withdrawal on the same
      // subscription, and the withdrawal's key would replay that refund.
      idempotencyScope: "deletion",
    });
    const created = await stripe.refunds.create(params, { idempotencyKey });
    outcome.stripeRefundId = created.id;
    outcome.refundState = "completed";
  } catch (err) {
    outcome.error = err instanceof Error ? err.message : String(err);
    Sentry.captureException(err, {
      tags: { action: "account_deletion_subscription" },
      extra: {
        artistId: input.artistId,
        chargeId,
        amount: refund.refundGrossMinor,
      },
    });
    // Deliberately NOT rethrown: see the header. The obligation travels into
    // the retained archive as `pending`.
    return outcome;
  }

  // 3. The tax record for the money that moved. Best-effort by construction
  //    (the writer never throws) and must not change the refund's outcome:
  //    it is an accounting record, not part of the money move.
  await writeWithdrawalCreditNote({
    artistId: input.artistId,
    billingSubscriptionId: input.billingSubscriptionId,
    stripeCustomerId:
      typeof sub.customer === "string"
        ? sub.customer
        : ((sub.customer as { id?: string } | null)?.id ?? null),
    stripeSubscriptionId: input.stripeSubscriptionId,
    stripeInvoiceId: invoice.invoiceId,
    stripePaymentIntentId: invoice.paymentIntent,
    stripeChargeId: chargeId,
    refundNetMinor: refund.refundNetMinor,
    refundVatMinor: refund.refundVatMinor,
    refundGrossMinor: refund.refundGrossMinor,
    taxRate: refund.taxRate,
    currency,
    contractCustomerType: input.contractCustomerType ?? "consumer",
  });

  // 4. The durable confirmation, sent while there is still an address to send
  //    it to (the auth user is destroyed a few steps later). Never blocks.
  await recordDurableConfirmation({
    artistId: input.artistId,
    billingSubscriptionId: input.billingSubscriptionId,
    kind: "account_deletion",
    refundMinor: refund.refundGrossMinor,
    currency,
    receivedAt: now.toISOString(),
    effectiveAt: now.toISOString(),
  });

  return outcome;
}
