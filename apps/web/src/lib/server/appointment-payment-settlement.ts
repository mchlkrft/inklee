import Stripe from "stripe";
import * as Sentry from "@sentry/nextjs";
import { serviceClient } from "@/lib/supabase/service";
import { stripe } from "@/lib/stripe";
import { writeAudit } from "@/lib/audit";
import { resolveActiveFeeRefundPolicyVersion } from "@inklee/shared/fee-refund-policy";
import { FEE_REFUND_V1_ACTIVATION_ENABLED } from "@/lib/plus-launch-config";
import { sendPaymentReceiptEmail } from "./appointment-payment-delivery";
import type {
  PaymentLineClassification,
  PaymentRequestCollects,
  PaymentAllocationComponent,
} from "@inklee/shared/appointment-payments";

function classificationToComponent(
  classification: PaymentLineClassification,
  collects: PaymentRequestCollects,
): PaymentAllocationComponent {
  switch (classification) {
    case "tattoo_service":
    case "manual_review":
      return collects === "deposit"
        ? "deposit"
        : collects === "balance"
          ? "tattoo_service_balance"
          : "full_price";
    case "additional_service":
      return "additional_service";
    case "physical_goods":
      return "physical_goods";
    case "discount":
      return "discount";
    case "tip":
      return "tip";
    case "tax":
      return "tax";
    case "shipping":
      return "shipping";
  }
}

/**
 * Settle a succeeded appointment-payment PaymentIntent.
 *
 * Writes allocation rows (the `ensure_payment_collection` trigger creates the
 * parent `payment_collections` row), flips the payment request to `paid`, and
 * logs an audit entry. Idempotent: the conditional UPDATE on `payment_requests`
 * is the claim gate, and allocation inserts use ON CONFLICT DO NOTHING against
 * the `(payment_intent_id, component, line_id)` unique constraint.
 *
 * Returns true when this call was the settlement (not a redelivery skip).
 */
export async function settlePaymentRequestSuccess(
  intent: Stripe.PaymentIntent,
): Promise<boolean> {
  const meta = intent.metadata ?? {};
  const requestId = meta.payment_request_id;
  if (!requestId) return false;

  const artistId = meta.artist_id;
  const bookingId = meta.booking_id || null;
  const projectId = meta.project_id || null;
  const collects = meta.collects as PaymentRequestCollects;
  const revision = parseInt(meta.revision ?? "0", 10);
  const quotedAmountMinor = parseInt(meta.quoted_amount_minor ?? "0", 10);
  const applicationFeeMinor = parseInt(meta.application_fee_minor ?? "0", 10);
  const feeScheduleVersion = meta.fee_schedule_version ?? null;
  // G2 (FEE-STP-001): the tier stamped on the intent at quote time
  // (appointment-payment-intent.ts). Null for an intent created before this
  // stamp existed — no invented value (0116/0131 no-backfill precedent).
  const feeTier = meta.fee_tier ?? null;
  const currency = intent.currency ?? "eur";
  const collectedTotalMinor =
    intent.amount_received ?? intent.amount ?? quotedAmountMinor;
  const now = new Date().toISOString();

  // 1. Claim: flip status from payment_processing to paid. The combined
  //    conditions (id + revision + status + payment_intent_id) ensure only the
  //    first delivery wins. A redelivery sees `paid` and matches nothing.
  const { data: claimed } = await serviceClient
    .from("payment_requests")
    .update({ status: "paid" as const, updated_at: now })
    .eq("id", requestId)
    .eq("revision", revision)
    .eq("status", "payment_processing")
    .eq("payment_intent_id", intent.id)
    .select("id")
    .maybeSingle();

  if (!claimed) return false;

  // 2. Read lines for allocation breakdown.
  const { data: lines } = await serviceClient
    .from("payment_request_lines")
    .select("id, classification, line_total_minor, currency")
    .eq("request_id", requestId);

  if (lines && lines.length > 0) {
    const allocations = lines.map((line) => ({
      artist_id: artistId,
      booking_id: bookingId,
      project_id: projectId,
      request_id: requestId,
      line_id: line.id,
      payment_intent_id: intent.id,
      component: classificationToComponent(
        line.classification as PaymentLineClassification,
        collects,
      ),
      amount_minor: line.line_total_minor,
      collected_total_minor: collectedTotalMinor,
      currency,
      status: "succeeded" as const,
      settled_at: now,
    }));

    const { error: allocErr } = await serviceClient
      .from("payment_allocations")
      .upsert(allocations, {
        onConflict: "payment_intent_id,component,line_id",
        ignoreDuplicates: true,
      });

    if (allocErr) {
      Sentry.captureException(allocErr, {
        tags: { action: "appointment_payment_settle_allocations" },
        extra: { requestId, intentId: intent.id },
      });
    }

    // Stamp the collection with the fee facts a refund will need (PAY-RFD-002).
    // The allocation upsert above created the parent `payment_collections` row
    // via the ensure_payment_collection trigger, so it exists to update here.
    //
    //   - application_fee_minor + fee_refund_policy_version: so a refund reads
    //     the fee it took and the policy in force AT SETTLEMENT from stored
    //     state, not from whatever is globally active when the refund happens.
    //   - processor_cost_minor: the ACTUAL Stripe processing cost from the
    //     charge's balance transaction, never derived from the fee percentage.
    //     Captured best-effort: if the balance transaction is not yet available
    //     (Stripe settles it asynchronously) the cost stays null and the status
    //     is 'unavailable', and a refund against it FAILS SAFE (returns the full
    //     fee) rather than retaining an unproven amount; reconciliation can
    //     backfill later. Cost capture must never block the settlement itself.
    const policyVersion = resolveActiveFeeRefundPolicyVersion(
      FEE_REFUND_V1_ACTIVATION_ENABLED,
    );
    const chargeId =
      typeof intent.latest_charge === "string"
        ? intent.latest_charge
        : (intent.latest_charge?.id ?? null);

    let processorCostMinor: number | null = null;
    let costSource: "balance_transaction" | "unavailable" = "unavailable";
    let costStatus: "captured" | "unavailable" = "unavailable";
    if (chargeId && stripe) {
      try {
        const charge = await stripe.charges.retrieve(chargeId, {
          expand: ["balance_transaction"],
        });
        const bt = charge.balance_transaction;
        const feeMinor = bt && typeof bt !== "string" ? bt.fee : null;
        if (typeof feeMinor === "number") {
          processorCostMinor = feeMinor;
          costSource = "balance_transaction";
          costStatus = "captured";
        }
      } catch (costErr) {
        Sentry.captureException(costErr, {
          tags: { action: "appointment_payment_capture_processor_cost" },
          extra: { requestId, intentId: intent.id, chargeId },
        });
      }
    }

    const { error: stampErr } = await serviceClient
      .from("payment_collections")
      .update({
        application_fee_minor: applicationFeeMinor,
        fee_refund_policy_version: policyVersion,
        processor_cost_minor: processorCostMinor,
        processor_cost_source: costSource,
        processor_cost_status: costStatus,
        // G2 (FEE-STP-001): stamped from the intent's OWN metadata, not the
        // active schedule / a re-resolved tier, so (version, tier) together
        // reproduce the fee actually charged even if the schedule or the
        // artist's plan moved between quote and settlement.
        fee_schedule_version: feeScheduleVersion,
        fee_tier: feeTier,
      })
      .eq("payment_intent_id", intent.id);

    if (stampErr) {
      Sentry.captureException(stampErr, {
        tags: { action: "appointment_payment_stamp_collection" },
        extra: { requestId, intentId: intent.id },
      });
    }
  }

  // Client receipt (Track A slice 4). Inside the claim gate, so a redelivery
  // (claim lost -> returned false above) can never double-send; and inside the
  // settlement rather than its callers, so BOTH paths (webhook + reconciliation
  // backstop) produce one. Best-effort: sendPaymentReceiptEmail never throws.
  //
  // AWAITED ON PURPOSE (verifier flagged the webhook-latency cost): this runs
  // on serverless, where fire-and-forget work is killed when the response
  // returns, so `void`-ing it would silently drop receipts. The money has
  // already moved and the claim is already won by this point; a slow email
  // delays only the Stripe ack, and Stripe tolerates seconds. If receipt
  // latency ever matters, the fix is a queue, not `void`.
  await sendPaymentReceiptEmail(serviceClient, {
    artistId,
    requestId,
    bookingId,
    projectId,
    amountMinor: collectedTotalMinor,
    currency,
    paidAt: now,
  });

  void writeAudit({
    action: "appointment_payment_settled",
    actor: "system",
    category: "booking",
    details: {
      payment_request_id: requestId,
      payment_intent_id: intent.id,
      amount_minor: collectedTotalMinor,
      currency,
      collects,
      fee_schedule_version: feeScheduleVersion,
      application_fee_minor: applicationFeeMinor,
    },
  });

  return true;
}

/**
 * Record a FAILED ATTEMPT or a DEAD INTENT on an appointment payment (M7/M8).
 *
 * The two kinds are deliberately different, mirroring the deposit path's
 * reasoning:
 *
 *   "failed"   = `payment_intent.payment_failed`. Fires PER ATTEMPT and the
 *                client can retry the same intent immediately (the pay page
 *                stays payable: `payment_processing` is in
 *                PAYABLE_PAYMENT_REQUEST_STATUSES). So this NEVER transitions
 *                state — a first declined card must not kill a live checkout.
 *                Audit-only, for artist-side visibility.
 *
 *   "canceled" = `payment_intent.canceled`. The intent is dead (abandoned past
 *                Stripe's window, or canceled by us); no retry on it is
 *                possible. Transitions `payment_processing -> failed` (a matrix
 *                edge), gated on THIS intent id so a newer attempt's request is
 *                never touched. From `failed` the artist CANCELS it and creates
 *                a new request (`failed` is artist-cancellable but NOT
 *                re-sendable: the 0126 RPC only sends draft/ready), or the
 *                expiry sweep closes it (`failed` is in EXPIRABLE_STATUSES).
 *                (Corrected 2026-08-01: this previously said "the artist
 *                re-sends", which the send RPC refuses.)
 *
 * Idempotent: the canceled transition's conditional UPDATE matches at most
 * once; redelivered failed events write duplicate audit rows at worst (same
 * posture as the deposit path's attempt log).
 */
export async function settlePaymentRequestFailure(
  intent: Stripe.PaymentIntent,
  kind: "failed" | "canceled",
): Promise<boolean> {
  const requestId = intent.metadata?.payment_request_id;
  if (!requestId) return false;

  if (kind === "canceled") {
    const { data: moved } = await serviceClient
      .from("payment_requests")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", requestId)
      .eq("payment_intent_id", intent.id)
      .eq("status", "payment_processing")
      .select("id")
      .maybeSingle();
    if (!moved) return false;
  }

  void writeAudit({
    action:
      kind === "canceled"
        ? "appointment_payment_intent_canceled"
        : "appointment_payment_attempt_failed",
    actor: "system",
    category: "booking",
    details: {
      payment_request_id: requestId,
      payment_intent_id: intent.id,
      reason: intent.last_payment_error?.message ?? null,
      code: intent.last_payment_error?.code ?? null,
      via: "stripe_webhook",
    },
  });
  return true;
}

/**
 * Settle a refund on an appointment-payment charge.
 *
 * Converge-to-target: reads the cumulative `amount_refunded` from the Charge,
 * distributes it proportionally across the positive allocation components, and
 * upserts `refund_adjustment` rows. Redelivery and multiple partial refunds
 * converge because each call sets the absolute target, never adds a delta.
 *
 * The distribution is across POSITIVE components only. Discount allocations
 * (already negative) stay untouched; the refund adjustments net the positive
 * components down so the total allocated equals `collected - refunded`.
 */
export async function settlePaymentRequestRefund(
  charge: Stripe.Charge,
): Promise<boolean> {
  const intentId =
    typeof charge.payment_intent === "string"
      ? charge.payment_intent
      : (charge.payment_intent?.id ?? null);
  if (!intentId) return false;

  const amountRefunded = charge.amount_refunded ?? 0;
  if (amountRefunded === 0) return false;

  // Read existing allocations for this PI (excluding prior refund_adjustments).
  const { data: allocations } = await serviceClient
    .from("payment_allocations")
    .select(
      "id, artist_id, booking_id, project_id, request_id, line_id, component, amount_minor, currency",
    )
    .eq("payment_intent_id", intentId)
    .neq("component", "refund_adjustment");

  if (!allocations || allocations.length === 0) return false;

  const positiveAllocations = allocations.filter((a) => a.amount_minor > 0);
  if (positiveAllocations.length === 0) return false;

  const positiveTotal = positiveAllocations.reduce(
    (sum, a) => sum + a.amount_minor,
    0,
  );

  // Distribute the refund proportionally, last component absorbs rounding.
  let distributed = 0;
  const adjustments = positiveAllocations.map((alloc, i) => {
    const isLast = i === positiveAllocations.length - 1;
    const target = isLast
      ? -(amountRefunded - distributed)
      : -Math.round((amountRefunded * alloc.amount_minor) / positiveTotal);
    if (!isLast) distributed += -target;

    return {
      artist_id: alloc.artist_id,
      booking_id: alloc.booking_id,
      project_id: alloc.project_id,
      request_id: alloc.request_id,
      line_id: alloc.line_id,
      payment_intent_id: intentId,
      component: "refund_adjustment" as const,
      amount_minor: target,
      collected_total_minor: charge.amount ?? 0,
      currency: alloc.currency,
      status: "succeeded" as const,
      settled_at: new Date().toISOString(),
    };
  });

  // Upsert: ON CONFLICT (payment_intent_id, component, line_id) DO UPDATE.
  // This is the converge-to-target: each delivery sets the absolute amount,
  // so the row ends at the right value regardless of delivery count.
  for (const adj of adjustments) {
    await serviceClient
      .from("payment_allocations")
      .upsert(adj, {
        onConflict: "payment_intent_id,component,line_id",
      })
      .select("id");
  }

  // Determine the new payment request status.
  const requestId = allocations[0].request_id;
  if (requestId) {
    const fullyRefunded = amountRefunded >= (charge.amount ?? 0);
    const newStatus = fullyRefunded ? "refunded" : "partially_refunded";

    // The FROM list mirrors the transition matrix's reversal edges
    // (PAYMENT_REQUEST_TRANSITIONS): cancelled / expired / failed are all
    // reachable from partially_paid, so each can be holding collected money and
    // each has -> partially_refunded / refunded edges. Leaving them out parked
    // a refunded cancellation in "cancelled" with the money silently returned
    // (authz-review Finding B).
    await serviceClient
      .from("payment_requests")
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestId)
      .in("status", [
        "paid",
        "partially_paid",
        "partially_refunded",
        "payment_processing",
        "cancelled",
        "expired",
        "failed",
      ]);
  }

  void writeAudit({
    action: "appointment_payment_refund_settled",
    actor: "system",
    category: "booking",
    details: {
      payment_intent_id: intentId,
      amount_refunded: amountRefunded,
      charge_amount: charge.amount,
      currency: charge.currency,
      fully_refunded: charge.refunded,
      request_id: requestId,
    },
  });

  return true;
}

/**
 * Settle a dispute event on an appointment-payment charge.
 *
 * Updates the allocation statuses for the PI to reflect the dispute state,
 * and transitions the payment request to `disputed` or back from it.
 */
export async function settlePaymentRequestDispute(
  dispute: Stripe.Dispute,
  intentId: string,
  disputeStatus: string,
): Promise<boolean> {
  // Map Stripe dispute status to our collection status.
  const collectionStatus =
    disputeStatus === "won"
      ? ("dispute_won" as const)
      : disputeStatus === "lost"
        ? ("dispute_lost" as const)
        : ("disputed" as const);

  // Update all allocations for this PI.
  const { data: updated } = await serviceClient
    .from("payment_allocations")
    .update({
      status: collectionStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("payment_intent_id", intentId)
    .neq("component", "refund_adjustment")
    .select("request_id");

  if (!updated || updated.length === 0) return false;

  const requestId = updated[0].request_id;
  if (requestId) {
    if (collectionStatus === "dispute_won") {
      // Dispute resolved in our favor: restore to paid.
      await serviceClient
        .from("payment_requests")
        .update({
          status: "paid",
          updated_at: new Date().toISOString(),
        })
        .eq("id", requestId)
        .eq("status", "disputed");
    } else if (collectionStatus === "dispute_lost") {
      // Dispute lost: mark as refunded (money is gone).
      await serviceClient
        .from("payment_requests")
        .update({
          status: "refunded",
          updated_at: new Date().toISOString(),
        })
        .eq("id", requestId)
        .eq("status", "disputed");
    } else {
      // Active dispute.
      await serviceClient
        .from("payment_requests")
        .update({
          status: "disputed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", requestId)
        .in("status", ["paid", "partially_paid", "partially_refunded"]);
    }
  }

  return true;
}
