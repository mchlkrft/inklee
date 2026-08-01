import "server-only";
import crypto from "crypto";
import type Stripe from "stripe";
import * as Sentry from "@sentry/nextjs";
import { serviceClient } from "@/lib/supabase/service";
import { stripe } from "@/lib/stripe";
import { writeAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/email/send";
import { buildEmailHtml } from "@/lib/email/booking-templates";
import { isGoodsCommerceEnabled } from "@/lib/features";
import { getConnectRoutingForArtist } from "@/lib/stripe-connect";
import { getAccountOverrides } from "@/lib/entitlements-server";
import { appointmentFeeTier } from "@/lib/server/order-fee-sync";
import { resolveDiscount } from "@/lib/server/discounts";
import { recordDiscountRedemption } from "@/lib/server/discounts";
import { createNotification } from "@/lib/notifications";
import {
  computeAddonLines,
  type AddonProduct,
  type AddonSelection,
} from "@/lib/orders";
import {
  computeOrderFees,
  goodsBaseMinorFromLines,
} from "@inklee/shared/order-fees";
import {
  decrementInventory,
  type PaidOrderItem,
} from "@/lib/order-fulfillment";

// STANDALONE GOODS CHECKOUT (GC1 slice C2).
//
// The first payable goods path that does NOT ride a booking's deposit
// PaymentIntent: a guest buyer (identified by email only, per 0134's
// buyer-identity check) pays for products on the artist's OWN PaymentIntent.
// Everything stays dark behind GOODS_COMMERCE_ENABLED, exactly like the add-on
// path.
//
// REUSE, NOT REBUILD. Line composition, stock/variant/drop validation and the
// fee engine are the SAME modules the add-on checkout uses (`computeAddonLines`,
// `computeOrderFees`): the client never supplies a price, quantity caps and
// drop gates run immediately before money moves, and the fee base is the
// discounted goods subtotal. The one catalog difference (GC4): the standalone
// shop sells every ACTIVE product, not only `is_checkout_addon` ones — that
// flag scopes the appointment add-on list, not the shop. Rows are mapped into
// the compositor's shape with isCheckoutAddon forced true, so the compositor's
// remaining gates (status, stock, variants, drops) still all apply.
//
// MONEY SHAPE mirrors the deposit path: destination charge to the artist's
// Connect account, `on_behalf_of` keeps the artist merchant of record,
// `application_fee_amount` from the versioned fee schedule (v1 goods = 0%, so
// no live number moves until the gated v2 flip).

const MIN_CHARGE_MINOR = 50; // Stripe's ~0.50 EUR floor; refuse below it.

export type StandaloneCheckoutResult =
  | {
      ok: true;
      orderId: string;
      clientSecret: string;
      totalMinor: number;
      currency: string;
    }
  | { ok: false; error: string };

type CatalogRow = {
  id: string;
  title: string;
  price_amount: number;
  currency: string;
  status: string;
  quantity: number | null;
  available_from: string | null;
  preorder: boolean | null;
  product_variants: {
    id: string;
    name: string;
    price_amount_override: number | null;
    stock_quantity: number | null;
    status: string;
    sort_order: number;
  }[];
};

function toAddonProducts(rows: CatalogRow[]): AddonProduct[] {
  return rows.map((p) => ({
    id: p.id,
    title: p.title,
    price: Number(p.price_amount),
    currency: p.currency,
    status: p.status as AddonProduct["status"],
    // GC4: sellability in the standalone shop is "active product", not the
    // add-on flag; forced true so the compositor's other gates still run.
    isCheckoutAddon: true,
    quantity: p.quantity,
    availableFrom: p.available_from,
    preorder: p.preorder === true,
    variants: (p.product_variants ?? [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((v) => ({
        id: v.id,
        name: v.name,
        priceOverride:
          v.price_amount_override === null
            ? null
            : Number(v.price_amount_override),
        stock: v.stock_quantity,
        status: v.status as AddonProduct["variants"][number]["status"],
      })),
  }));
}

/**
 * Create a standalone goods order + its PaymentIntent. Server-authoritative
 * end to end: catalog, prices, stock, discount and fee are all resolved here;
 * the client contributes selections, an email, and (optionally) a code.
 */
export async function createStandaloneGoodsCheckoutCore(input: {
  artistId: string;
  clientEmail: string;
  selections: AddonSelection[];
  discountCode?: string;
}): Promise<StandaloneCheckoutResult> {
  // Master park switch: fail closed, same as the add-on path.
  if (!isGoodsCommerceEnabled()) {
    return { ok: false, error: "The shop isn't taking card orders yet." };
  }
  if (!stripe) {
    return { ok: false, error: "Card payments aren't available right now." };
  }

  const email = input.clientEmail.trim();
  if (!email || !email.includes("@") || email.length > 320) {
    return { ok: false, error: "Enter a valid email address." };
  }

  // The artist must be charge-ready: a shop that takes an order it cannot be
  // paid for puts the failure on the buyer (wrong party; same rule as the
  // payment-request send gate).
  const routing = await getConnectRoutingForArtist(input.artistId);
  if (!routing.routeCharges || !routing.stripeAccountId) {
    return { ok: false, error: "This shop can't take card orders yet." };
  }

  // Catalog: every ACTIVE, PUBLICLY VISIBLE product of this artist (GC4).
  // is_public_visible is the artist's own hide-from-my-public-page switch, and
  // this read FEEDS THE MONEY PATH via serviceClient (RLS never applies), so
  // omitting it sold hidden products to anonymous buyers (SHOP-VIS-001) — a
  // crafted selections payload would have reached them even with the page
  // fixed, which is why the filter lives HERE, not only in the page read.
  const { data: rows } = await serviceClient
    .from("products")
    .select(
      "id, title, price_amount, currency, status, quantity, available_from, preorder, product_variants(id, name, price_amount_override, stock_quantity, status, sort_order)",
    )
    .eq("artist_id", input.artistId)
    .eq("status", "active")
    .eq("is_public_visible", true);
  const catalog = toAddonProducts((rows ?? []) as CatalogRow[]);

  const computed = computeAddonLines(catalog, input.selections);
  if (!computed.ok) return { ok: false, error: computed.error };
  if (computed.lines.length === 0) {
    return { ok: false, error: "Pick something to buy first." };
  }

  // Discount (optional). resolveDiscount is apply-time gated on the artist's
  // entitlement and returns a client-facing rejection message when the code
  // does not take money off.
  const goodsGrossMinor = Math.round(computed.goodsAmount * 100);
  const discount = await resolveDiscount({
    artistId: input.artistId,
    rawCode: input.discountCode ?? null,
    subtotalMinor: goodsGrossMinor,
    currency: "eur",
  });
  if (discount.error) return { ok: false, error: discount.error };

  // Fee on the DISCOUNTED goods base (spec: subtotal after discounts, ex VAT
  // and shipping — neither exists yet). Tier resolution is fail-loud: a plan
  // read failure refuses rather than guessing (money rule).
  let fee;
  try {
    const tier = appointmentFeeTier(await getAccountOverrides(input.artistId));
    const goodsBaseMinor = goodsBaseMinorFromLines(
      computed.lines.map((l) => ({
        type: "product",
        totalMinor: Math.round(l.totalAmount * 100),
      })),
      { discountsMinor: discount.discountMinor },
    );
    fee = computeOrderFees({
      appointmentBaseMinor: 0,
      goodsBaseMinor,
      tier,
    });
  } catch {
    return { ok: false, error: "Couldn't prepare the order. Try again." };
  }

  const totalMinor = goodsGrossMinor - discount.discountMinor;
  if (totalMinor < MIN_CHARGE_MINOR) {
    return {
      ok: false,
      error: "The order total is too small to pay by card.",
    };
  }

  // Order row FIRST (buyer identity = client_email; booking_id stays null per
  // 0134), then the intent; a failed intent rolls the order back, same as the
  // add-on path.
  const { data: order, error: orderErr } = await serviceClient
    .from("orders")
    .insert({
      artist_id: input.artistId,
      booking_id: null,
      client_email: email,
      status: "pending",
      deposit_amount: 0,
      goods_amount: computed.goodsAmount,
      subtotal_amount: totalMinor / 100,
      platform_fee_amount: fee.totalMinor / 100,
      fee_schedule_version: fee.scheduleVersion,
      goods_fee_amount: fee.goodsFeeMinor / 100,
      discount_code_id: discount.codeId,
      discount_amount: discount.discountMinor / 100,
      currency: "eur",
    })
    .select("id")
    .single();
  if (orderErr || !order) {
    return { ok: false, error: "Couldn't create the order. Try again." };
  }
  const orderId = order.id as string;

  const { error: itemsErr } = await serviceClient.from("order_items").insert(
    computed.lines.map((l) => ({
      order_id: orderId,
      type: "product",
      product_id: l.productId,
      variant_id: l.variantId,
      title_snapshot: l.titleSnapshot,
      variant_snapshot: l.variantSnapshot,
      quantity: l.quantity,
      unit_amount: l.unitAmount,
      total_amount: l.totalAmount,
      currency: "eur",
    })),
  );
  if (itemsErr) {
    await serviceClient.from("orders").delete().eq("id", orderId);
    return { ok: false, error: "Couldn't save the items. Try again." };
  }

  let intent: Stripe.PaymentIntent;
  try {
    intent = await stripe.paymentIntents.create(
      {
        amount: totalMinor,
        currency: "eur",
        automatic_payment_methods: { enabled: true },
        description: `Shop order ${orderId}`,
        on_behalf_of: routing.stripeAccountId,
        transfer_data: { destination: routing.stripeAccountId },
        application_fee_amount: fee.totalMinor,
        // NO booking_id: that absence is what routes the succeeded/refunded
        // webhooks down the standalone branch.
        metadata: {
          order_id: orderId,
          artist_id: input.artistId,
          standalone_goods: "1",
        },
      },
      {
        // Per-attempt nonce, same reasoning as the deposit path: transport
        // retries reuse the key; a genuinely new attempt for the same order
        // must not replay a cancelled intent for 24h.
        idempotencyKey: `standalone-order-${orderId}-${crypto.randomUUID()}`,
      },
    );
  } catch (err) {
    Sentry.captureException(err, {
      tags: { action: "standalone_goods_intent_create" },
      extra: { orderId, artistId: input.artistId },
    });
    await serviceClient.from("orders").delete().eq("id", orderId);
    return { ok: false, error: "Couldn't prepare the payment. Try again." };
  }

  const { error: linkErr } = await serviceClient
    .from("orders")
    .update({ stripe_payment_intent_id: intent.id })
    .eq("id", orderId);
  if (linkErr) {
    // The order cannot be settled without the PI link; cancel both sides.
    try {
      await stripe.paymentIntents.cancel(intent.id);
    } catch {
      // Best-effort; an uncancelled unpaid intent expires on its own.
    }
    await serviceClient.from("orders").delete().eq("id", orderId);
    return { ok: false, error: "Couldn't prepare the payment. Try again." };
  }

  if (!intent.client_secret) {
    return { ok: false, error: "Couldn't prepare the payment. Try again." };
  }
  return {
    ok: true,
    orderId,
    clientSecret: intent.client_secret,
    totalMinor,
    currency: "eur",
  };
}

/**
 * Settle a succeeded STANDALONE goods PaymentIntent (metadata carries order_id
 * and no booking_id). Same once-only shape as the add-on flip: only the call
 * that moves pending -> paid runs inventory, redemption and the receipt.
 */
export async function settleStandaloneGoodsOrder(
  intent: Stripe.PaymentIntent,
): Promise<boolean> {
  const orderId = intent.metadata?.order_id;
  if (!orderId) return false;

  const { data: flipped } = await serviceClient
    .from("orders")
    .update({
      status: "paid",
      fulfillment_status: "pending_pickup",
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .eq("status", "pending")
    .select("id, artist_id, client_email, discount_code_id, discount_amount");
  if (!flipped || flipped.length === 0) return false;
  const order = flipped[0];

  const { data: itemRows } = await serviceClient
    .from("order_items")
    .select(
      "product_id, variant_id, quantity, type, title_snapshot, variant_snapshot, total_amount",
    )
    .eq("order_id", orderId);
  const items = (itemRows ?? []) as PaidOrderItem[];

  const lowStock = await decrementInventory(items);
  for (const hit of lowStock) {
    await createNotification({
      artistId: order.artist_id as string,
      type: "system_warning",
      category: "booking_activity",
      priority: "medium",
      title: "Running low",
      message:
        hit.stockLeft === 0
          ? `"${hit.title}" just sold out.`
          : `"${hit.title}" is down to ${hit.stockLeft} left.`,
      ctaLabel: "Open the product",
      ctaHref: `/goods/${hit.productId}`,
      metadata: { product_id: hit.productId },
    });
  }

  if (order.discount_code_id) {
    await recordDiscountRedemption({
      discountCodeId: order.discount_code_id as string,
      artistId: order.artist_id as string,
      orderId,
      amountMinor: Math.round(Number(order.discount_amount ?? 0) * 100),
    });
  }

  // Buyer receipt, best-effort (a bounced email never fails a settlement).
  const clientEmail = (order.client_email as string | null) ?? null;
  if (clientEmail) {
    try {
      const { data: profile } = await serviceClient
        .from("profiles")
        .select("display_name")
        .eq("id", order.artist_id)
        .maybeSingle();
      const artistName =
        (profile?.display_name as string | null) || "the artist";
      const total = (
        (intent.amount_received ?? intent.amount ?? 0) / 100
      ).toFixed(2);
      const lines = items
        .filter((i) => i.type === "product")
        .map(
          (i) =>
            `- ${i.title_snapshot}${i.variant_snapshot ? ` (${i.variant_snapshot})` : ""} x ${i.quantity}`,
        )
        .join("\n");
      const body = `Hi,

Thanks for your order from ${artistName}.

${lines}

Total paid: ${total} EUR.

Keep this email as your receipt. Pickup and delivery are arranged with ${artistName} directly.`;
      await sendEmail({
        to: clientEmail,
        subject: `Your order from ${artistName}`,
        html: buildEmailHtml(body, {}, undefined, {
          footerNote: `Sent by Inklee on behalf of ${artistName}.`,
        }),
      });
    } catch (err) {
      Sentry.captureException(err, {
        tags: { action: "standalone_goods_receipt" },
        extra: { orderId },
      });
    }
  }

  void writeAudit({
    action: "goods_order_paid",
    actor: "system",
    category: "booking",
    details: {
      order_id: orderId,
      payment_intent_id: intent.id,
      amount_minor: intent.amount_received ?? intent.amount ?? 0,
      standalone: true,
      via: "stripe_webhook",
    },
  });
  return true;
}

/**
 * A dead standalone-goods intent (abandoned past Stripe's window, or canceled)
 * cancels its PENDING order (SHOP-ORD-001 half 1). Conditional on `pending`,
 * so a paid or already-cancelled order is never touched; items are kept (the
 * row is the retention subject, swept by the same retention rules as other
 * cancelled orders).
 */
export async function cancelStandalonePendingOrder(
  intent: Stripe.PaymentIntent,
): Promise<boolean> {
  const orderId = intent.metadata?.order_id;
  if (!orderId) return false;
  const { data } = await serviceClient
    .from("orders")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  return Boolean(data);
}

/**
 * FLEET SWEEP for abandoned standalone checkouts (SHOP-ORD-001 half 2). A
 * buyer who opens the checkout and walks away leaves a `pending` order holding
 * their email, and nothing else could ever touch it: the webhook only fires on
 * payment events, the cleanup cron matched orders through booking ids (NULL
 * here), and ORDER_MONEY_STATES excludes `pending`. Cancels standalone pending
 * orders older than 24 hours (Stripe intents are long dead by then; the paid
 * flip conditions on `pending`, so even a freak late success cannot resurrect
 * a cancelled row into paid — it just no-ops). Run by the cleanup cron.
 */
export async function sweepStalePendingStandaloneOrders(
  options: { now?: Date; maxAgeHours?: number } = {},
): Promise<{ cancelled: number }> {
  const now = options.now ?? new Date();
  const cutoff = new Date(
    now.getTime() - (options.maxAgeHours ?? 24) * 60 * 60 * 1000,
  ).toISOString();
  const { data, error } = await serviceClient
    .from("orders")
    .update({ status: "cancelled", updated_at: now.toISOString() })
    .eq("status", "pending")
    .is("booking_id", null)
    .lt("created_at", cutoff)
    .select("id");
  if (error) {
    Sentry.captureException(error, {
      tags: { action: "standalone_pending_order_sweep" },
    });
    return { cancelled: 0 };
  }
  const cancelled = (data ?? []).length;
  if (cancelled > 0) {
    void writeAudit({
      action: "goods_orders_expired",
      actor: "system",
      category: "booking",
      details: { count: cancelled, via: "cron_sweep", standalone: true },
    });
  }
  return { cancelled };
}
