import "server-only";
import type Stripe from "stripe";
import * as Sentry from "@sentry/nextjs";
import { serviceClient } from "@/lib/supabase/service";
import { stripe } from "@/lib/stripe";
import { getConnectRoutingForArtist } from "@/lib/stripe-connect";
import { writeAudit } from "@/lib/audit";
import {
  feeRefundOutcome,
  ACTIVE_FEE_REFUND_POLICY_VERSION,
  type FeeRefundCase,
} from "@inklee/shared/fee-refund-policy";
import { decideFeeTreatment } from "./refund-fee-treatment";
import {
  claimRefundSlot,
  markRefundSucceeded,
  markRefundFailed,
  writeRefundLines,
  sumSucceededRefundedMinor,
  sumRefundedQuantityForOrderItem,
  type RefundLineWrite,
} from "./refund-ledger";
import {
  restockInventory,
  expandInventoryMovements,
  type InventoryOrderItem,
} from "@/lib/order-fulfillment";
import { sendEmail } from "@/lib/email/send";
import { buildEmailHtml } from "@/lib/email/booking-templates";

// ARTIST-INITIATED GOODS ORDER REFUND (FD12). The by-line/quantity/custom-amount
// engine `goods-refund.ts` never had: that file is the WEBHOOK convergence
// backstop for a refund issued outside this API (e.g. the Stripe dashboard),
// and it stays exactly as documented (full refund converges fully; a partial
// amount it did not choose is visibility-only, because it cannot know which
// lines an out-of-band amount covers). THIS engine is the opposite case: WE
// choose the amount and the lines, so there is no attribution ambiguity to
// resolve — the entangled-PI honesty concern in goods-refund.ts is about
// interpreting an INCOMING number after the fact, not about issuing our own.
//
// DOUBLE-PROCESSING SAFETY. This engine performs the restock, discount
// cap-release and status flip itself, synchronously with the Stripe call,
// rather than waiting for `charge.refunded`. The webhook path
// (`settleGoodsOrderRefund`) still fires afterward for every Stripe refund
// regardless of origin; it is naturally a no-op here because it re-reads the
// order's status with its own `.in(['paid','partially_refunded'])` gate, and
// this engine has already moved the status past that set by the time the
// webhook's query runs (in-process, so it always commits first). Documented
// residual: a webhook that somehow raced ahead of this function's own commit
// would see the pre-refund state and apply its coarser (visibility-only)
// partial handling; narrow, and consistent with this codebase's practice of
// naming residuals rather than closing every last one.
//
// PROCESSOR COST. Populated on `orders` ONLY at STANDALONE settlement (0139's
// header). An add-on order's shared-PI cost is not attributable to goods
// alone, so those columns read null here and `feeRefundOutcome` fails safe
// (returns the full fee, retains nothing) — the same posture an appointment
// collection settled before 0131 gets.

export type GoodsRefundLineInput = { orderItemId: string; quantity?: number };

export type GoodsRefundInput = {
  artistId: string;
  orderId: string;
  refundType: "full" | "partial" | "by_line";
  amountMinor?: number;
  lines?: GoodsRefundLineInput[];
  case: FeeRefundCase;
};

export type GoodsRefundResult =
  | {
      status: "ok";
      refundId: string;
      refundedMinor: number;
      remainingRefundableMinor: number;
    }
  | { status: "error"; message: string };

/** Statuses an artist can initiate a goods refund from. Unlike appointment
 *  payments, an order never holds collected money in a cancelled/expired
 *  state (those are pre-payment states), so this is the narrower set. */
export const REFUNDABLE_ORDER_STATUSES = [
  "paid",
  "partially_refunded",
] as const;

type OrderItemRow = {
  id: string;
  product_id: string | null;
  variant_id: string | null;
  bundle_id: string | null;
  type: string;
  title_snapshot: string;
  variant_snapshot: string | null;
  quantity: number;
  unit_amount: number | string;
  total_amount: number | string;
};

function toMinor(major: number | string | null | undefined): number {
  const n = Number(major ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export async function refundGoodsOrderCore(
  input: GoodsRefundInput,
): Promise<GoodsRefundResult> {
  if (!stripe) return { status: "error", message: "Stripe is not configured." };

  const { data: order, error: orderErr } = await serviceClient
    .from("orders")
    .select(
      "id, artist_id, status, currency, stripe_payment_intent_id, discount_code_id, goods_fee_amount, processor_cost_minor, processor_cost_status, processor_cost_retained_minor, fee_refund_policy_version, client_email, booking_id",
    )
    .eq("id", input.orderId)
    .eq("artist_id", input.artistId)
    .maybeSingle();

  if (orderErr || !order) {
    return { status: "error", message: "Order not found." };
  }
  if (
    !REFUNDABLE_ORDER_STATUSES.includes(
      order.status as (typeof REFUNDABLE_ORDER_STATUSES)[number],
    )
  ) {
    return {
      status: "error",
      message: `Cannot refund an order in status "${order.status}".`,
    };
  }
  if (!order.stripe_payment_intent_id) {
    return { status: "error", message: "No payment intent on this order." };
  }

  // Goods-only lines. A 'deposit' type row on the same order (an add-on
  // order's booking-deposit portion) is a DIFFERENT money lane, refunded
  // through refundDepositCore, never through here.
  const { data: itemRows, error: itemsErr } = await serviceClient
    .from("order_items")
    .select(
      "id, product_id, variant_id, bundle_id, type, title_snapshot, variant_snapshot, quantity, unit_amount, total_amount",
    )
    .eq("order_id", order.id)
    .in("type", ["product", "bundle"]);
  if (itemsErr || !itemRows || itemRows.length === 0) {
    return { status: "error", message: "No refundable lines on this order." };
  }
  const items = itemRows as OrderItemRow[];

  const itemsTotalMinor = items.reduce(
    (s, i) => s + toMinor(i.total_amount),
    0,
  );
  const alreadyRefundedMinor = await sumSucceededRefundedMinor(
    "goods_order",
    order.id,
  );
  const maxRefundable = Math.max(0, itemsTotalMinor - alreadyRefundedMinor);

  type LinePlan = {
    item: OrderItemRow;
    quantityRefunded: number;
    amountMinor: number;
  };

  let refundMinor = 0;
  const plan: LinePlan[] = [];
  let bareAmountOnly = false;

  if (input.refundType === "full") {
    for (const item of items) {
      const alreadyQty = await sumRefundedQuantityForOrderItem(item.id);
      const remainingQty = Math.max(0, Number(item.quantity) - alreadyQty);
      if (remainingQty <= 0) continue;
      const unitMinor = toMinor(item.unit_amount);
      plan.push({
        item,
        quantityRefunded: remainingQty,
        amountMinor: unitMinor * remainingQty,
      });
    }
    refundMinor = plan.reduce((s, p) => s + p.amountMinor, 0);
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
    bareAmountOnly = true;
  } else {
    // by_line: quantity-based, per selected order item.
    if (!input.lines || input.lines.length === 0) {
      return {
        status: "error",
        message: "Line refund requires at least one line.",
      };
    }
    for (const sel of input.lines) {
      const item = items.find((i) => i.id === sel.orderItemId);
      if (!item) continue;
      const alreadyQty = await sumRefundedQuantityForOrderItem(item.id);
      const remainingQty = Math.max(0, Number(item.quantity) - alreadyQty);
      if (remainingQty <= 0) continue;
      const requestedQty = sel.quantity ?? remainingQty;
      if (!(requestedQty > 0)) continue;
      const qty = Math.min(requestedQty, remainingQty);
      const unitMinor = toMinor(item.unit_amount);
      plan.push({ item, quantityRefunded: qty, amountMinor: unitMinor * qty });
    }
    if (plan.length === 0) {
      return {
        status: "error",
        message: "No matching refundable quantity for the specified lines.",
      };
    }
    refundMinor = plan.reduce((s, p) => s + p.amountMinor, 0);
  }

  // Cross-check the two independent ledgers for `full` and `by_line`: both are
  // derived from PER-ITEM remaining quantity, but `maxRefundable` is derived
  // from the ORDER-LEVEL succeeded-refund total, which also reflects any prior
  // bare custom-amount (`partial`) refund that never touched per-item
  // tracking at all. A per-item sum that exceeds the order-level remaining
  // balance means the two have diverged (exactly that case, or a bug) — refuse
  // rather than silently clamp, which would either over-refund or restock more
  // than was actually returned to the customer. `partial` already checked its
  // own amount against `maxRefundable` above and is exempt from this second
  // check by construction (bareAmountOnly never touches `plan`).
  if (!bareAmountOnly && refundMinor > maxRefundable) {
    return {
      status: "error",
      message: "Refund amount exceeds the refundable balance.",
    };
  }

  if (refundMinor <= 0) {
    return { status: "error", message: "Nothing to refund." };
  }

  // Fee facts, read from stored transaction state (never client input).
  const intent = await stripe.paymentIntents.retrieve(
    order.stripe_payment_intent_id,
    { expand: ["latest_charge"] },
  );
  // OWNERSHIP ASSERTION (audit 2026-08-02, cross-tenant refund). Everything
  // above this line authorises the ORDER ROW, and `orders` carries a FOR ALL
  // policy with `with check (artist_id = auth.uid())`, so an artist can INSERT
  // a row of their own naming SOMEONE ELSE'S PaymentIntent (the pi id reaches
  // a paying customer's browser as part of the client secret, and
  // orders_stripe_pi_idx is not unique). Refunding on the strength of a
  // self-written row would move another artist's money and claw back Inklee's
  // fee. The intent itself is the only trustworthy witness of who was paid:
  // for a destination charge that is transfer_data.destination, and our own
  // metadata records the order it was created for.
  const connectAccountId = (await getConnectRoutingForArtist(input.artistId))
    .stripeAccountId;
  const intentDestination =
    typeof intent.transfer_data?.destination === "string"
      ? intent.transfer_data.destination
      : (intent.transfer_data?.destination?.id ?? null);
  const intentOrderId = intent.metadata?.order_id ?? null;
  const ownsIntent =
    (intentOrderId !== null && intentOrderId === order.id) ||
    (intentDestination !== null &&
      connectAccountId !== null &&
      intentDestination === connectAccountId);
  if (!ownsIntent) {
    Sentry.captureMessage("goods refund refused: intent not owned by artist", {
      level: "error",
      tags: { action: "goods_refund_ownership" },
      extra: {
        orderId: order.id,
        artistId: input.artistId,
        intentId: order.stripe_payment_intent_id,
      },
    });
    return {
      status: "error",
      message: "This order can't be refunded here.",
    };
  }

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

  const feeChargedMinor = toMinor(order.goods_fee_amount);
  const costCaptured =
    order.processor_cost_status === "captured" &&
    order.processor_cost_minor != null;
  const nonRecoverableCostMinor = costCaptured
    ? (order.processor_cost_minor as number)
    : null;
  const alreadyRetainedMinor = order.processor_cost_retained_minor ?? 0;
  const policyVersion =
    order.fee_refund_policy_version ?? ACTIVE_FEE_REFUND_POLICY_VERSION;

  const feeOutcome = feeRefundOutcome({
    case: input.case,
    feeChargedMinor,
    paymentMinor: itemsTotalMinor,
    refundedMinor: refundMinor,
    version: policyVersion,
    nonRecoverableCostMinor,
    alreadyRetainedMinor,
  });
  const decision = decideFeeTreatment(feeOutcome, applicationFeeId);

  // Idempotency key includes a fingerprint of the LINE SELECTION, not just the
  // amount: two different line selections at the same baseline can sum to the
  // same amount, and must not be treated as the same logical refund.
  const lineFingerprint = bareAmountOnly
    ? "amount"
    : plan
        .map((p) => `${p.item.id}:${p.quantityRefunded}`)
        .sort()
        .join("_");
  const idempotencyKey = `refund-ord-${input.orderId}-${refundMinor}-${alreadyRefundedMinor}-${lineFingerprint}`;

  const claim = await claimRefundSlot({
    domain: "goods_order",
    artistId: input.artistId,
    orderId: order.id,
    currency: (order.currency as string) ?? "eur",
    refundType:
      input.refundType === "partial" ? "partial_amount" : input.refundType,
    feeRefundCase: input.case,
    amountMinor: refundMinor,
    idempotencyKey,
    initiatedBy: input.artistId,
  });
  if (!claim.claimed) {
    if (claim.existing?.status === "succeeded") {
      return {
        status: "error",
        message: "This refund has already been processed.",
      };
    }
    return {
      status: "error",
      message:
        "A matching refund is already in progress or needs review. Refresh and try again.",
    };
  }

  let refund: Stripe.Refund;
  try {
    refund = await stripe.refunds.create(
      {
        payment_intent: order.stripe_payment_intent_id,
        amount: refundMinor,
        reverse_transfer: true,
        refund_application_fee: decision.refundApplicationFee,
        metadata: {
          order_id: input.orderId,
          refund_case: input.case,
          refund_ledger_id: claim.id,
          fee_refund_policy: feeOutcome.policyVersion,
        },
      },
      { idempotencyKey },
    );
  } catch (stripeErr) {
    const message =
      stripeErr instanceof Error ? stripeErr.message : "Refund failed.";
    await markRefundFailed(claim.id, message);
    Sentry.captureException(stripeErr, {
      tags: { action: "goods_order_refund" },
      extra: { orderId: input.orderId, refundMinor },
    });
    return { status: "error", message: "Refund could not be processed." };
  }

  if (decision.partialFeeRefundMinor > 0 && applicationFeeId) {
    try {
      await stripe.applicationFees.createRefund(
        applicationFeeId,
        { amount: decision.partialFeeRefundMinor },
        {
          idempotencyKey: `refund-ord-fee-${input.orderId}-${refundMinor}-${alreadyRefundedMinor}-${lineFingerprint}`,
        },
      );
    } catch (feeErr) {
      Sentry.captureException(feeErr, {
        tags: { action: "goods_order_fee_refund" },
        extra: { orderId: input.orderId },
      });
    }
  }

  if (decision.retainedAppliedMinor > 0) {
    const { error: retErr } = await serviceClient
      .from("orders")
      .update({
        processor_cost_retained_minor:
          alreadyRetainedMinor + decision.retainedAppliedMinor,
      })
      .eq("id", order.id);
    if (retErr) {
      Sentry.captureException(retErr, {
        tags: { action: "goods_order_record_retained_cost" },
        extra: { orderId: input.orderId },
      });
    }
  }

  await markRefundSucceeded(claim.id, {
    stripeRefundId: refund.id,
    applicationFeeReturnMinor: feeOutcome.returnMinor,
    applicationFeeRetainMinor: feeOutcome.retainMinor,
    processorCostRetainedMinor: decision.retainedAppliedMinor,
    feeRefundPolicyVersion: feeOutcome.policyVersion,
  });

  // Restock: only the lines/quantities we actually refunded, via the ONE
  // classifier (expandInventoryMovements) so bundle components restock from
  // their sale-time snapshot exactly like the webhook path does.
  const restockCandidates: InventoryOrderItem[] = plan.map((p) => ({
    id: p.item.id,
    product_id: p.item.product_id,
    variant_id: p.item.variant_id,
    bundle_id: p.item.bundle_id,
    type: p.item.type,
    title_snapshot: p.item.title_snapshot,
    variant_snapshot: p.item.variant_snapshot,
    quantity: p.quantityRefunded,
    total_amount: 0,
  }));
  if (restockCandidates.length > 0) {
    try {
      const movements = await expandInventoryMovements(restockCandidates);
      if (movements.length > 0) await restockInventory(movements);
    } catch (err) {
      Sentry.captureException(err, {
        tags: { action: "goods_order_refund_restock" },
        extra: { orderId: input.orderId },
      });
    }
  }

  const refundLines: RefundLineWrite[] = bareAmountOnly
    ? [
        {
          orderItemId: null,
          nameSnapshot: "Custom amount",
          quantityRefunded: null,
          amountMinor: refundMinor,
          restocked: false,
        },
      ]
    : plan.map((p) => ({
        orderItemId: p.item.id,
        nameSnapshot: p.item.variant_snapshot
          ? `${p.item.title_snapshot} · ${p.item.variant_snapshot}`
          : p.item.title_snapshot,
        quantityRefunded: p.quantityRefunded,
        amountMinor: p.amountMinor,
        restocked: true,
      }));
  await writeRefundLines({
    refundId: claim.id,
    artistId: input.artistId,
    orderId: order.id,
    lines: refundLines,
  });

  // Converge order status + discount cap-release. Fully refunded means the
  // sale is genuinely, entirely unwound (by amount): only THEN does the
  // discount cap release, whether reached in one call or across several
  // partial/by-line refunds over time.
  const newAlreadyRefundedMinor = alreadyRefundedMinor + refundMinor;
  const fullyRefunded = newAlreadyRefundedMinor >= itemsTotalMinor;

  if (fullyRefunded) {
    const { data: flipped } = await serviceClient
      .from("orders")
      .update({ status: "refunded", updated_at: new Date().toISOString() })
      .eq("id", order.id)
      .in("status", ["paid", "partially_refunded"])
      .select("id");
    if (flipped && flipped.length > 0 && order.discount_code_id) {
      const { error: releaseErr } = await serviceClient
        .from("discount_redemptions")
        .delete()
        .eq("order_id", order.id);
      if (releaseErr) {
        Sentry.captureException(releaseErr, {
          tags: { action: "goods_order_refund_redemption_release" },
          extra: { orderId: order.id },
        });
      }
    }
  } else {
    await serviceClient
      .from("orders")
      .update({
        status: "partially_refunded",
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id)
      .eq("status", "paid");
  }

  void writeAudit({
    action: "goods_order_refund_initiated",
    actor: input.artistId,
    category: "booking",
    details: {
      order_id: input.orderId,
      payment_intent_id: order.stripe_payment_intent_id,
      refund_id: refund.id,
      refund_type: input.refundType,
      refund_case: input.case,
      amount_minor: refundMinor,
      fee_treatment: feeOutcome.treatment,
      fee_return_minor: feeOutcome.returnMinor,
      fee_retain_minor: feeOutcome.retainMinor,
      fully_refunded: fullyRefunded,
      lines_restocked: bareAmountOnly ? 0 : plan.length,
      currency: (order.currency as string) ?? "eur",
    },
  });

  await sendGoodsRefundConfirmationEmail({
    artistId: input.artistId,
    orderId: order.id,
    clientEmail: (order.client_email as string | null) ?? null,
    bookingId: (order.booking_id as string | null) ?? null,
    refundedMinor: refundMinor,
    remainingRefundableMinor: Math.max(
      0,
      itemsTotalMinor - newAlreadyRefundedMinor,
    ),
    currency: (order.currency as string) ?? "eur",
  });

  return {
    status: "ok",
    refundId: refund.id,
    refundedMinor: refundMinor,
    remainingRefundableMinor: Math.max(
      0,
      itemsTotalMinor - newAlreadyRefundedMinor,
    ),
  };
}

function formatMinorAmount(minor: number, currency: string): string {
  return `${(minor / 100).toFixed(2)} ${currency.toUpperCase()}`;
}

/** Buyer confirmation (FD12), mirroring the appointment lane's
 *  `sendRefundConfirmationEmail`. `orders.client_email` covers a standalone
 *  order directly; an add-on order (booking-attached) may carry it null, in
 *  which case the booking's own client email is the fallback (same buyer,
 *  same as the deposit/receipt paths already resolve it). Best-effort: the
 *  money has already moved by the time this runs. */
async function sendGoodsRefundConfirmationEmail(args: {
  artistId: string;
  orderId: string;
  clientEmail: string | null;
  bookingId: string | null;
  refundedMinor: number;
  remainingRefundableMinor: number;
  currency: string;
}): Promise<void> {
  try {
    let clientEmail = args.clientEmail;
    if ((!clientEmail || !clientEmail.includes("@")) && args.bookingId) {
      const { data } = await serviceClient
        .from("booking_requests")
        .select("customer_email")
        .eq("artist_id", args.artistId)
        .eq("id", args.bookingId)
        .maybeSingle();
      clientEmail = (data?.customer_email as string | null) ?? null;
    }
    if (!clientEmail || !clientEmail.includes("@")) return;

    const { data: profile } = await serviceClient
      .from("profiles")
      .select("display_name")
      .eq("id", args.artistId)
      .maybeSingle();
    const artistName = (profile?.display_name as string | null) || "the artist";

    const amount = formatMinorAmount(args.refundedMinor, args.currency);
    const remaining =
      args.remainingRefundableMinor > 0
        ? `\n\n${formatMinorAmount(args.remainingRefundableMinor, args.currency)} of your original order remains, unaffected by this refund.`
        : "";

    const body = `Hi,

${artistName} has refunded ${amount} to your original payment method.

Refunds typically appear on your statement within 5 to 10 business days, depending on your bank.${remaining}

If anything looks wrong, contact ${artistName} directly.`;

    await sendEmail({
      to: clientEmail,
      subject: `Refund from ${artistName}`,
      html: buildEmailHtml(body, {}, undefined, {
        footerNote: `Sent by Inklee on behalf of ${artistName}.`,
      }),
    });
  } catch (err) {
    Sentry.captureException(err, {
      tags: { action: "goods_order_refund_confirmation_email" },
      extra: { orderId: args.orderId },
    });
  }
}
