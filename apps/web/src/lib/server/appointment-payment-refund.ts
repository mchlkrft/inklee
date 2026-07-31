import "server-only";
import type Stripe from "stripe";
import * as Sentry from "@sentry/nextjs";
import { serviceClient } from "@/lib/supabase/service";
import { stripe } from "@/lib/stripe";
import { writeAudit } from "@/lib/audit";
import {
  feeRefundOutcome,
  type FeeRefundCase,
} from "@inklee/shared/fee-refund-policy";

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
  | { status: "ok"; refundId: string; refundedMinor: number }
  | { status: "error"; message: string };

const REFUNDABLE_STATUSES = [
  "paid",
  "partially_paid",
  "partially_refunded",
] as const;

export async function refundPaymentRequestCore(input: {
  artistId: string;
  requestId: string;
  refundType: "full" | "partial" | "by_line";
  amountMinor?: number;
  lineIds?: string[];
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
  const { data: allocations } = await serviceClient
    .from("payment_allocations")
    .select(
      "id, line_id, component, amount_minor, currency, collected_total_minor",
    )
    .eq("payment_intent_id", request.payment_intent_id)
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
    .eq("component", "refund_adjustment");

  const alreadyRefunded = Math.abs(
    (existingAdj ?? []).reduce((s, a) => s + a.amount_minor, 0),
  );
  const maxRefundable = positiveTotal - alreadyRefunded;

  let refundMinor: number;
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
    refundMinor = lineAllocations.reduce((s, a) => s + a.amount_minor, 0);
    if (refundMinor > maxRefundable) {
      refundMinor = maxRefundable;
    }
  }

  if (refundMinor <= 0) {
    return { status: "error", message: "Nothing to refund." };
  }

  // 4. Fee refund: read the recorded application fee from the PI metadata.
  const intent = await stripe.paymentIntents.retrieve(
    request.payment_intent_id,
  );
  const feeChargedMinor = parseInt(
    intent.metadata?.application_fee_minor ?? "0",
    10,
  );
  const collectedMinor =
    allocations[0]?.collected_total_minor ?? intent.amount ?? 0;

  const feeOutcome = feeRefundOutcome({
    case: input.case,
    feeChargedMinor,
    paymentMinor: collectedMinor,
    refundedMinor: refundMinor,
  });

  // 5. Create the Stripe refund.
  // `reverse_transfer: true` pulls money back from the artist's connected
  // account. `refund_application_fee` is set only when the fee-refund policy
  // says to return the fee (return_full or return_proportional).
  const shouldRefundFee =
    feeOutcome.treatment === "return_full" ||
    feeOutcome.treatment === "return_proportional";

  const idempotencyKey = `refund-apt-${input.requestId}-${refundMinor}-${Date.now()}`;

  let refund: Stripe.Refund;
  try {
    refund = await stripe.refunds.create(
      {
        payment_intent: request.payment_intent_id,
        amount: refundMinor,
        reverse_transfer: true,
        refund_application_fee: shouldRefundFee,
        metadata: {
          request_id: input.requestId,
          refund_case: input.case,
          fee_refund_policy: feeOutcome.policyVersion,
          fee_return_minor: String(feeOutcome.returnMinor ?? 0),
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
      fee_policy_version: feeOutcome.policyVersion,
      currency: allocations[0]?.currency ?? "eur",
    },
  });

  return {
    status: "ok",
    refundId: refund.id,
    refundedMinor: refundMinor,
  };
}
