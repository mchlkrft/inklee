import type Stripe from "stripe";
import { createHash } from "node:crypto";
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
import { writeWithdrawalCreditNote } from "./tax-snapshot";

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
  invoiceId: string | null;
  amountPaidMinor: number | null;
  currency: string | null;
  paymentIntent: string | null;
  charge: string | null;
} {
  const inv = sub.latest_invoice;
  if (!inv || typeof inv === "string") {
    return {
      invoiceId: typeof inv === "string" ? inv : null,
      amountPaidMinor: null,
      currency: null,
      paymentIntent: null,
      charge: null,
    };
  }
  const anyInv = inv as unknown as {
    id?: string;
    amount_paid?: number;
    currency?: string;
    payment_intent?: unknown; // legacy (pre-basil)
    charge?: unknown; // legacy (pre-basil)
    payments?: {
      data?: Array<{
        payment?: { payment_intent?: unknown; charge?: unknown };
      }>;
    };
  };
  // dahlia (pinned): the charge/payment_intent live under invoice.payments (which
  // must be expanded). Read that first, then fall back to the legacy top-level
  // fields for any pre-basil serialization.
  const payment = anyInv.payments?.data?.[0]?.payment;
  const paymentIntent =
    idOf(payment?.payment_intent) ?? idOf(anyInv.payment_intent);
  const charge = idOf(payment?.charge) ?? idOf(anyInv.charge);
  return {
    invoiceId: anyInv.id ?? null,
    amountPaidMinor: anyInv.amount_paid ?? null,
    currency: anyInv.currency ?? null,
    paymentIntent,
    charge,
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

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : `${d.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })} at ${d.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
      })}`;
}

/** Durable-medium acknowledgement (Art. 11a): an append-only confirmation row +
 *  a best-effort email. Never blocks the statutory withdrawal. */
export async function recordDurableConfirmation(input: {
  artistId: string;
  billingSubscriptionId: string;
  kind: "purchase" | "withdrawal" | "cancellation";
  stripeInvoiceId?: string;
  refundMinor?: number;
  currency?: string;
  /** When the cancellation statement was received (ISO). Shown so a cancellation
   *  confirmation states the receipt date/time (§ 312k BGB requirement). */
  receivedAt?: string;
  /** Whether the consumer expressly requested immediate performance (P3). The
   *  durable confirmation must RESTATE this consent (counsel condition A<->C):
   *  the proportionate charge on a mid-period withdrawal is only enforceable if
   *  the consent was confirmed on a durable medium (CRD Art. 8(7) / 14(4)(a)). */
  immediatePerformanceRequested?: boolean;
  /** Withdrawal effective date (ISO), shown so the acknowledgement identifies the
   *  contract withdrawn AND the effective date (counsel condition C). */
  effectiveAt?: string;
  /** The proportionate amount RETAINED on the withdrawal, when a deduction
   *  applied (immediate performance requested and not a full refund). */
  retainedMinor?: number;
  /** True when the whole period was refunded (no proportionate deduction). */
  fullRefund?: boolean;
}): Promise<void> {
  const now = new Date().toISOString();

  // Idempotency for webhook redelivery: at most one delivered confirmation per
  // invoice. (The withdrawal ack carries no invoice id and is guarded by the
  // one-per-subscription case instead.)
  if (input.stripeInvoiceId) {
    const { data: existing } = await serviceClient
      .from("billing_contract_confirmations")
      .select("id")
      .eq("stripe_invoice_id", input.stripeInvoiceId)
      .eq("delivery_status", "sent")
      .maybeSingle();
    if (existing) return;
  }

  // P0 (2026-07-28): the confirmation STAMPS the accepted terms version. The
  // buyer's acceptance evidence is the terms_acceptance consent row written at
  // checkout, so the version comes from there (scoped to this artist's latest
  // acceptance; there is exactly one live contract per artist by design).
  // Fail-soft to null rather than blocking a statutory confirmation: the
  // consent row itself remains the primary evidence, and check 11 of the
  // legal-artifact validator reports null stamps as a gap.
  let termsVersion: string | null = null;
  try {
    const { data: consent } = await serviceClient
      .from("billing_consent_records")
      .select("consent_version")
      .eq("artist_id", input.artistId)
      .eq("consent_type", "terms_acceptance")
      .order("consented_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    termsVersion = (consent?.consent_version as string | null) ?? null;
  } catch {
    // keep null
  }

  const { data: row, error: insErr } = await serviceClient
    .from("billing_contract_confirmations")
    .insert({
      artist_id: input.artistId,
      billing_subscription_id: input.billingSubscriptionId,
      stripe_invoice_id: input.stripeInvoiceId ?? null,
      terms_version: termsVersion,
      delivery_channel: "email",
      delivery_status: "pending",
      generated_at: now,
    })
    .select("id")
    .maybeSingle();
  // 23505 = a concurrent delivery for the same invoice won the unique index
  // (0110); it is sending, so stop here rather than send a duplicate.
  if (insErr && (insErr as { code?: string }).code === "23505") return;

  // Hoisted so the delivery-status updates below can stamp payload_hash (the
  // hash of the generated confirmation content, 0106 DDL) whether the send
  // succeeded or failed after generation.
  let generatedBody: string | null = null;
  try {
    const { data: userData } = await serviceClient.auth.admin.getUserById(
      input.artistId,
    );
    const email = userData?.user?.email;
    if (!email) throw new Error("no email for artist");

    const currency = input.currency ?? "eur";
    let body: string;
    if (input.kind === "withdrawal") {
      const effectiveLine = input.effectiveAt
        ? `Your withdrawal takes effect on ${formatDate(input.effectiveAt)}.`
        : "";
      // Restate the immediate-start consent where a proportionate amount was kept
      // (a proportionate charge is only owed where the consumer expressly asked
      // us to begin during the withdrawal period, CRD Art. 14(3)/(4)).
      const proratedLine =
        input.immediatePerformanceRequested === true &&
        input.fullRefund === false &&
        (input.retainedMinor ?? 0) > 0
          ? `Because you asked us to start your subscription immediately, we kept a proportionate amount of ${formatAmount(input.retainedMinor ?? 0, currency)} for the time provided before your withdrawal, and refunded the rest.`
          : "";
      const refundLine =
        (input.refundMinor ?? 0) > 0
          ? `A refund of ${formatAmount(input.refundMinor ?? 0, currency)} is on its way to your original payment method.`
          : "";
      body = [
        "We have received your withdrawal from your Inklee Plus subscription.",
        effectiveLine,
        proratedLine,
        "Your subscription has ended and your plan has been updated. Your account and all of your data are kept.",
        refundLine,
        "This message is your acknowledgement of receipt on a durable medium.",
      ]
        .filter(Boolean)
        .join("\n\n");
    } else if (input.kind === "cancellation") {
      // Ordinary cancellation confirmation (§ 312k BGB): confirm receipt on a
      // durable medium, stating the receipt date/time AND the date the
      // termination takes effect. This is NOT the withdrawal (no refund): the
      // subscriber keeps Plus until the end of the paid period.
      const receivedLine = input.receivedAt
        ? `We received your cancellation on ${formatDateTime(input.receivedAt)}.`
        : "";
      const effectiveLine = input.effectiveAt
        ? `Your subscription will end on ${formatDate(input.effectiveAt)}, and you keep Plus until then.`
        : "Your subscription will end at the close of the current paid period, and you keep Plus until then.";
      body = [
        "We have received your cancellation of your Inklee Plus subscription.",
        receivedLine,
        effectiveLine,
        "Your account and all of your data are kept.",
        "This message is your confirmation of receipt on a durable medium.",
      ]
        .filter(Boolean)
        .join("\n\n");
    } else {
      // Purchase (contract) confirmation. Where the buyer opted into immediate
      // performance, restate that consent on this durable medium so a later
      // proportionate charge on withdrawal is enforceable (Art. 8(7)/14(4)(a)).
      const immediateLine =
        input.immediatePerformanceRequested === true
          ? "You asked us to start your subscription immediately, before the end of the 14-day withdrawal period. If you withdraw during that period, you pay a proportionate amount for the time already provided."
          : "";
      body = [
        "Your Inklee Plus subscription is confirmed.",
        immediateLine,
        "You can manage or cancel it any time from your plan settings.",
        "This message is your confirmation on a durable medium.",
      ]
        .filter(Boolean)
        .join("\n\n");
    }
    const subject =
      input.kind === "withdrawal"
        ? "Your Inklee Plus withdrawal is confirmed"
        : input.kind === "cancellation"
          ? "Your Inklee Plus cancellation is confirmed"
          : "Your Inklee Plus subscription is confirmed";
    generatedBody = `${subject}\n\n${body}`;

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
          payload_hash: confirmationPayloadHash(generatedBody),
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
        .update({
          delivery_status: "failed",
          // The content hash still records WHAT was generated when the
          // failure came after generation (send failures); null when the
          // failure preceded the body build.
          ...(generatedBody
            ? { payload_hash: confirmationPayloadHash(generatedBody) }
            : {}),
        })
        .eq("id", row.id);
    }
  }
}

/** SHA-256 of the generated confirmation content (subject + body), the 0106
 *  `payload_hash` column: tamper-evidence tying the stored row to the exact
 *  text the subscriber was sent. */
function confirmationPayloadHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export async function withdrawSubscriptionCore(input: {
  artistId: string;
}): Promise<WithdrawalResult> {
  const stripe = requireStripe();

  // 1. The artist's subscription (most recent, ANY status). A cancellation must
  //    never extinguish a still-valid withdrawal right, so we do NOT filter to
  //    active-only; a canceled-within-window subscription must still be found.
  const { data: subRow, error: subErr } = await serviceClient
    .from("billing_subscriptions")
    .select("id, stripe_subscription_id, status")
    .eq("artist_id", input.artistId)
    .order("last_reconciled_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (subErr)
    throw new Error(`withdrawal: subscription read failed: ${subErr.message}`);
  if (!subRow?.stripe_subscription_id) return { status: "no_subscription" };

  const billingSubscriptionId = subRow.id as string;
  const stripeSubId = subRow.stripe_subscription_id as string;

  // 2. Live Stripe truth. Expand latest_invoice.payments so the refundable charge
  //    is present on the pinned dahlia API (the charge/payment_intent live under
  //    invoice.payments there and are not returned by default).
  const sub = await stripe.subscriptions.retrieve(stripeSubId, {
    expand: ["latest_invoice.payments"],
  });
  const { periodStart, periodEnd, startDate } = readPeriod(sub);
  const invoice = readLatestInvoice(sub);
  const currency = invoice.currency ?? "eur";
  const stripeCustomerId = idOf(sub.customer);
  // The contract type snapshotted on the subscription at purchase (v1 is
  // consumer-first; default to consumer if the metadata is absent).
  const contractType =
    (sub.metadata?.contract_customer_type as string | undefined) ?? "consumer";

  // The immediate-performance request is read SCOPED to THIS subscription from
  // its metadata (stamped at checkout), never an unscoped latest-consent lookup:
  // a stale request from a prior/abandoned checkout must not prorate this one.
  const immediatePerformanceRequested =
    (sub.metadata?.immediate_performance ?? "") === "true";

  const now = new Date();
  const withdrawalPeriodStart = startDate ?? periodStart ?? now;
  const withdrawalDeadline = new Date(
    withdrawalPeriodStart.getTime() + WITHDRAWAL_WINDOW_DAYS * 86_400_000,
  );

  // 3. Resume an existing case, or open a new one only inside the 14-day window.
  //    A case that was validly opened in-window is resumed even after the
  //    deadline; only a brand-new withdrawal is gated on the window.
  let caseRow = (
    await serviceClient
      .from("withdrawal_cases")
      .select("id, state, received_at, refund_minor, stripe_refund_id")
      .eq("billing_subscription_id", billingSubscriptionId)
      .maybeSingle()
  ).data as CaseRow | null;

  if (caseRow?.state === "completed") {
    return {
      status: "completed",
      refundMinor: caseRow.refund_minor ?? 0,
      currency,
      caseId: caseRow.id,
    };
  }

  if (!caseRow) {
    if (now.getTime() > withdrawalDeadline.getTime()) {
      return {
        status: "not_available",
        reason:
          "The 14-day withdrawal period has ended. You can cancel instead.",
      };
    }
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
  // A concurrent request may have completed it between our read and now.
  if (caseRow.state === "completed") {
    return {
      status: "completed",
      refundMinor: caseRow.refund_minor ?? 0,
      currency,
      caseId,
    };
  }

  // 4. Proration at the FIXED receipt time. Unregistered posture => taxRate 0
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

  // 5. Acknowledge + durable ack exactly ONCE, on the first pass (state
  //    'received'). A resume must not re-send the acknowledgement email.
  if (caseRow.state === "received") {
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
    await recordDurableConfirmation({
      artistId: input.artistId,
      billingSubscriptionId,
      kind: "withdrawal",
      refundMinor: proration.refundGrossMinor,
      currency,
      immediatePerformanceRequested,
      effectiveAt: now.toISOString(),
      retainedMinor: proration.retainedGrossMinor,
      fullRefund: proration.fullRefund,
    });
  }

  // 6. PARTIAL refund on Inklee's own charge, then the immutable credit-note tax
  //    snapshot. Both are idempotent so a resume re-runs them safely: the refund
  //    is guarded by stripe_refund_id, the snapshot by its (kind, charge) unique
  //    index. The snapshot is BEST-EFFORT and never blocks the statutory
  //    withdrawal (it is a tax record; a failure is captured for backfill).
  if (proration.refundGrossMinor > 0) {
    const chargeId = await resolveChargeId(stripe, invoice);
    if (!chargeId) throw new Error("withdrawal: no charge to refund");

    if (!caseRow.stripe_refund_id) {
      const { params, idempotencyKey } = buildSubscriptionRefundParams({
        chargeId,
        amountMinor: proration.refundGrossMinor,
        billingSubscriptionId,
        reason: "consumer_withdrawal",
      });
      await serviceClient
        .from("withdrawal_cases")
        .update({
          state: "refund_pending",
          updated_at: new Date().toISOString(),
        })
        .eq("id", caseId);
      const refund = await stripe.refunds.create(params, { idempotencyKey });
      caseRow.stripe_refund_id = refund.id;
      await serviceClient
        .from("withdrawal_cases")
        .update({
          stripe_refund_id: refund.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", caseId);
    }

    const snapshotId = await writeWithdrawalCreditNote({
      artistId: input.artistId,
      billingSubscriptionId,
      stripeCustomerId,
      stripeSubscriptionId: stripeSubId,
      stripeInvoiceId: invoice.invoiceId,
      stripePaymentIntentId: invoice.paymentIntent,
      stripeChargeId: chargeId,
      refundNetMinor: proration.refundNetMinor,
      refundVatMinor: proration.refundVatMinor,
      refundGrossMinor: proration.refundGrossMinor,
      taxRate: proration.taxRate,
      currency,
      contractCustomerType: contractType,
    });
    if (snapshotId) {
      await serviceClient
        .from("withdrawal_cases")
        .update({
          tax_correction_snapshot_id: snapshotId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", caseId);
    }
  }

  // 7. End the subscription + downgrade via the shared reconcile (grandfather
  //    restore aware). Cancel only if not already canceled; ALWAYS reconcile so
  //    the downgrade lands even on a resume where the sub is already canceled.
  if (sub.status !== "canceled") {
    const canceled = await stripe.subscriptions.cancel(stripeSubId, undefined, {
      idempotencyKey: subscriptionIdempotencyKey("cancel", stripeSubId),
    });
    await reconcileFromStripeSubscription(canceled);
  } else {
    await reconcileFromStripeSubscription(sub);
  }

  // 8. Record the withdrawal acknowledgement consent (once) + complete the case.
  const done = new Date().toISOString();
  const { data: existingAck } = await serviceClient
    .from("billing_consent_records")
    .select("id")
    .eq("artist_id", input.artistId)
    .eq("consent_type", "withdrawal_ack")
    .eq("consent_version", `${WITHDRAWAL_ACK_VERSION}:${caseId}`)
    .maybeSingle();
  if (!existingAck) {
    await serviceClient.from("billing_consent_records").insert({
      artist_id: input.artistId,
      consent_type: "withdrawal_ack",
      // Suffix the case id so a resume is idempotent without a jsonb query.
      consent_version: `${WITHDRAWAL_ACK_VERSION}:${caseId}`,
      consented_at: done,
      context: { withdrawal_case_id: caseId },
    });
  }
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

/** The concrete 14-day withdrawal window for display (Art. 11a step 2: show the
 *  deadline). Computes the SAME deadline withdrawSubscriptionCore enforces (from
 *  the Stripe subscription's start), so the date shown equals the date applied.
 *  Fail-safe: any read error resolves to no concrete date (the generic 14-day
 *  copy still renders) and never breaks the plan page or the withdrawal function. */
export async function getWithdrawalWindow(artistId: string): Promise<{
  hasSubscription: boolean;
  deadline: string | null;
  withinWindow: boolean;
}> {
  try {
    const { data: subRow } = await serviceClient
      .from("billing_subscriptions")
      .select("stripe_subscription_id")
      .eq("artist_id", artistId)
      .order("last_reconciled_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!subRow?.stripe_subscription_id) {
      return { hasSubscription: false, deadline: null, withinWindow: false };
    }
    const sub = await requireStripe().subscriptions.retrieve(
      subRow.stripe_subscription_id as string,
    );
    const { periodStart, startDate } = readPeriod(sub);
    const start = startDate ?? periodStart;
    if (!start) {
      return { hasSubscription: true, deadline: null, withinWindow: false };
    }
    const deadline = new Date(
      start.getTime() + WITHDRAWAL_WINDOW_DAYS * 86_400_000,
    );
    return {
      hasSubscription: true,
      deadline: deadline.toISOString(),
      withinWindow: Date.now() <= deadline.getTime(),
    };
  } catch (e) {
    Sentry.captureException(e, {
      tags: { action: "billing_withdrawal_window" },
      extra: { artistId },
    });
    return { hasSubscription: true, deadline: null, withinWindow: true };
  }
}
