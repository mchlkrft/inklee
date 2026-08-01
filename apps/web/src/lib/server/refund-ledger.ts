import "server-only";
import * as Sentry from "@sentry/nextjs";
import { serviceClient } from "@/lib/supabase/service";
import type { FeeRefundCase } from "@inklee/shared/fee-refund-policy";

// THE REFUND LEDGER (FD12, migration 0139). Immutable per-event history across
// both money lanes: see 0139's header comment for the full design rationale
// (why one domain-generic pair of tables, the claim-gate shape, the
// referential-action choices). This module is the ONLY writer.

export type RefundDomain = "appointment_payment" | "goods_order";

export type RefundLineWrite = {
  paymentRequestLineId?: string | null;
  orderItemId?: string | null;
  nameSnapshot: string;
  quantityRefunded?: number | null;
  amountMinor: number;
  restocked?: boolean;
};

export type ClaimRefundInput = {
  domain: RefundDomain;
  artistId: string;
  paymentRequestId?: string | null;
  orderId?: string | null;
  currency: string;
  refundType: "full" | "partial_amount" | "by_line";
  feeRefundCase: FeeRefundCase;
  amountMinor: number;
  idempotencyKey: string;
  initiatedBy: string;
};

export type ClaimRefundResult =
  | { claimed: true; id: string }
  /** Another attempt already holds this idempotency key. `status` tells the
   *  caller whether it is safe to retry Stripe under the SAME key (pending /
   *  failed — a crashed or refused prior attempt) or must refuse outright
   *  (succeeded — a genuine duplicate). */
  | {
      claimed: false;
      existing: {
        id: string;
        status: "pending" | "succeeded" | "failed";
        stripeRefundId: string | null;
      } | null;
    };

/**
 * Insert the 'pending' ledger row BEFORE calling Stripe. A unique violation on
 * `idempotency_key` means a concurrent or prior attempt for the IDENTICAL
 * logical refund already holds the slot; the caller reads it back and decides
 * whether to reuse the key (pending/failed) or refuse (succeeded). This is
 * defense in depth ahead of Stripe's own idempotency key: two concurrent
 * requests never both reach the Stripe call for the same refund.
 */
export async function claimRefundSlot(
  input: ClaimRefundInput,
): Promise<ClaimRefundResult> {
  const { data: inserted, error } = await serviceClient
    .from("refunds")
    .insert({
      domain: input.domain,
      artist_id: input.artistId,
      payment_request_id: input.paymentRequestId ?? null,
      order_id: input.orderId ?? null,
      currency: input.currency,
      refund_type: input.refundType,
      fee_refund_case: input.feeRefundCase,
      amount_minor: input.amountMinor,
      idempotency_key: input.idempotencyKey,
      initiated_by: input.initiatedBy,
      status: "pending",
    })
    .select("id")
    .maybeSingle();

  if (inserted) return { claimed: true, id: inserted.id as string };

  // 23505 = unique_violation on idempotency_key: expected under contention.
  // Anything else is a real failure worth surfacing.
  if (error && (error as { code?: string }).code !== "23505") {
    Sentry.captureException(error, {
      tags: { action: "refund_claim_slot" },
      extra: { idempotencyKey: input.idempotencyKey, domain: input.domain },
    });
  }

  const { data: existing } = await serviceClient
    .from("refunds")
    .select("id, status, stripe_refund_id")
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();

  if (!existing) return { claimed: false, existing: null };
  return {
    claimed: false,
    existing: {
      id: existing.id as string,
      status: existing.status as "pending" | "succeeded" | "failed",
      stripeRefundId: (existing.stripe_refund_id as string | null) ?? null,
    },
  };
}

export async function markRefundSucceeded(
  refundId: string,
  patch: {
    stripeRefundId: string;
    applicationFeeReturnMinor: number | null;
    applicationFeeRetainMinor: number | null;
    processorCostRetainedMinor: number;
    feeRefundPolicyVersion: string | null;
  },
): Promise<void> {
  const { error } = await serviceClient
    .from("refunds")
    .update({
      status: "succeeded",
      stripe_refund_id: patch.stripeRefundId,
      application_fee_return_minor: patch.applicationFeeReturnMinor,
      application_fee_retain_minor: patch.applicationFeeRetainMinor,
      processor_cost_retained_minor: patch.processorCostRetainedMinor,
      fee_refund_policy_version: patch.feeRefundPolicyVersion,
      updated_at: new Date().toISOString(),
    })
    .eq("id", refundId);
  if (error) {
    Sentry.captureException(error, {
      tags: { action: "refund_mark_succeeded" },
      extra: { refundId },
    });
  }
}

export async function markRefundFailed(
  refundId: string,
  message: string,
): Promise<void> {
  const { error } = await serviceClient
    .from("refunds")
    .update({
      status: "failed",
      error_message: message,
      updated_at: new Date().toISOString(),
    })
    .eq("id", refundId);
  if (error) {
    Sentry.captureException(error, {
      tags: { action: "refund_mark_failed" },
      extra: { refundId },
    });
  }
}

/** Write the immutable per-line rows for a succeeded refund. Never updated
 *  afterwards — this IS the history. Best-effort by design (Sentry-visible on
 *  failure): the money has already moved correctly by the time this runs, so
 *  a write failure here is a reconciliation gap, not a reason to unwind a
 *  completed Stripe refund. */
export async function writeRefundLines(input: {
  refundId: string;
  artistId: string;
  paymentRequestId?: string | null;
  orderId?: string | null;
  lines: RefundLineWrite[];
}): Promise<void> {
  if (input.lines.length === 0) return;
  const rows = input.lines.map((l) => ({
    refund_id: input.refundId,
    artist_id: input.artistId,
    payment_request_id: input.paymentRequestId ?? null,
    order_id: input.orderId ?? null,
    payment_request_line_id: l.paymentRequestLineId ?? null,
    order_item_id: l.orderItemId ?? null,
    name_snapshot: l.nameSnapshot,
    quantity_refunded: l.quantityRefunded ?? null,
    amount_minor: l.amountMinor,
    restocked: l.restocked ?? false,
  }));
  const { error } = await serviceClient.from("refund_lines").insert(rows);
  if (error) {
    Sentry.captureException(error, {
      tags: { action: "refund_write_lines" },
      extra: { refundId: input.refundId },
    });
  }
}

/** Sum of SUCCEEDED refund amounts already recorded for a subject, in minor
 *  units. The service-role read used by both cores to compute the remaining
 *  refundable balance from the ledger rather than a converging aggregate. */
export async function sumSucceededRefundedMinor(
  domain: RefundDomain,
  subjectId: string,
): Promise<number> {
  const column =
    domain === "appointment_payment" ? "payment_request_id" : "order_id";
  const { data } = await serviceClient
    .from("refunds")
    .select("amount_minor")
    .eq(column, subjectId)
    .eq("status", "succeeded");
  return (data ?? []).reduce(
    (sum: number, r: { amount_minor: number }) =>
      sum + Number(r.amount_minor || 0),
    0,
  );
}

/** Cumulative quantity already refunded for ONE order item, across every
 *  succeeded refund event. Drives the goods engine's per-line remaining
 *  refundable quantity without a separate counter column on `order_items`. */
export async function sumRefundedQuantityForOrderItem(
  orderItemId: string,
): Promise<number> {
  const { data } = await serviceClient
    .from("refund_lines")
    .select("quantity_refunded, refunds!inner(status)")
    .eq("order_item_id", orderItemId)
    .eq("refunds.status", "succeeded");
  return (data ?? []).reduce(
    (sum: number, r: { quantity_refunded: number | null }) =>
      sum + Number(r.quantity_refunded ?? 0),
    0,
  );
}

/** Cumulative amount already refunded for ONE payment-request line, across
 *  every succeeded refund event. Used for the appointment lane's
 *  quantity-based line refunds. */
export async function sumRefundedAmountForRequestLine(
  lineId: string,
): Promise<number> {
  const { data } = await serviceClient
    .from("refund_lines")
    .select("amount_minor, refunds!inner(status)")
    .eq("payment_request_line_id", lineId)
    .eq("refunds.status", "succeeded");
  return (data ?? []).reduce(
    (sum: number, r: { amount_minor: number }) =>
      sum + Number(r.amount_minor || 0),
    0,
  );
}
