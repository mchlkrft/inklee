import type Stripe from "stripe";
import * as Sentry from "@sentry/nextjs";
import { serviceClient } from "@/lib/supabase/service";
import {
  computeWithdrawalProration,
  buildSubscriptionRefundParams,
  subscriptionIdempotencyKey,
} from "@/lib/billing";
import { sendEmail } from "@/lib/email/send";
import { buildEmailHtml } from "@/lib/email/booking-templates";
import { requireStripe } from "./client";
import { reconcileFromStripeSubscription } from "./reconcile";

// Consumer withdrawal core (P6/P7, docs/legal/eu-consumer-withdrawal-flow.md).
// SEPARATE from cancellation. The statutory 14-day withdrawal is ALWAYS honoured
// within the window; the flow is idempotent + resumable via one withdrawal_cases
// row per subscription (0109 unique index), computing a FIXED receipt-time
// proration once. The refund is stripe.refunds.create on Inklee's OWN charge
// through buildSubscriptionRefundParams, which structurally forbids
// reverse_transfer / refund_application_fee (never the deposit money direction).
// The downgrade reuses the shared reconcile (grandfather-restore aware). It never
// touches deposits, Connect, or the customer's data.

const WITHDRAWAL_WINDOW_DAYS = 14;
const WITHDRAWAL_ACK_VERSION = "withdrawal-ack-v1";

export type WithdrawalResult =
  | { status: "no_subscription" }
  | { status: "not_available"; reason: string }
  | {
      status: "completed";
      refundMinor: number;
      currency: string;
      caseId: string;
    };

type CaseRow = {
  id: string;
  state: string;
  received_at: string;
  refund_minor: number | null;
  stripe_refund_id: string | null;
};

// Defensive reads for dahlia + legacy drift (mirrors reconcile.periodEndOf).
function readPeriod(sub: Stripe.Subscription): {
  periodStart: Date | null;
  periodEnd: Date | null;
  startDate: Date | null;
} {
  const item = sub.items?.data?.[0] as unknown as {
    current_period_start?: number;
    current_period_end?: number;
  };
  const top = sub as unknown as {
    current_period_start?: number;
    current_period_end?: number;
    start_date?: number;
  };
  const ps = top.current_period_start ?? item?.current_period_start ?? null;
  const pe = top.current_period_end ?? item?.current_period_end ?? null;
  return {
    periodStart: ps ? new Date(ps * 1000) : null,
    periodEnd: pe ? new Date(pe * 1000) : null,
    startDate: top.start_date ? new Date(top.start_date * 1000) : null,
  };
}

const idOf = (v: unknown): string | null =>
  typeof v === "string" ? v : ((v as { id?: string } | null)?.id ?? null);

function readLatestInvoice(sub: Stripe.Subscription): {
  amountPaidMinor: number | null;
  currency: string | null;
  paymentIntent: string | null;
  charge: string | null;
} {
  const inv = sub.latest_invoice;
  if (!inv || typeof inv === "string") {
    return {
      amountPaidMinor: null,
      currency: null,
      paymentIntent: null,
      charge: null,
    };
  }
  const anyInv = inv as unknown as {
    amount_paid?: number;
    currency?: string;
    payment_intent?: unknown;
    charge?: unknown;
    payments?: { data?: Array<{ payment?: { payment_intent?: unknown } }> };
  };
  const paymentIntent =
    idOf(anyInv.payment_intent) ??
    idOf(anyInv.payments?.data?.[0]?.payment?.payment_intent);
  return {
    amountPaidMinor: anyInv.amount_paid ?? null,
    currency: anyInv.currency ?? null,
    paymentIntent,
    charge: idOf(anyInv.charge),
  };
}

// buildSubscriptionRefundParams refunds a CHARGE. Resolve one, fetching the
// payment intent's latest_charge only when the invoice did not carry a charge.
async function resolveChargeId(
  stripe: Stripe,
  invoice: { paymentIntent: string | null; charge: string | null },
): Promise<string | null> {
  if (invoice.charge) return invoice.charge;
  if (invoice.paymentIntent) {
    const pi = await stripe.paymentIntents.retrieve(invoice.paymentIntent);
    return idOf((pi as unknown as { latest_charge?: unknown }).latest_charge);
  }
  return null;
}

function formatAmount(minor: number, currency: string): string {
  return `${(minor / 100).toFixed(2)} ${currency.toUpperCase()}`;
}

/** Durable-medium acknowledgement (Art. 11a): an append-only confirmation row +
 *  a best-effort email. Never blocks the statutory withdrawal. */
export async function recordDurableConfirmation(input: {
  artistId: string;
  billingSubscriptionId: string;
  kind: "purchase" | "withdrawal";
  refundMinor?: number;
  currency?: string;
}): Promise<void> {
  const now = new Date().toISOString();
  const { data: row } = await serviceClient
    .from("billing_contract_confirmations")
    .insert({
      artist_id: input.artistId,
      billing_subscription_id: input.billingSubscriptionId,
      delivery_channel: "email",
      delivery_status: "pending",
      generated_at: now,
    })
    .select("id")
    .maybeSingle();

  try {
    const { data: userData } = await serviceClient.auth.admin.getUserById(
      input.artistId,
    );
    const email = userData?.user?.email;
    if (!email) throw new Error("no email for artist");

    const refundLine =
      input.kind === "withdrawal" && (input.refundMinor ?? 0) > 0
        ? `A refund of ${formatAmount(input.refundMinor ?? 0, input.currency ?? "eur")} is on its way to your original payment method.`
        : "";
    const body =
      input.kind === "withdrawal"
        ? [
            "We have received your withdrawal from your Inklee Plus subscription.",
            "Your subscription has ended and your plan has been updated. Your account and all of your data are kept.",
            refundLine,
            "This message is your acknowledgement of receipt on a durable medium.",
          ]
            .filter(Boolean)
            .join("\n\n")
        : [
            "Your Inklee Plus subscription is confirmed.",
            "You can manage or cancel it any time from your plan settings.",
            "This message is your confirmation on a durable medium.",
          ].join("\n\n");
    const subject =
      input.kind === "withdrawal"
        ? "Your Inklee Plus withdrawal is confirmed"
        : "Your Inklee Plus subscription is confirmed";

    await sendEmail({
      to: email,
      subject,
      html: buildEmailHtml(body, {}, undefined, {
        footerNote: "Sent by Inklee about your subscription.",
      }),
    });

    if (row?.id) {
      await serviceClient
        .from("billing_contract_confirmations")
        .update({
          delivery_status: "sent",
          delivered_at: new Date().toISOString(),
        })
        .eq("id", row.id);
    }
  } catch (e) {
    Sentry.captureException(e, {
      tags: { action: "billing_durable_confirmation" },
      extra: { artistId: input.artistId, kind: input.kind },
    });
    if (row?.id) {
      await serviceClient
        .from("billing_contract_confirmations")
        .update({ delivery_status: "failed" })
        .eq("id", row.id);
    }
  }
}

export async function withdrawSubscriptionCore(input: {
  artistId: string;
}): Promise<WithdrawalResult> {
  const stripe = requireStripe();

  // 1. The artist's active subscription (access-control record).
  const { data: subRow, error: subErr } = await serviceClient
    .from("billing_subscriptions")
    .select("id, stripe_subscription_id, status")
    .eq("artist_id", input.artistId)
    .in("status", ["active", "trialing", "past_due"])
    .order("last_reconciled_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (subErr)
    throw new Error(`withdrawal: subscription read failed: ${subErr.message}`);
  if (!subRow?.stripe_subscription_id) return { status: "no_subscription" };

  const billingSubscriptionId = subRow.id as string;
  const stripeSubId = subRow.stripe_subscription_id as string;

  // 2. Live Stripe truth (period + invoice/charge). Expand the invoice.
  const sub = await stripe.subscriptions.retrieve(stripeSubId, {
    expand: ["latest_invoice"],
  });
  const { periodStart, periodEnd, startDate } = readPeriod(sub);
  const invoice = readLatestInvoice(sub);
  const currency = invoice.currency ?? "eur";

  const now = new Date();
  const withdrawalPeriodStart = startDate ?? periodStart ?? now;
  const withdrawalDeadline = new Date(
    withdrawalPeriodStart.getTime() + WITHDRAWAL_WINDOW_DAYS * 86_400_000,
  );

  // 3. Eligibility: the statutory 14-day window from contract conclusion. The
  //    withdrawal FUNCTION is always reachable; a withdrawal is VALID only inside
  //    the window. Outside it we create no case; the UI offers cancellation.
  if (now.getTime() > withdrawalDeadline.getTime()) {
    return {
      status: "not_available",
      reason: "The 14-day withdrawal period has ended. You can cancel instead.",
    };
  }

  // 4. Immediate-performance consent drives proration vs full refund (F4(b)).
  const { data: ipConsent } = await serviceClient
    .from("billing_consent_records")
    .select("id")
    .eq("artist_id", input.artistId)
    .eq("consent_type", "immediate_performance_request")
    .order("consented_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const immediatePerformanceRequested = Boolean(ipConsent?.id);

  // 5. Find-or-create the withdrawal case (idempotent; received_at is FIXED so a
  //    retry reuses the same proration and refund amount).
  let caseRow = (
    await serviceClient
      .from("withdrawal_cases")
      .select("id, state, received_at, refund_minor, stripe_refund_id")
      .eq("billing_subscription_id", billingSubscriptionId)
      .maybeSingle()
  ).data as CaseRow | null;

  if (!caseRow) {
    const { data: created, error: insErr } = await serviceClient
      .from("withdrawal_cases")
      .insert({
        artist_id: input.artistId,
        billing_subscription_id: billingSubscriptionId,
        state: "received",
        withdrawal_available: true,
        received_at: now.toISOString(),
        service_start: (periodStart ?? withdrawalPeriodStart).toISOString(),
        withdrawal_period_start: withdrawalPeriodStart.toISOString(),
        withdrawal_deadline: withdrawalDeadline.toISOString(),
        immediate_performance_consent_id: ipConsent?.id ?? null,
        updated_at: now.toISOString(),
      })
      .select("id, state, received_at, refund_minor, stripe_refund_id")
      .maybeSingle();
    if (insErr) {
      if ((insErr as { code?: string }).code === "23505") {
        caseRow = (
          await serviceClient
            .from("withdrawal_cases")
            .select("id, state, received_at, refund_minor, stripe_refund_id")
            .eq("billing_subscription_id", billingSubscriptionId)
            .maybeSingle()
        ).data as CaseRow;
      } else {
        throw new Error(`withdrawal: case create failed: ${insErr.message}`);
      }
    } else {
      caseRow = created as CaseRow;
    }
  }

  const caseId = caseRow.id;
  if (caseRow.state === "completed") {
    return {
      status: "completed",
      refundMinor: caseRow.refund_minor ?? 0,
      currency,
      caseId,
    };
  }

  // 6. Proration at the FIXED receipt time. Unregistered posture => taxRate 0
  //    (when registered, read the original transaction_tax_snapshot rate).
  const proration = computeWithdrawalProration({
    originalGrossMinor: invoice.amountPaidMinor ?? 0,
    currency,
    taxRate: 0,
    periodStart: periodStart ?? withdrawalPeriodStart,
    periodEnd: periodEnd ?? withdrawalDeadline,
    withdrawalAt: new Date(caseRow.received_at),
    immediatePerformanceRequested,
  });

  await serviceClient
    .from("withdrawal_cases")
    .update({
      state: "acknowledged",
      acknowledged_at: now.toISOString(),
      proration_policy_version: proration.policyVersion,
      refund_minor: proration.refundGrossMinor,
      updated_at: now.toISOString(),
    })
    .eq("id", caseId);

  // 7. Immediate durable acknowledgement (best-effort; never blocks withdrawal).
  await recordDurableConfirmation({
    artistId: input.artistId,
    billingSubscriptionId,
    kind: "withdrawal",
    refundMinor: proration.refundGrossMinor,
    currency,
  });

  // 8. PARTIAL refund on Inklee's own charge (skip if nothing owed or already done).
  if (proration.refundGrossMinor > 0 && !caseRow.stripe_refund_id) {
    const chargeId = await resolveChargeId(stripe, invoice);
    if (!chargeId) throw new Error("withdrawal: no charge to refund");
    const { params, idempotencyKey } = buildSubscriptionRefundParams({
      chargeId,
      amountMinor: proration.refundGrossMinor,
      billingSubscriptionId,
      reason: "consumer_withdrawal",
    });
    await serviceClient
      .from("withdrawal_cases")
      .update({ state: "refund_pending", updated_at: new Date().toISOString() })
      .eq("id", caseId);
    const refund = await stripe.refunds.create(params, { idempotencyKey });
    await serviceClient
      .from("withdrawal_cases")
      .update({
        stripe_refund_id: refund.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", caseId);
  }

  // 9. Cancel immediately + downgrade via the shared reconcile (grandfather
  //    restore aware). Skip the cancel if Stripe already shows it canceled.
  if (sub.status !== "canceled") {
    const canceled = await stripe.subscriptions.cancel(stripeSubId, undefined, {
      idempotencyKey: subscriptionIdempotencyKey("cancel", stripeSubId),
    });
    await reconcileFromStripeSubscription(canceled);
  }

  // 10. Record the withdrawal acknowledgement consent + complete the case.
  const done = new Date().toISOString();
  await serviceClient.from("billing_consent_records").insert({
    artist_id: input.artistId,
    consent_type: "withdrawal_ack",
    consent_version: WITHDRAWAL_ACK_VERSION,
    consented_at: done,
    context: { withdrawal_case_id: caseId },
  });
  await serviceClient
    .from("withdrawal_cases")
    .update({ state: "completed", updated_at: done })
    .eq("id", caseId);

  return {
    status: "completed",
    refundMinor: proration.refundGrossMinor,
    currency,
    caseId,
  };
}
