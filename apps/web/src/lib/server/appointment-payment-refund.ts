import "server-only";
import type Stripe from "stripe";
import * as Sentry from "@sentry/nextjs";
import { serviceClient } from "@/lib/supabase/service";
import { stripe } from "@/lib/stripe";
import { writeAudit } from "@/lib/audit";
import {
  feeRefundOutcome,
  ACTIVE_FEE_REFUND_POLICY_VERSION,
  type FeeRefundCase,
} from "@inklee/shared/fee-refund-policy";
import { sumRefundedAmountForRequestLine } from "./refund-ledger";
import { sendRefundConfirmationEmail } from "./appointment-payment-delivery";

// APPOINTMENT PAYMENT REFUND INITIATION (Plus build P9, slice A5).
//
// Spec: docs/product/plus-payments-architecture.md, section 9. Money-path
// rules in AGENTS.md apply to every line.
//
// SCOPE. Artist-initiated refund of a paid appointment payment request. Creates
// the Stripe refund; the `charge.refunded` webhook (A4) then settles the
// allocation adjustments via `settlePaymentRequestRefund`.
//
// Connect semantics: appointment payments use destination charges
// (`transfer_data.destination`), same shape as deposits. Refunds reverse the
// transfer and conditionally refund the application fee per the fee-refund
// policy. Deposit, appointment-payment and goods refunds stay SEPARATE business
// commands even where they share utilities, because their Connect semantics
// differ.

export type RefundResult =
  | {
      status: "ok";
      refundId: string;
      refundedMinor: number;
      /** What remains refundable on this request AFTER this refund, in minor
       *  units. Computed from the same allocation math as `maxRefundable`
       *  above (FD12), so it needs no extra query. */
      remainingRefundableMinor: number;
    }
  | { status: "error"; message: string };

// The states an artist can INITIATE a refund from. Wider than "paid": the
// transition matrix (PAYMENT_REQUEST_TRANSITIONS) deliberately gives cancelled /
// expired / failed their own -> partially_refunded / refunded edges because all
// three are reachable from partially_paid and can be HOLDING COLLECTED MONEY.
// Before those three were added here, money collected on a request that was
// then cancelled/expired/failed had NO self-service refund path (authz-review
// Finding B). Safe to include: the amount is bounded by maxRefundable, computed
// from real allocations, so a request in these states with nothing collected
// refuses with "Nothing to refund." Exported so the UI derives its visibility
// from THIS list instead of hand-copying it.
//
// `disputed` is DELIBERATELY absent (verifier follow-up, 2026-08-01), even
// though the matrix permits disputed -> refunded: Stripe refuses a refund on a
// charge with an open dispute, so offering the button would only manufacture a
// failed Stripe call. Money on a disputed charge moves through the dispute
// flow; if the dispute closes won, the request returns to `paid` and becomes
// refundable here again.
export const REFUNDABLE_STATUSES = [
  "paid",
  "partially_paid",
  "partially_refunded",
  "cancelled",
  "expired",
  "failed",
] as const;

export async function refundPaymentRequestCore(input: {
  artistId: string;
  requestId: string;
  refundType: "full" | "partial" | "by_line";
  amountMinor?: number;
  lineIds?: string[];
  /** FD12: optional per-line QUANTITY for a `by_line` refund, keyed by
   *  `lineIds` entry. A line named here without a quantity (or omitted
   *  entirely) refunds its full remaining amount, matching pre-FD12
   *  behaviour exactly. */
  lineQuantities?: Record<string, number>;
  case: FeeRefundCase;
}): Promise<RefundResult> {
  if (!stripe) {
    return { status: "error", message: "Stripe is not configured." };
  }

  // 1. Read the payment request and validate ownership + status.
  const { data: request, error: reqErr } = await serviceClient
    .from("payment_requests")
    .select(
      "id, artist_id, booking_id, project_id, status, payment_intent_id, revision",
    )
    .eq("id", input.requestId)
    .eq("artist_id", input.artistId)
    .maybeSingle();

  if (reqErr || !request) {
    return { status: "error", message: "Payment request not found." };
  }

  if (
    !REFUNDABLE_STATUSES.includes(
      request.status as (typeof REFUNDABLE_STATUSES)[number],
    )
  ) {
    return {
      status: "error",
      message: `Cannot refund a request in status "${request.status}".`,
    };
  }

  if (!request.payment_intent_id) {
    return { status: "error", message: "No payment intent on this request." };
  }

  // 2. Read existing allocations to compute the refundable amount.
  //
  // ARTIST-SCOPED (audit 2026-08-02). Keying on the intent id ALONE was safe
  // only by accident: `payment_requests.payment_intent_id` is artist-writable,
  // and what stopped a forged id from reaching a victim's allocations was a
  // partial unique index plus the fact that nothing currently writes
  // `partially_paid` — an undocumented accident one feature away from
  // dissolving. `payment_allocations.artist_id` exists; use it, so the scope
  // is a property of the query rather than of the rest of the system.
  const { data: allocations } = await serviceClient
    .from("payment_allocations")
    .select(
      "id, line_id, component, amount_minor, currency, collected_total_minor",
    )
    .eq("payment_intent_id", request.payment_intent_id)
    .eq("artist_id", input.artistId)
    .neq("component", "refund_adjustment");

  if (!allocations || allocations.length === 0) {
    return {
      status: "error",
      message: "No allocations found for this payment.",
    };
  }

  // 3. Compute the refund amount.
  const positiveAllocations = allocations.filter((a) => a.amount_minor > 0);
  const positiveTotal = positiveAllocations.reduce(
    (s, a) => s + a.amount_minor,
    0,
  );

  // Check for existing refund adjustments to compute already-refunded amount.
  const { data: existingAdj } = await serviceClient
    .from("payment_allocations")
    .select("amount_minor")
    .eq("payment_intent_id", request.payment_intent_id)
    .eq("artist_id", input.artistId)
    .eq("component", "refund_adjustment");

  const alreadyRefunded = Math.abs(
    (existingAdj ?? []).reduce((s, a) => s + a.amount_minor, 0),
  );
  const maxRefundable = positiveTotal - alreadyRefunded;

  let refundMinor: number;
  // Populated only for `by_line` (FD12), for the ledger's per-line history.
  let refundLinePlan: {
    lineId: string;
    name: string;
    quantity: number | null;
    amountMinor: number;
  }[] = [];
  if (input.refundType === "full") {
    refundMinor = maxRefundable;
  } else if (input.refundType === "partial") {
    if (!input.amountMinor || input.amountMinor <= 0) {
      return {
        status: "error",
        message: "Partial refund requires a positive amount.",
      };
    }
    if (input.amountMinor > maxRefundable) {
      return {
        status: "error",
        message: `Refund amount exceeds the refundable balance (${maxRefundable}).`,
      };
    }
    refundMinor = input.amountMinor;
  } else {
    // by_line: sum the line items being refunded.
    if (!input.lineIds || input.lineIds.length === 0) {
      return {
        status: "error",
        message: "Line refund requires at least one line.",
      };
    }
    const lineAllocations = positiveAllocations.filter(
      (a) => a.line_id && input.lineIds!.includes(a.line_id),
    );
    if (lineAllocations.length === 0) {
      return {
        status: "error",
        message: "No matching allocations for the specified lines.",
      };
    }

    // FD12 fix: a line's remaining refundable amount is its OWN allocation
    // minus what THIS SPECIFIC LINE has already had refunded (via the
    // immutable ledger), not the full original allocation every time. Without
    // this, re-selecting an already-refunded line while other lines still
    // hold balance summed the line's FULL original amount, which the overall
    // `maxRefundable` clamp below then silently reattributed to the wrong
    // line (an over-refund by misattribution, not by total). Names/quantities
    // are fetched only for `by_line` (never for `full`/`partial`, and never a
    // new query for a caller that omits `lineQuantities`).
    const { data: lineRows } = await serviceClient
      .from("payment_request_lines")
      .select("id, name, quantity, unit_amount_minor")
      .in("id", input.lineIds);
    const lineDetailsById = new Map(
      (lineRows ?? []).map((l) => [
        l.id as string,
        {
          name: (l.name as string) ?? "Line",
          quantity: Number(l.quantity) || 1,
          unitAmountMinor: Number(l.unit_amount_minor) || 0,
        },
      ]),
    );

    let sum = 0;
    const plan: {
      lineId: string;
      name: string;
      quantity: number | null;
      amountMinor: number;
    }[] = [];
    for (const alloc of lineAllocations) {
      const lineId = alloc.line_id as string;
      const alreadyForLine = await sumRefundedAmountForRequestLine(lineId);
      const remainingForLine = Math.max(0, alloc.amount_minor - alreadyForLine);
      if (remainingForLine <= 0) continue;

      const details = lineDetailsById.get(lineId);
      const requestedQty = input.lineQuantities?.[lineId];
      let lineAmount = remainingForLine;
      let quantity: number | null = null;
      if (
        requestedQty &&
        requestedQty > 0 &&
        details &&
        details.unitAmountMinor > 0
      ) {
        quantity = Math.min(requestedQty, details.quantity);
        lineAmount = Math.min(
          details.unitAmountMinor * quantity,
          remainingForLine,
        );
      }
      if (lineAmount <= 0) continue;
      sum += lineAmount;
      plan.push({
        lineId,
        name: details?.name ?? "Line",
        quantity,
        amountMinor: lineAmount,
      });
    }
    refundMinor = sum;
    refundLinePlan = plan;
    if (refundMinor > maxRefundable) {
      refundMinor = maxRefundable;
    }
  }

  if (refundMinor <= 0) {
    return { status: "error", message: "Nothing to refund." };
  }

  // 4. Fee refund inputs. All fee facts are read from STORED transaction state,
  //    never from client input and never inferred from the fee percentage.
  //
  //    - The collection (payment_collections, written by the service role at
  //      settlement) is the authoritative source of the actual processor cost,
  //      the policy version this collection was settled under, and how much
  //      cost prior refunds already retained.
  //    - The policy version is resolved from the collection's stamp, falling
  //      back to the active version for collections settled before it was
  //      stamped. `input.case` chooses the CASE; the server chooses the VERSION.
  const intent = await stripe.paymentIntents.retrieve(
    request.payment_intent_id,
    { expand: ["latest_charge"] },
  );
  const latestCharge =
    intent.latest_charge && typeof intent.latest_charge !== "string"
      ? intent.latest_charge
      : null;
  const applicationFeeId =
    latestCharge && latestCharge.application_fee
      ? typeof latestCharge.application_fee === "string"
        ? latestCharge.application_fee
        : latestCharge.application_fee.id
      : null;

  const { data: collection } = await serviceClient
    .from("payment_collections")
    .select(
      "processor_cost_minor, processor_cost_status, fee_refund_policy_version, processor_cost_retained_minor, application_fee_minor",
    )
    .eq("payment_intent_id", request.payment_intent_id)
    .maybeSingle();

  const feeChargedMinor =
    collection?.application_fee_minor ??
    parseInt(intent.metadata?.application_fee_minor ?? "0", 10);
  const collectedMinor =
    allocations[0]?.collected_total_minor ?? intent.amount ?? 0;

  // The processor cost is only usable when it is PROVEN captured. A pending or
  // unavailable status resolves to null, which makes the outcome not computable
  // and forces the fail-safe below.
  const costCaptured =
    collection?.processor_cost_status === "captured" &&
    collection?.processor_cost_minor != null;
  const nonRecoverableCostMinor = costCaptured
    ? (collection!.processor_cost_minor as number)
    : null;
  const alreadyRetainedMinor = collection?.processor_cost_retained_minor ?? 0;
  const policyVersion =
    collection?.fee_refund_policy_version ?? ACTIVE_FEE_REFUND_POLICY_VERSION;

  const feeOutcome = feeRefundOutcome({
    case: input.case,
    feeChargedMinor,
    paymentMinor: collectedMinor,
    refundedMinor: refundMinor,
    version: policyVersion,
    nonRecoverableCostMinor,
    alreadyRetainedMinor,
  });

  // 5. Decide the fee mechanics from the outcome.
  //
  //   refundApplicationFee=true  -> Stripe returns the WHOLE application fee.
  //   refundApplicationFee=false -> Inklee retains the whole application fee.
  //   partialFeeRefundMinor > 0  -> return only that part of the fee (via a
  //                                 separate application-fee refund), retaining
  //                                 the rest as the non-recoverable cost.
  //
  // The invariant this must never break (PAY-RFD-002): Inklee never retains the
  // whole application fee merely because some processor cost is non-recoverable.
  // Whole-fee retention only happens for retain_where_permitted (dispute/fraud),
  // or when the proven cost genuinely meets or exceeds the fee.
  let refundApplicationFee: boolean;
  let partialFeeRefundMinor = 0;
  let retainedAppliedMinor = 0;
  let retentionNote: string | null = null;

  const treatment = feeOutcome.treatment;
  if (treatment === "return_full" || treatment === "return_proportional") {
    // Unchanged behaviour: the fee is returned. (A partial refund's whole-fee
    // return under return_proportional predates this change and is out of scope
    // for PAY-RFD-002.)
    refundApplicationFee = true;
  } else if (treatment === "retain_non_recoverable") {
    if (feeOutcome.returnMinor == null || feeOutcome.retainMinor == null) {
      // FAIL SAFE: the processor cost is not proven. Never retain an unproven
      // amount and never fall back to retaining the whole fee. Return it in
      // full and flag for reconciliation.
      refundApplicationFee = true;
      retentionNote = "processor_cost_unavailable";
    } else if (feeOutcome.retainMinor === 0) {
      // Nothing to retain (zero cost, or the cost is already fully retained).
      refundApplicationFee = true;
    } else if (feeOutcome.returnMinor === 0) {
      // The proven cost meets or exceeds the fee touched by this refund: retain
      // it all. This is the ONLY whole-fee retention the non-recoverable case
      // permits, and only because the real cost justifies it.
      refundApplicationFee = false;
      retainedAppliedMinor = feeOutcome.retainMinor;
    } else if (applicationFeeId) {
      // Partial: retain the cost, return the margin via an application-fee
      // refund of exactly the computed return amount.
      refundApplicationFee = false;
      partialFeeRefundMinor = feeOutcome.returnMinor;
      retainedAppliedMinor = feeOutcome.retainMinor;
    } else {
      // A partial fee return is owed but the application-fee id is not
      // resolvable, so a partial return cannot be issued. Fail safe by
      // returning the whole fee rather than retaining more than the cost.
      refundApplicationFee = true;
      retentionNote = "application_fee_id_unresolved";
    }
  } else {
    // retain_where_permitted (dispute/fraud): keep the fee, return nothing.
    refundApplicationFee = false;
  }

  // 6. Create the Stripe refund. `reverse_transfer: true` pulls money back from
  //    the artist's connected account.
  //
  // IDEMPOTENCY, DETERMINISTIC. Was `...-${Date.now()}`, which gave every retry
  // a fresh key so Stripe created a second refund on a retried request. The key
  // is now derived from the refund's logical identity: request + amount + the
  // cumulative already-refunded amount BEFORE this refund. A retry of a failed
  // attempt keeps `alreadyRefunded` (the refund_adjustment is written by the
  // webhook only on success), so it reuses the key and Stripe dedupes it; a
  // genuinely separate later refund runs after that adjustment lands, so
  // `alreadyRefunded` has advanced and the key differs. Same shape for the
  // application-fee refund below.
  //
  // FD12 round-5 correction: the key ALSO fingerprints the line selection, for
  // exactly the reason the goods path documents. Two different by-line
  // selections at the same baseline can sum to the SAME amount, and the
  // baseline only advances once the webhook writes the adjustment — so two
  // equal-value by-line refunds issued before that lands used to collide on
  // one key. Stripe then deduped the second, the ledger insert failed the
  // UNIQUE constraint (so nothing was corrupted, and no money was lost), but
  // the insert error was swallowed and the artist was told a refund succeeded
  // when Stripe had moved nothing. The fingerprint makes the two logically
  // distinct refunds distinct to Stripe as well.
  const lineFingerprint =
    input.refundType === "by_line" && refundLinePlan.length > 0
      ? refundLinePlan
          .map((p) => `${p.lineId}:${p.quantity ?? "all"}`)
          .sort()
          .join("_")
      : "amount";
  const idempotencyKey = `refund-apt-${input.requestId}-${refundMinor}-${alreadyRefunded}-${lineFingerprint}`;

  let refund: Stripe.Refund;
  try {
    refund = await stripe.refunds.create(
      {
        payment_intent: request.payment_intent_id,
        amount: refundMinor,
        reverse_transfer: true,
        refund_application_fee: refundApplicationFee,
        metadata: {
          request_id: input.requestId,
          refund_case: input.case,
          fee_refund_policy: feeOutcome.policyVersion,
          fee_return_minor: String(feeOutcome.returnMinor ?? 0),
          fee_retain_minor: String(feeOutcome.retainMinor ?? 0),
        },
      },
      { idempotencyKey },
    );
  } catch (stripeErr) {
    Sentry.captureException(stripeErr, {
      tags: { action: "appointment_payment_refund" },
      extra: {
        requestId: input.requestId,
        refundMinor,
        intentId: request.payment_intent_id,
      },
    });
    return { status: "error", message: "Refund could not be processed." };
  }

  // 6a. Partial fee return: refund only the margin of the application fee,
  //     leaving the non-recoverable cost with Inklee. The customer refund above
  //     has already succeeded, so a failure here is a reconciliation matter (the
  //     margin was not returned), not a reason to fail the whole refund.
  if (partialFeeRefundMinor > 0 && applicationFeeId) {
    try {
      await stripe.applicationFees.createRefund(
        applicationFeeId,
        { amount: partialFeeRefundMinor },
        {
          idempotencyKey: `refund-apt-fee-${input.requestId}-${refundMinor}-${alreadyRefunded}`,
        },
      );
    } catch (feeErr) {
      Sentry.captureException(feeErr, {
        tags: { action: "appointment_payment_fee_refund" },
        extra: {
          requestId: input.requestId,
          applicationFeeId,
          partialFeeRefundMinor,
        },
      });
      retentionNote = "partial_fee_refund_failed";
    }
  }

  // 6b. Record the non-recoverable cost retained by THIS refund so a later
  //     partial or repeated refund on the same collection cannot retain it
  //     again. Best-effort: a failure here is trued up by reconciliation, and
  //     the money has already moved correctly.
  if (retainedAppliedMinor > 0 && collection) {
    const { error: retErr } = await serviceClient
      .from("payment_collections")
      .update({
        processor_cost_retained_minor:
          alreadyRetainedMinor + retainedAppliedMinor,
      })
      .eq("payment_intent_id", request.payment_intent_id)
      .eq("artist_id", input.artistId);
    if (retErr) {
      Sentry.captureException(retErr, {
        tags: { action: "appointment_payment_record_retained_cost" },
        extra: { requestId: input.requestId, retainedAppliedMinor },
      });
    }
  }

  void writeAudit({
    action: "appointment_payment_refund_initiated",
    actor: input.artistId,
    category: "booking",
    details: {
      payment_request_id: input.requestId,
      payment_intent_id: request.payment_intent_id,
      refund_id: refund.id,
      refund_type: input.refundType,
      refund_case: input.case,
      amount_minor: refundMinor,
      fee_treatment: feeOutcome.treatment,
      fee_return_minor: feeOutcome.returnMinor,
      fee_retain_minor: feeOutcome.retainMinor,
      fee_retained_applied_minor: retainedAppliedMinor,
      fee_policy_version: feeOutcome.policyVersion,
      processor_cost_minor: nonRecoverableCostMinor,
      retention_note: retentionNote,
      currency: allocations[0]?.currency ?? "eur",
    },
  });

  // FD12: immutable per-event ledger row(s), for history/reconciliation that
  // the converging `payment_allocations.refund_adjustment` rows cannot give
  // (those hold only the CURRENT cumulative total, never individual events).
  // Best-effort and isolated in its own try/catch: the Stripe refund has
  // already succeeded and every prior step has already run by this point, so
  // a ledger write failure must never unwind or fail the response — it is a
  // reconciliation gap, Sentry-visible, same posture as 6b above.
  try {
    const { data: ledgerRow, error: ledgerError } = await serviceClient
      .from("refunds")
      .insert({
        domain: "appointment_payment",
        artist_id: input.artistId,
        payment_request_id: input.requestId,
        currency: allocations[0]?.currency ?? "eur",
        refund_type:
          input.refundType === "partial" ? "partial_amount" : input.refundType,
        fee_refund_case: input.case,
        status: "succeeded",
        amount_minor: refundMinor,
        application_fee_return_minor: feeOutcome.returnMinor,
        application_fee_retain_minor: feeOutcome.retainMinor,
        processor_cost_retained_minor: retainedAppliedMinor,
        fee_refund_policy_version: feeOutcome.policyVersion,
        stripe_refund_id: refund.id,
        idempotency_key: idempotencyKey,
        initiated_by: input.artistId,
      })
      .select("id")
      .maybeSingle();

    // Best-effort does NOT mean unobserved (round-5 finding): swallowing this
    // is what let a duplicate-key collision report success while nothing was
    // recorded. A 23505 here specifically means the idempotency key was
    // already used, i.e. Stripe deduped the refund and no money moved.
    if (ledgerError) {
      Sentry.captureException(ledgerError, {
        tags: { action: "appointment_refund_ledger_write" },
        extra: {
          requestId: input.requestId,
          idempotencyKey,
          duplicateKey: (ledgerError as { code?: string }).code === "23505",
        },
      });
    }

    if (ledgerRow) {
      const lineRows =
        input.refundType === "by_line" && refundLinePlan.length > 0
          ? refundLinePlan.map((p) => ({
              refund_id: ledgerRow.id,
              artist_id: input.artistId,
              payment_request_id: input.requestId,
              payment_request_line_id: p.lineId,
              name_snapshot: p.name,
              quantity_refunded: p.quantity,
              amount_minor: p.amountMinor,
              restocked: false,
            }))
          : [
              {
                refund_id: ledgerRow.id,
                artist_id: input.artistId,
                payment_request_id: input.requestId,
                payment_request_line_id: null,
                name_snapshot:
                  input.refundType === "full"
                    ? "Full refund"
                    : "Partial amount",
                quantity_refunded: null,
                amount_minor: refundMinor,
                restocked: false,
              },
            ];
      await serviceClient.from("refund_lines").insert(lineRows);
    }

    // Per-line refund_status (read by the UI, previously write-less: this
    // column has existed since 0125 with nothing ever setting it). A `full`
    // refund closes the whole request, so every line on it is now fully
    // refunded. A `by_line` refund updates only the touched lines, comparing
    // this line's TOTAL refunded-to-date against its own total (so a second
    // partial refund on the same line correctly reads 'full' once exhausted,
    // not just 'partial' again). A bare amount-only `partial` cannot honestly
    // attribute to specific lines, so it updates none, matching this file's
    // existing entangled-amount honesty elsewhere.
    if (input.refundType === "full") {
      await serviceClient
        .from("payment_request_lines")
        .update({ refund_status: "full" })
        .eq("request_id", input.requestId);
    } else if (input.refundType === "by_line") {
      for (const p of refundLinePlan) {
        const totalForLine = await sumRefundedAmountForRequestLine(p.lineId);
        const lineOriginal = positiveAllocations.find(
          (a) => a.line_id === p.lineId,
        )?.amount_minor;
        const status =
          lineOriginal != null && totalForLine >= lineOriginal
            ? "full"
            : "partial";
        await serviceClient
          .from("payment_request_lines")
          .update({ refund_status: status })
          .eq("id", p.lineId);
      }
    }
  } catch (ledgerErr) {
    Sentry.captureException(ledgerErr, {
      tags: { action: "appointment_payment_refund_ledger" },
      extra: { requestId: input.requestId },
    });
  }

  const remainingRefundableMinor = Math.max(0, maxRefundable - refundMinor);

  // FD12 buyer confirmation. Best-effort (never fails the refund result, same
  // posture as sendPaymentReceiptEmail on the collection side) and AWAITED for
  // the same reason that one is: this runs on serverless, where fire-and-forget
  // work is killed once the response returns.
  await sendRefundConfirmationEmail(serviceClient, {
    artistId: input.artistId,
    requestId: input.requestId,
    bookingId: (request.booking_id as string | null) ?? null,
    projectId: (request.project_id as string | null) ?? null,
    refundedMinor: refundMinor,
    remainingRefundableMinor,
    currency: allocations[0]?.currency ?? "eur",
  });

  return {
    status: "ok",
    refundId: refund.id,
    refundedMinor: refundMinor,
    remainingRefundableMinor,
  };
}
