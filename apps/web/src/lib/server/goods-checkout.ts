import "server-only";
import crypto from "crypto";
import type Stripe from "stripe";
import * as Sentry from "@sentry/nextjs";
import { serviceClient } from "@/lib/supabase/service";
import { stripe } from "@/lib/stripe";
import { writeAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/email/send";
import { buildEmailHtml } from "@/lib/email/booking-templates";
import { isGoodsCommerceEnabled, shopCheckoutEnabled } from "@/lib/features";
import { getConnectRoutingForArtist } from "@/lib/stripe-connect";
import { getAccountOverrides } from "@/lib/entitlements-server";
import { goodsBundlesAllowed } from "@/lib/server/entitlement-gates";
import { productAvailability } from "@inklee/shared/product-availability";
import { appointmentFeeTier } from "@/lib/server/order-fee-sync";
import { resolveDiscount } from "@/lib/server/discounts";
import { recordDiscountRedemption } from "@/lib/server/discounts";
import { createNotification } from "@/lib/notifications";
import {
  computeAddonLines,
  MAX_ADDON_QUANTITY,
  type AddonProduct,
  type AddonSelection,
} from "@/lib/orders";
import {
  computeOrderFees,
  goodsBaseMinorFromLines,
} from "@inklee/shared/order-fees";
import type { PaymentTier } from "@inklee/shared/fee-schedule";
import {
  bundlePurchasable,
  bundlePriceMinor,
  type Bundle,
} from "@inklee/shared/bundles";
import {
  decrementInventory,
  expandInventoryMovements,
  type InventoryOrderItem,
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

// SHOP-ORD-003: the stale-order sweep processes at most this many rows per
// nightly run. DERIVED FROM THE TIME BUDGET, not row appetite: the cleanup
// cron runs seven sweeps sequentially under maxDuration=60, this one makes up
// to 2 serial Stripe round-trips per row, and at ~200ms each 25 rows is ~10s
// worst case — bounded without starving the sweeps that run after it (the
// round-3 test agent showed 200 rows could eat ~40s and silently skip them).
// A backlog larger than this drains across nightly runs, oldest first.
const SWEEP_BATCH_LIMIT = 25;

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

export type BundleSelection = { bundleId: string; quantity: number };

type ResolvedBundleLine = {
  bundleId: string;
  name: string;
  quantity: number;
  /** Bundle price, major units (the charged unit price, decision B2/GC6). */
  unitAmount: number;
  totalMinor: number;
  /** Sale-time composition snapshot rows (0135), quantity per ONE bundle. */
  components: {
    productId: string;
    title: string;
    quantity: number;
    unitListPrice: number;
  }[];
};

/**
 * Resolve bundle selections into payable lines (GC6). Server-authoritative,
 * mirroring computeAddonLines' discipline: duplicates are aggregated BEFORE
 * the quantity cap and stock checks so a crafted payload cannot split its way
 * past either; prices come from the bundle row, never the client.
 *
 * SALE rules are stricter than DISPLAY rules on purpose: the shop may render
 * a bundle while omitting a hidden component (understating the saving), but
 * money only moves when the bundle is publicly visible, not archived, priced
 * in EUR (the standalone path charges EUR unconditionally), and every
 * component resolves against the same SELLABLE catalog the product lines use,
 * with enough stock. The artist's editor legitimately allows hidden or
 * inactive products inside a bundle; the answer here is "refuse", never
 * "sell it short" (bundlePurchasable's contract).
 *
 * A component RESOLVES only when all of these hold (else `product: null`):
 *   - present in the sellable catalog (active + publicly visible + this
 *     artist);
 *   - purchasable per productAvailability, the SAME gate the compositor runs
 *     for direct purchases (SHOP-DROP-001: drops live in the compositor, not
 *     the catalog query, so a stock-only check sold undropped products
 *     through bundles that were refused when bought directly);
 *   - variant-free (SHOP-VAR-001, decision GC7): v1 bundles cannot express a
 *     variant choice, and a variant-stocked parent has quantity null, which
 *     reads as unlimited while decrementInventory moves nothing. A product
 *     that REQUIRES a choice when bought directly must not sell choicelessly
 *     inside a bundle.
 */
async function resolveBundleLines(
  artistId: string,
  selections: BundleSelection[],
  sellableCatalog: CatalogRow[],
  nowMs: number = Date.now(),
): Promise<
  { ok: true; lines: ResolvedBundleLine[] } | { ok: false; error: string }
> {
  // Aggregate duplicate bundle ids, same reason as the addon compositor.
  const wanted = new Map<string, number>();
  for (const s of selections) {
    const add = Math.max(0, Math.trunc(Number(s.quantity) || 0));
    if (!s.bundleId || add <= 0) continue;
    wanted.set(s.bundleId, (wanted.get(s.bundleId) ?? 0) + add);
  }
  if (wanted.size === 0) return { ok: true, lines: [] };

  // Entitlement gate, same rule as the DISPLAY path (publicBundlesForArtist):
  // a paused or downgraded artist has no bundles. Display fails flat; money
  // fails CLOSED — a plan-read blip refuses rather than guessing (money rule).
  try {
    if (!goodsBundlesAllowed(await getAccountOverrides(artistId))) {
      return { ok: false, error: "That bundle isn't available right now." };
    }
  } catch {
    return { ok: false, error: "Couldn't prepare the order. Try again." };
  }

  const ids = [...wanted.keys()];
  const [{ data: bundleRows }, { data: itemRows }] = await Promise.all([
    serviceClient
      .from("product_bundles")
      .select(
        "id, name, price_amount, currency, is_public_visible, archived_at",
      )
      .eq("artist_id", artistId)
      .eq("is_public_visible", true)
      .is("archived_at", null)
      .eq("currency", "eur")
      .in("id", ids),
    serviceClient
      .from("product_bundle_items")
      .select("bundle_id, product_id, quantity")
      .eq("artist_id", artistId)
      .in("bundle_id", ids),
  ]);
  const bundleById = new Map(
    (bundleRows ?? []).map((b) => [b.id as string, b]),
  );
  const productById = new Map(sellableCatalog.map((p) => [p.id, p]));

  const lines: ResolvedBundleLine[] = [];
  for (const [bundleId, qty] of wanted) {
    if (qty > MAX_ADDON_QUANTITY) {
      return {
        ok: false,
        error: `You can add at most ${MAX_ADDON_QUANTITY} of a bundle.`,
      };
    }
    const row = bundleById.get(bundleId);
    if (!row) {
      // Missing, hidden, archived or non-EUR: one answer, no oracle for which.
      return { ok: false, error: "That bundle isn't available right now." };
    }
    const componentRows = (itemRows ?? []).filter(
      (i) => i.bundle_id === bundleId,
    );
    const bundle: Bundle = {
      id: bundleId,
      name: (row.name as string) ?? "",
      priceAmount: Number(row.price_amount ?? 0),
      currency: (row.currency as string) ?? "eur",
      position: 0,
      isPublicVisible: true,
      archivedAt: null,
    };
    const verdict = bundlePurchasable(
      bundle,
      componentRows.map((c) => {
        const product = productById.get(c.product_id as string);
        if (!product)
          return { quantity: Number(c.quantity ?? 1), product: null };
        // The compositor's own gate: drops, preorder and status, evaluated at
        // the same instant for every component (SHOP-DROP-001).
        const availability = productAvailability(
          {
            status: product.status,
            availableFrom: product.available_from,
            preorder: product.preorder === true,
            stockQuantity:
              product.quantity === null ? null : Number(product.quantity),
          },
          nowMs,
        );
        // v1 bundles cannot carry a variant choice (SHOP-VAR-001, GC7).
        const hasActiveVariants = (product.product_variants ?? []).some(
          (v) => v.status === "active",
        );
        return {
          quantity: Number(c.quantity ?? 1),
          product:
            availability.purchasable && !hasActiveVariants
              ? { stock: product.quantity }
              : null,
        };
      }),
      qty,
    );
    if (!verdict.ok) {
      const error =
        verdict.reason === "component_out_of_stock"
          ? `Not enough stock for "${bundle.name}".`
          : verdict.reason === "component_unavailable"
            ? "Part of that bundle isn't available right now."
            : "That bundle isn't available right now.";
      return { ok: false, error };
    }
    lines.push({
      bundleId,
      name: bundle.name,
      quantity: qty,
      unitAmount: bundle.priceAmount,
      totalMinor: bundlePriceMinor(bundle.priceAmount) * qty,
      components: componentRows.map((c) => {
        const product = productById.get(c.product_id as string)!;
        return {
          productId: c.product_id as string,
          title: product.title,
          quantity: Number(c.quantity ?? 1),
          unitListPrice: Number(product.price_amount ?? 0),
        };
      }),
    });
  }
  return { ok: true, lines };
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
  bundles?: BundleSelection[];
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

  // Artist's own standalone-shop toggle (decision S2). The page and the
  // action both re-check this too (defense in depth), but THIS is the money
  // path: page filters never protect it (SHOP-VIS-001). Fail CLOSED on a
  // genuine read error (money rule) — a missing/empty settings row is not an
  // error and resolves to the default (shop_checkout on), so this cannot
  // regress every existing artist who has never touched the toggle.
  const { data: profileRow, error: profileErr } = await serviceClient
    .from("profiles")
    .select("settings")
    .eq("id", input.artistId)
    .maybeSingle();
  if (profileErr) {
    return { ok: false, error: "Couldn't prepare the order. Try again." };
  }
  if (!shopCheckoutEnabled(profileRow?.settings)) {
    return { ok: false, error: "The shop isn't taking card orders yet." };
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

  // Bundles (GC6): resolved against the SAME sellable catalog the product
  // lines validated against, so the visibility/status/currency rules cannot
  // diverge between the two line kinds.
  const resolvedBundles = await resolveBundleLines(
    input.artistId,
    input.bundles ?? [],
    (rows ?? []) as CatalogRow[],
  );
  if (!resolvedBundles.ok) return { ok: false, error: resolvedBundles.error };
  const bundleLines = resolvedBundles.lines;

  if (computed.lines.length === 0 && bundleLines.length === 0) {
    return { ok: false, error: "Pick something to buy first." };
  }

  // Discount (optional). resolveDiscount is apply-time gated on the artist's
  // entitlement and returns a client-facing rejection message when the code
  // does not take money off. The subtotal it thresholds against is the FULL
  // goods gross, bundles included.
  const bundleGrossMinor = bundleLines.reduce((s, l) => s + l.totalMinor, 0);
  const goodsGrossMinor =
    Math.round(computed.goodsAmount * 100) + bundleGrossMinor;
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
  // Hoisted out of the try block (G2, FEE-STP-001): the order insert below
  // stamps `fee_tier` from the SAME resolution `fee` was priced at, not a
  // second read of the artist's (possibly since-changed) overrides.
  let tier: PaymentTier;
  try {
    tier = appointmentFeeTier(await getAccountOverrides(input.artistId));
    const goodsBaseMinor = goodsBaseMinorFromLines(
      [
        ...computed.lines.map((l) => ({
          type: "product",
          totalMinor: Math.round(l.totalAmount * 100),
        })),
        // Fee base = the bundle PRICE, never the components' sum (B2/GC6).
        ...bundleLines.map((l) => ({
          type: "bundle",
          totalMinor: l.totalMinor,
        })),
      ],
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
      goods_amount: computed.goodsAmount + bundleGrossMinor / 100,
      subtotal_amount: totalMinor / 100,
      platform_fee_amount: fee.totalMinor / 100,
      fee_schedule_version: fee.scheduleVersion,
      // G2 (FEE-STP-001): the tier this order's fee was actually priced at.
      fee_tier: tier,
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

  if (computed.lines.length > 0) {
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
  }

  // Bundle lines (GC6): one first-class 'bundle' row per bundle at the bundle
  // price, then the sale-time composition snapshot keyed to the returned item
  // ids. The snapshot is what fulfilment and the deletion guard read; a
  // failure to write it makes the sale unfulfillable, so it rolls back the
  // whole order (the order delete cascades items and snapshots).
  if (bundleLines.length > 0) {
    const { data: insertedBundleItems, error: bundleItemsErr } =
      await serviceClient
        .from("order_items")
        .insert(
          bundleLines.map((l) => ({
            order_id: orderId,
            type: "bundle",
            product_id: null,
            variant_id: null,
            bundle_id: l.bundleId,
            title_snapshot: l.name,
            variant_snapshot: null,
            quantity: l.quantity,
            unit_amount: l.unitAmount,
            total_amount: l.totalMinor / 100,
            currency: "eur",
          })),
        )
        .select("id, bundle_id");
    if (bundleItemsErr || !insertedBundleItems) {
      await serviceClient.from("orders").delete().eq("id", orderId);
      return { ok: false, error: "Couldn't save the items. Try again." };
    }
    // Matched by bundle_id, not array position: duplicates were aggregated to
    // one line per bundle, so the mapping is unambiguous.
    const itemIdByBundle = new Map(
      insertedBundleItems.map((r) => [r.bundle_id as string, r.id as string]),
    );
    const snapshotRows = bundleLines.flatMap((l) => {
      const orderItemId = itemIdByBundle.get(l.bundleId);
      if (!orderItemId) return [];
      return l.components.map((c) => ({
        order_item_id: orderItemId,
        product_id: c.productId,
        title_snapshot: c.title,
        quantity: c.quantity,
        unit_list_price: c.unitListPrice,
      }));
    });
    const missingSnapshot =
      snapshotRows.length === 0 || itemIdByBundle.size !== bundleLines.length;
    const { error: snapshotErr } = missingSnapshot
      ? { error: new Error("bundle snapshot mapping incomplete") }
      : await serviceClient
          .from("order_item_bundle_components")
          .insert(snapshotRows);
    if (snapshotErr) {
      Sentry.captureException(snapshotErr, {
        tags: { action: "standalone_goods_bundle_snapshot" },
        extra: { orderId },
      });
      await serviceClient.from("orders").delete().eq("id", orderId);
      return { ok: false, error: "Couldn't save the items. Try again." };
    }
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

/** The three OUTCOMES a settle attempt can have (SHOP-FUL-005). The webhook
 *  maps them to HTTP: `refused` is the ONLY retryable one (pre-flip failure,
 *  gate unconsumed -> 500 so Stripe's retry ladder recovers in minutes);
 *  `settled` and `already` are terminal successes (200). A boolean could not
 *  express this: a naive 500-on-false would retry forever on orders another
 *  delivery already settled. */
export type StandaloneSettleOutcome = "settled" | "already" | "refused";

/**
 * Settle a succeeded STANDALONE goods PaymentIntent (metadata carries order_id
 * and no booking_id). Same once-only shape as the add-on flip: only the call
 * that moves pending -> paid runs inventory, redemption and the receipt.
 */
export async function settleStandaloneGoodsOrder(
  intent: Stripe.PaymentIntent,
): Promise<StandaloneSettleOutcome> {
  const orderId = intent.metadata?.order_id;
  if (!orderId) return "already";

  // Read + EXPAND BEFORE the flip (SHOP-FUL-003, same posture as the refund
  // side's SHOP-FUL-002 fix). The expansion throws on a snapshot read failure
  // and the flip below is once-only: a throw AFTER it would consume the gate
  // with the inventory decrement lost permanently (a silent oversell). Reads
  // are idempotent, so failing HERE refuses with the flip unconsumed, and the
  // webhook's 500 makes Stripe redeliver (SHOP-FUL-005) — recovery in
  // minutes, not on the daily sweep.
  const { data: itemRows } = await serviceClient
    .from("order_items")
    .select(
      "id, bundle_id, product_id, variant_id, quantity, type, title_snapshot, variant_snapshot, total_amount",
    )
    .eq("order_id", orderId);
  const items = (itemRows ?? []) as InventoryOrderItem[];
  let movements: Awaited<ReturnType<typeof expandInventoryMovements>>;
  try {
    movements = await expandInventoryMovements(items);
  } catch (err) {
    Sentry.captureException(err, {
      tags: { action: "standalone_goods_inventory" },
      extra: { orderId },
    });
    return "refused";
  }

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
  // A lost flip is TERMINAL: another delivery settled this order (or the
  // sweep cancelled it, in which case the sweep owns the intent). Never
  // retryable — a 500 here would loop forever.
  if (!flipped || flipped.length === 0) return "already";
  const order = flipped[0];

  // The stock WRITE stays inside the flip gate (decrementInventory is not
  // internally idempotent; the gate is what makes a redelivered succeeded
  // event unable to decrement twice). Inventory moves through the ONE
  // expansion rule (SHOP-FUL-001), already resolved above.
  const lowStock = await decrementInventory(movements);
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
        .filter((i) => i.type === "product" || i.type === "bundle")
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
  return "settled";
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
 * FLEET SWEEP for abandoned standalone checkouts (SHOP-ORD-001 half 2,
 * intent-aware since SHOP-ORD-002). A buyer who opens the checkout and walks
 * away leaves a `pending` order holding their email, and nothing else could
 * ever touch it: the webhook only fires on payment events, the cleanup cron
 * matched orders through booking ids (NULL here), and ORDER_MONEY_STATES
 * excludes `pending`. Run by the cleanup cron, 24 hours by default.
 *
 * The sweep resolves the INTENT, never just the row (SHOP-ORD-002): Stripe
 * PaymentIntents do not expire in 24 hours and the buyer still holds the
 * client secret, so cancelling only the order would leave a live payable
 * intent whose late success settles nothing (the paid flip conditions on
 * `pending`), i.e. money captured against a cancelled order. Per order:
 *
 *   intent succeeded            -> settleStandaloneGoodsOrder (a lost-webhook
 *                                  recovery for free; the order leaves
 *                                  `pending`, so it exits the sweep's scope)
 *   intent processing           -> skip this round; a decision either way
 *                                  races the processor
 *   intent cancelable / dead    -> cancel the intent FIRST, then the order
 *   no intent id on the row     -> cancel the order directly
 *   Stripe error on any step    -> skip the row (captured; next run retries)
 */
export async function sweepStalePendingStandaloneOrders(
  options: { now?: Date; maxAgeHours?: number } = {},
): Promise<{ cancelled: number; settled: number; skipped: number }> {
  const now = options.now ?? new Date();
  const cutoff = new Date(
    now.getTime() - (options.maxAgeHours ?? 24) * 60 * 60 * 1000,
  ).toISOString();
  const { data: rows, error } = await serviceClient
    .from("orders")
    .select("id, stripe_payment_intent_id")
    .eq("status", "pending")
    .is("booking_id", null)
    .lt("created_at", cutoff)
    // Bounded per run (SHOP-ORD-003): 1-2 serial Stripe round-trips per row
    // inside a cron with a hard wall-clock ceiling. Oldest first so a backlog
    // drains fairly across nightly runs rather than starving the tail.
    .order("created_at", { ascending: true })
    .limit(SWEEP_BATCH_LIMIT);
  if (error) {
    Sentry.captureException(error, {
      tags: { action: "standalone_pending_order_sweep" },
    });
    return { cancelled: 0, settled: 0, skipped: 0 };
  }

  let cancelled = 0;
  let settled = 0;
  let skipped = 0;

  const cancelOrderRow = async (orderId: string) => {
    const { data: flipped } = await serviceClient
      .from("orders")
      .update({ status: "cancelled", updated_at: now.toISOString() })
      .eq("id", orderId)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (flipped) cancelled += 1;
  };

  for (const row of rows ?? []) {
    const orderId = row.id as string;
    const intentId = (row.stripe_payment_intent_id as string | null) ?? null;

    // A row that never got its intent linked has nothing payable attached.
    if (!intentId) {
      await cancelOrderRow(orderId);
      continue;
    }
    // Stripe unconfigured but an intent id exists: the intent's state is
    // unknowable, so leave the row alone rather than orphan a payable intent.
    if (!stripe) {
      skipped += 1;
      continue;
    }

    try {
      const intent = await stripe.paymentIntents.retrieve(intentId);
      if (intent.status === "succeeded") {
        // The webhook was lost; converge instead of cancelling a paid order.
        const outcome = await settleStandaloneGoodsOrder(intent);
        if (outcome === "settled") settled += 1;
        else skipped += 1;
        continue;
      }
      if (intent.status === "processing") {
        skipped += 1;
        continue;
      }
      if (intent.status !== "canceled") {
        // cancel() re-checks server-side; if a confirm races us, Stripe
        // rejects the cancel, we throw to the catch below and the next run
        // sees `succeeded`.
        await stripe.paymentIntents.cancel(intentId);
      }
      await cancelOrderRow(orderId);
    } catch (err) {
      skipped += 1;
      Sentry.captureException(err, {
        tags: { action: "standalone_pending_order_sweep" },
        extra: { orderId, intentId },
      });
    }
  }

  // Skipped rows count as activity too (SHOP-ORD-003): a run that skips every
  // row used to write no audit at all and was visible only per-row in Sentry.
  // AWAITED, not fire-and-forget: under exactly the timeout this finding is
  // about, a voided write is the first thing lost.
  if (cancelled > 0 || settled > 0 || skipped > 0) {
    await writeAudit({
      action: "goods_orders_expired",
      actor: "system",
      category: "booking",
      details: {
        count: cancelled,
        settled_late: settled,
        skipped,
        via: "cron_sweep",
        standalone: true,
      },
    });
  }
  return { cancelled, settled, skipped };
}
