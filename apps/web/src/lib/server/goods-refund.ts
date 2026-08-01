import "server-only";
import type Stripe from "stripe";
import * as Sentry from "@sentry/nextjs";
import { serviceClient } from "@/lib/supabase/service";
import { writeAudit } from "@/lib/audit";
import { restockInventory, type PaidOrderItem } from "@/lib/order-fulfillment";

// GOODS ORDER REFUND SETTLEMENT (GC1 slice C1; closes the recon's goods refund
// hole). Until now `charge.refunded` never touched `orders`: the enum had
// `refunded`/`partially_refunded` since 0036 and NOTHING ever wrote them, no
// restock existed, and a redeemed discount stayed counted against its cap after
// the sale was unwound.
//
// ENTANGLED-PI HONESTY. Under the add-on model a deposit and goods share ONE
// PaymentIntent, so a PARTIAL `amount_refunded` cannot be attributed per lane
// (was it the deposit or the goods that came back?). The rules below only claim
// what the event actually proves:
//
//   charge fully refunded  -> the order's money is definitively gone: converge
//                             to `refunded`, restock, release the discount
//                             redemption. All once-only via the flip gate.
//   partial refund         -> SOMETHING came back: converge `paid` ->
//                             `partially_refunded` as a visibility state. No
//                             restock and no redemption release, because the
//                             goods may be entirely unaffected.
//
// A future STANDALONE order (its own PI) flows through the same function and
// gets strictly cleaner semantics for free, because there the PI == the order.
//
// Never throws: the webhook must not 500 (and re-deliver forever) over the
// goods leg of an entangled refund. Failures go to Sentry.

/**
 * The `amount` a DEPOSIT refund should pass to Stripe, given the order sharing
 * the intent. Pure, so the money decision is testable on its own:
 *
 *   no order / no goods on the order -> undefined (refund the whole intent,
 *     today's behaviour, correct when the PI is deposit-only);
 *   goods on the order -> the order's OWN frozen deposit portion in minor
 *     units, so refunding a deposit never silently drags the goods money back
 *     with it while the order row stays `paid` and stock stays decremented
 *     (the recon's refundDepositCore over-refund finding).
 */
export function resolveDepositRefundAmountMinor(
  order: { deposit_amount: unknown; goods_amount: unknown } | null,
): number | undefined {
  if (!order) return undefined;
  const goods = Number(order.goods_amount ?? 0);
  if (!Number.isFinite(goods) || goods <= 0) return undefined;
  const deposit = Number(order.deposit_amount ?? 0);
  if (!Number.isFinite(deposit) || deposit <= 0) return undefined;
  return Math.round(deposit * 100);
}

export type GoodsRefundOutcome = "refunded" | "partially_refunded" | "none";

/** Converge the order on a refunded charge. Call from `charge.refunded` and
 *  FALL THROUGH afterwards: on an entangled PI the booking side still needs its
 *  own records. */
export async function settleGoodsOrderRefund(
  charge: Stripe.Charge,
): Promise<GoodsRefundOutcome> {
  try {
    const intentId =
      typeof charge.payment_intent === "string"
        ? charge.payment_intent
        : (charge.payment_intent?.id ?? null);
    if (!intentId) return "none";
    if ((charge.amount_refunded ?? 0) === 0) return "none";

    const { data: order } = await serviceClient
      .from("orders")
      .select("id, artist_id, status, discount_code_id")
      .eq("stripe_payment_intent_id", intentId)
      .in("status", ["paid", "partially_refunded"])
      .maybeSingle();
    if (!order) return "none";

    if (charge.refunded) {
      // Full refund: the once-only flip gate (same shape as the paid flip).
      const { data: flipped } = await serviceClient
        .from("orders")
        .update({ status: "refunded", updated_at: new Date().toISOString() })
        .eq("id", order.id)
        .in("status", ["paid", "partially_refunded"])
        .select("id");
      if (!flipped || flipped.length === 0) return "refunded";

      // Restock the product lines (restockInventory skips unlimited stock and
      // clears the low-stock flag; not internally idempotent, which is why it
      // sits INSIDE the flip gate).
      const { data: itemRows } = await serviceClient
        .from("order_items")
        .select(
          "product_id, variant_id, quantity, type, title_snapshot, variant_snapshot, total_amount",
        )
        .eq("order_id", order.id)
        .eq("type", "product");
      const items = (itemRows ?? []) as PaidOrderItem[];
      if (items.length > 0) await restockInventory(items);

      // Release the discount redemption: the cap counts REAL net sales, and a
      // fully unwound sale is not one. Deleting the row frees the cap (the
      // unique (code, order) constraint makes a later re-record impossible for
      // this order anyway, since the order can never return to paid).
      if (order.discount_code_id) {
        await serviceClient
          .from("discount_redemptions")
          .delete()
          .eq("order_id", order.id);
      }

      void writeAudit({
        action: "goods_order_refunded",
        actor: "system",
        category: "booking",
        details: {
          order_id: order.id,
          payment_intent_id: intentId,
          amount_refunded: charge.amount_refunded,
          restocked_lines: items.length,
          redemption_released: Boolean(order.discount_code_id),
          via: "stripe_webhook",
        },
      });
      return "refunded";
    }

    // Partial: visibility only (see the entangled-PI note above).
    await serviceClient
      .from("orders")
      .update({
        status: "partially_refunded",
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id)
      .eq("status", "paid");
    return "partially_refunded";
  } catch (err) {
    Sentry.captureException(err, {
      tags: { action: "goods_order_refund_settle" },
    });
    return "none";
  }
}
