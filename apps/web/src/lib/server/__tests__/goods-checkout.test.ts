import { describe, it, expect, vi, beforeEach } from "vitest";
import type Stripe from "stripe";

// Standalone goods checkout (GC1 C2). The compositor and fee engine are REAL
// (the money maths must be the shipped maths); everything with IO is mocked.

const {
  mockServiceClient,
  mockStripe,
  mockWriteAudit,
  mockRouting,
  mockOverrides,
  mockFeeTier,
  mockResolveDiscount,
  mockRecordRedemption,
  mockNotify,
  mockSendEmail,
  mockDecrement,
  mockComputeOrderFees,
  mockCaptureException,
  flags,
} = vi.hoisted(() => ({
  mockServiceClient: { from: vi.fn() },
  mockStripe: {
    paymentIntents: { create: vi.fn(), cancel: vi.fn() },
  },
  mockWriteAudit: vi.fn(),
  mockRouting: vi.fn(),
  mockOverrides: vi.fn(),
  mockFeeTier: vi.fn(),
  mockResolveDiscount: vi.fn(),
  mockRecordRedemption: vi.fn(),
  mockNotify: vi.fn(),
  mockSendEmail: vi.fn(),
  mockDecrement: vi.fn(),
  mockComputeOrderFees: vi.fn(),
  mockCaptureException: vi.fn(),
  flags: { goodsCommerce: true },
}));

vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({
  captureException: (...a: unknown[]) => mockCaptureException(...a),
  captureMessage: vi.fn(),
}));
// SPY, NOT STUB. The fee engine stays REAL (the money maths must be the shipped
// maths); the wrapper only records what the checkout HANDED it. That argument is
// the only observable that distinguishes fee-on-discounted-base from
// fee-on-gross, because the v1 goods rate is 0% and both produce
// application_fee_amount: 0 on the intent.
vi.mock("@inklee/shared/order-fees", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@inklee/shared/order-fees")>();
  return {
    ...actual,
    computeOrderFees: (...args: Parameters<typeof actual.computeOrderFees>) => {
      mockComputeOrderFees(...args);
      return actual.computeOrderFees(...args);
    },
  };
});
vi.mock("@/lib/supabase/service", () => ({ serviceClient: mockServiceClient }));
vi.mock("@/lib/stripe", () => ({ stripe: mockStripe }));
vi.mock("@/lib/audit", () => ({
  writeAudit: (...a: unknown[]) => mockWriteAudit(...a),
}));
vi.mock("@/lib/features", () => ({
  isGoodsCommerceEnabled: () => flags.goodsCommerce,
}));
vi.mock("@/lib/stripe-connect", () => ({
  getConnectRoutingForArtist: (...a: unknown[]) => mockRouting(...a),
}));
vi.mock("@/lib/entitlements-server", () => ({
  getAccountOverrides: (...a: unknown[]) => mockOverrides(...a),
}));
vi.mock("@/lib/server/order-fee-sync", () => ({
  appointmentFeeTier: (...a: unknown[]) => mockFeeTier(...a),
}));
vi.mock("@/lib/server/discounts", () => ({
  resolveDiscount: (...a: unknown[]) => mockResolveDiscount(...a),
  recordDiscountRedemption: (...a: unknown[]) => mockRecordRedemption(...a),
}));
vi.mock("@/lib/notifications", () => ({
  createNotification: (...a: unknown[]) => mockNotify(...a),
}));
vi.mock("@/lib/email/send", () => ({
  sendEmail: (...a: unknown[]) => mockSendEmail(...a),
}));
vi.mock("@/lib/email/booking-templates", () => ({
  buildEmailHtml: (body: string) => `<html>${body}</html>`,
}));
vi.mock("@/lib/order-fulfillment", () => ({
  decrementInventory: (...a: unknown[]) => mockDecrement(...a),
}));

import {
  createStandaloneGoodsCheckoutCore,
  settleStandaloneGoodsOrder,
  cancelStandalonePendingOrder,
  sweepStalePendingStandaloneOrders,
} from "@/lib/server/goods-checkout";

// ---------------------------------------------------------------------------
// Recording Supabase double, keyed replies per table:verb.

type Reply = { data?: unknown; error?: unknown };
type QueuedReplies = Record<string, Reply[]>;
let replies: QueuedReplies = {};
function queue(key: string, ...rs: Reply[]) {
  replies[key] = [...(replies[key] ?? []), ...rs];
}
function nextReply(key: string): Reply {
  const q = replies[key];
  if (q && q.length > 0) return q.shift() as Reply;
  return { data: null, error: null };
}

type RecordedOp = {
  table: string;
  verb: string;
  payload: unknown;
  filters: Record<string, unknown>;
  /** `.is(col, v)` — a separate bucket from `.eq`, because `is(booking_id,
   *  null)` and `eq(booking_id, null)` are DIFFERENT queries in PostgREST and
   *  the sweep's correctness depends on which one it sent. */
  isFilters: Record<string, unknown>;
  /** `.lt(col, v)` — the sweep's age cutoff. */
  ltFilters: Record<string, unknown>;
};
let ops: RecordedOp[] = [];

function newOp(table: string, verb: string, payload: unknown): RecordedOp {
  const op: RecordedOp = {
    table,
    verb,
    payload,
    filters: {},
    isFilters: {},
    ltFilters: {},
  };
  ops.push(op);
  return op;
}

function makeChain(op: RecordedOp) {
  const key = `${op.table}:${op.verb}`;
  const chain = {
    eq: (column: string, value: unknown) => {
      op.filters[column] = value;
      return chain;
    },
    is: (column: string, value: unknown) => {
      op.isFilters[column] = value;
      return chain;
    },
    lt: (column: string, value: unknown) => {
      op.ltFilters[column] = value;
      return chain;
    },
    in: () => chain,
    select: () => chain,
    single: () => Promise.resolve(nextReply(key)),
    maybeSingle: () => Promise.resolve(nextReply(key)),
    then: (onF?: (v: Reply) => unknown, onR?: (r: unknown) => unknown) =>
      Promise.resolve(nextReply(key)).then(onF, onR),
  };
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  ops = [];
  replies = {};
  flags.goodsCommerce = true;
  mockRouting.mockResolvedValue({
    stripeAccountId: "acct_1",
    routeCharges: true,
  });
  mockOverrides.mockResolvedValue({});
  mockFeeTier.mockReturnValue("free");
  mockResolveDiscount.mockResolvedValue({
    codeId: null,
    discountMinor: 0,
    error: null,
  });
  mockStripe.paymentIntents.create.mockResolvedValue({
    id: "pi_new",
    client_secret: "secret_1",
  });
  mockDecrement.mockResolvedValue([]);
  mockSendEmail.mockResolvedValue(undefined);
  mockServiceClient.from.mockImplementation((table: string) => ({
    select: () => makeChain(newOp(table, "select", null)),
    insert: (payload: unknown) => makeChain(newOp(table, "insert", payload)),
    update: (payload: unknown) => makeChain(newOp(table, "update", payload)),
    delete: () => makeChain(newOp(table, "delete", null)),
  }));
});

/** The single `orders` update op, asserted to be the only one. Several tests
 *  below turn on "the code sent exactly one write with exactly these filters",
 *  which a `.find()` would quietly hide. */
function onlyOrdersUpdate(): RecordedOp {
  const updates = ops.filter(
    (o) => o.table === "orders" && o.verb === "update",
  );
  expect(updates).toHaveLength(1);
  return updates[0]!;
}

const CATALOG_ROW = {
  id: "p1",
  title: "Print",
  price_amount: 30,
  currency: "eur",
  status: "active",
  quantity: 10,
  available_from: null,
  preorder: false,
  product_variants: [],
};

const INPUT = {
  artistId: "a1",
  clientEmail: "buyer@example.com",
  selections: [{ productId: "p1", variantId: null, quantity: 2 }],
};

function queueHappyPath() {
  queue("products:select", { data: [CATALOG_ROW] });
  queue("orders:insert", { data: { id: "o1" } });
  queue("order_items:insert", { data: null });
  queue("orders:update", { data: null });
}

describe("createStandaloneGoodsCheckoutCore", () => {
  it("creates the order (booking_id null, buyer email), items and PI, and returns the secret", async () => {
    queueHappyPath();

    const r = await createStandaloneGoodsCheckoutCore(INPUT);
    expect(r).toEqual({
      ok: true,
      orderId: "o1",
      clientSecret: "secret_1",
      totalMinor: 6000, // 2 x 30.00
      currency: "eur",
    });

    const orderInsert = ops.find(
      (o) => o.table === "orders" && o.verb === "insert",
    );
    expect(orderInsert!.payload).toMatchObject({
      artist_id: "a1",
      booking_id: null,
      client_email: "buyer@example.com",
      deposit_amount: 0,
      goods_amount: 60,
      subtotal_amount: 60,
      status: "pending",
    });

    const itemsInsert = ops.find(
      (o) => o.table === "order_items" && o.verb === "insert",
    );
    const items = itemsInsert!.payload as Record<string, unknown>[];
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      type: "product",
      product_id: "p1",
      quantity: 2,
      total_amount: 60,
    });

    expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 6000,
        currency: "eur",
        on_behalf_of: "acct_1",
        transfer_data: { destination: "acct_1" },
        application_fee_amount: 0, // v1 goods rate is 0%
        metadata: expect.objectContaining({
          order_id: "o1",
          artist_id: "a1",
          standalone_goods: "1",
        }),
      }),
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    );
    // The metadata must NOT carry booking_id: its absence routes the webhooks.
    const meta = mockStripe.paymentIntents.create.mock.calls[0]![0].metadata;
    expect(meta.booking_id).toBeUndefined();

    // The PI id is linked back onto the order.
    const link = ops.find((o) => o.table === "orders" && o.verb === "update");
    expect(link!.payload).toMatchObject({ stripe_payment_intent_id: "pi_new" });
  });

  // SHOP-VIS-001. This catalog read feeds the MONEY path through serviceClient,
  // where RLS never applies, so these filters are the only thing between a
  // crafted `selections` payload and a product the artist has hidden. Fixing
  // the shop PAGE read alone would not have closed it, which is why the
  // assertion lives against the checkout core.
  it("SHOP-VIS-001: the catalog read is scoped to this artist's ACTIVE, PUBLICLY VISIBLE products", async () => {
    queueHappyPath();
    const r = await createStandaloneGoodsCheckoutCore(INPUT);
    expect(r.ok).toBe(true);

    const catalogRead = ops.find(
      (o) => o.table === "products" && o.verb === "select",
    );
    expect(catalogRead).toBeDefined();
    // Exact, not a subset: this fails if any of the three .eq lines is deleted
    // AND if a fourth appears unreviewed. Per line —
    //   is_public_visible -> deleting it sells hidden products to anonymous
    //                        buyers (the SHOP-VIS-001 defect itself);
    //   artist_id         -> deleting it sells another artist's catalog through
    //                        this artist's Connect account;
    //   status            -> deleting it sells drafts and archived products.
    expect(catalogRead!.filters).toEqual({
      artist_id: "a1",
      status: "active",
      is_public_visible: true,
    });
  });

  // TEST-VAC-003. Every other test in this file runs at discountMinor 0, so the
  // discount arithmetic had NO coverage: a checkout that charged the gross and
  // computed its fee on the gross passed the entire suite.
  it("ACCEPTED discount: charges gross minus discount, and bases the fee on the DISCOUNTED goods subtotal", async () => {
    queueHappyPath();
    // Exactly resolveDiscount's ResolvedDiscount shape.
    mockResolveDiscount.mockResolvedValue({
      codeId: "dc1",
      discountMinor: 1500,
      error: null,
    });

    const r = await createStandaloneGoodsCheckoutCore({
      ...INPUT,
      discountCode: "SUMMER25",
    });

    // The code is evaluated against the GROSS subtotal: min_subtotal_minor
    // thresholds are written against what the buyer is buying, not what they
    // end up paying after their own code applies.
    expect(mockResolveDiscount).toHaveBeenCalledWith(
      expect.objectContaining({
        artistId: "a1",
        rawCode: "SUMMER25",
        subtotalMinor: 6000,
        currency: "eur",
      }),
    );

    // 2 x 30.00 = 60.00 gross, less 15.00 = 45.00 charged.
    // MUTANT KILLED (charge-full-price): `totalMinor = goodsGrossMinor`, i.e.
    // dropping the `- discount.discountMinor`. The buyer would be charged 60.00
    // for a 45.00 order while the order row still recorded the discount.
    expect(r).toEqual({
      ok: true,
      orderId: "o1",
      clientSecret: "secret_1",
      totalMinor: 4500,
      currency: "eur",
    });
    expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 4500 }),
      expect.anything(),
    );

    // MUTANT KILLED (fee-on-gross): passing goodsGrossMinor to the fee engine,
    // or dropping `{ discountsMinor }` from goodsBaseMinorFromLines. Asserted
    // on the ARGUMENT rather than on application_fee_amount because the v1
    // goods rate is 0%: both mutants still produce a 0 fee on the intent and
    // are completely invisible there. They become visible the moment P7 flips
    // the rate, which is the wrong moment to discover them.
    expect(mockComputeOrderFees).toHaveBeenCalledTimes(1);
    expect(mockComputeOrderFees).toHaveBeenCalledWith({
      appointmentBaseMinor: 0,
      goodsBaseMinor: 4500,
      tier: "free",
    });

    const orderInsert = ops.find(
      (o) => o.table === "orders" && o.verb === "insert",
    );
    expect(orderInsert!.payload).toMatchObject({
      goods_amount: 60, // the goods lane keeps its GROSS value
      discount_code_id: "dc1",
      discount_amount: 15,
      subtotal_amount: 45, // what the buyer is actually charged
    });

    // The redemption is counted at SETTLEMENT, never here: an abandoned
    // checkout must not burn a capped code. Fails if recordDiscountRedemption
    // is moved into the create path.
    expect(mockRecordRedemption).not.toHaveBeenCalled();
  });

  it("fails closed when the goods-commerce park switch is off", async () => {
    flags.goodsCommerce = false;
    const r = await createStandaloneGoodsCheckoutCore(INPUT);
    expect(r.ok).toBe(false);
    expect(ops).toHaveLength(0);
    expect(mockStripe.paymentIntents.create).not.toHaveBeenCalled();
  });

  it("refuses when the artist is not charge-ready (wrong-party rule)", async () => {
    mockRouting.mockResolvedValue({
      stripeAccountId: null,
      routeCharges: false,
    });
    const r = await createStandaloneGoodsCheckoutCore(INPUT);
    expect(r.ok).toBe(false);
    expect(ops).toHaveLength(0);
  });

  it("refuses an invalid buyer email before any reads", async () => {
    const r = await createStandaloneGoodsCheckoutCore({
      ...INPUT,
      clientEmail: "not-an-email",
    });
    expect(r.ok).toBe(false);
    expect(ops).toHaveLength(0);
  });

  it("surfaces the REAL compositor's refusal (unknown product)", async () => {
    queue("products:select", { data: [] }); // empty catalog
    const r = await createStandaloneGoodsCheckoutCore(INPUT);
    expect(r).toEqual({
      ok: false,
      error: "One of the items is no longer available.",
    });
  });

  it("surfaces a discount rejection and stops", async () => {
    queue("products:select", { data: [CATALOG_ROW] });
    mockResolveDiscount.mockResolvedValue({
      codeId: null,
      discountMinor: 0,
      error: "That code has expired.",
    });
    const r = await createStandaloneGoodsCheckoutCore({
      ...INPUT,
      discountCode: "OLD",
    });
    expect(r).toEqual({ ok: false, error: "That code has expired." });
    expect(
      ops.find((o) => o.table === "orders" && o.verb === "insert"),
    ).toBeUndefined();
  });

  it("rolls the order back when the PI creation fails", async () => {
    queueHappyPath();
    mockStripe.paymentIntents.create.mockRejectedValue(
      new Error("stripe down"),
    );
    const r = await createStandaloneGoodsCheckoutCore(INPUT);
    expect(r.ok).toBe(false);
    const del = ops.find((o) => o.table === "orders" && o.verb === "delete");
    expect(del).toBeDefined();
    expect(del!.filters.id).toBe("o1");
  });

  it("refuses a total under Stripe's charge floor", async () => {
    queue("products:select", {
      data: [{ ...CATALOG_ROW, price_amount: 0.2 }],
    });
    const r = await createStandaloneGoodsCheckoutCore({
      ...INPUT,
      selections: [{ productId: "p1", variantId: null, quantity: 1 }],
    });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain("too small");
    expect(
      ops.find((o) => o.table === "orders" && o.verb === "insert"),
    ).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------

const PAID_ITEMS = [
  {
    product_id: "p1",
    variant_id: null,
    quantity: 2,
    type: "product",
    title_snapshot: "Print",
    variant_snapshot: null,
    total_amount: 60,
  },
];

function makeIntent(
  over: Partial<Stripe.PaymentIntent> = {},
): Stripe.PaymentIntent {
  return {
    id: "pi_new",
    amount: 6000,
    amount_received: 6000,
    metadata: { order_id: "o1", artist_id: "a1", standalone_goods: "1" },
    ...over,
  } as unknown as Stripe.PaymentIntent;
}

describe("settleStandaloneGoodsOrder", () => {
  it("flips pending -> paid once, decrements, records the redemption, emails the receipt", async () => {
    queue("orders:update", {
      data: [
        {
          id: "o1",
          artist_id: "a1",
          client_email: "buyer@example.com",
          discount_code_id: "dc1",
          discount_amount: 5,
        },
      ],
    });
    queue("order_items:select", { data: PAID_ITEMS });
    queue("profiles:select", { data: { display_name: "Mika Ink" } });

    const settled = await settleStandaloneGoodsOrder(makeIntent());
    expect(settled).toBe(true);

    const flip = ops.find((o) => o.table === "orders" && o.verb === "update");
    expect((flip!.payload as Record<string, unknown>).status).toBe("paid");
    expect(flip!.filters.id).toBe("o1");
    expect(flip!.filters.status).toBe("pending");

    expect(mockDecrement).toHaveBeenCalledWith(PAID_ITEMS);
    expect(mockRecordRedemption).toHaveBeenCalledWith(
      expect.objectContaining({ discountCodeId: "dc1", amountMinor: 500 }),
    );
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "buyer@example.com",
        subject: "Your order from Mika Ink",
      }),
    );
    expect(mockWriteAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "goods_order_paid" }),
    );
  });

  it("redelivery loses the flip and does nothing else (once-only)", async () => {
    queue("orders:update", { data: [] });
    const settled = await settleStandaloneGoodsOrder(makeIntent());
    expect(settled).toBe(false);
    expect(mockDecrement).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockWriteAudit).not.toHaveBeenCalled();
  });

  it("a receipt failure never fails the settlement", async () => {
    queue("orders:update", {
      data: [
        {
          id: "o1",
          artist_id: "a1",
          client_email: "buyer@example.com",
          discount_code_id: null,
          discount_amount: 0,
        },
      ],
    });
    queue("order_items:select", { data: PAID_ITEMS });
    mockSendEmail.mockRejectedValue(new Error("resend down"));

    const settled = await settleStandaloneGoodsOrder(makeIntent());
    expect(settled).toBe(true);
    expect(mockDecrement).toHaveBeenCalled();
  });

  it("ignores intents without an order_id", async () => {
    const settled = await settleStandaloneGoodsOrder(
      makeIntent({ metadata: {} as never }),
    );
    expect(settled).toBe(false);
    expect(ops).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// SHOP-ORD-001. An abandoned standalone checkout used to leave a `pending`
// order holding a guest email that NOTHING could ever reach: the webhook only
// fires on payment events, the cleanup cron matched orders through booking ids
// (null here), and ORDER_MONEY_STATES excludes `pending`. Two halves close it —
// the dead-intent cancel, and the fleet sweep for buyers who simply walked away
// without Stripe ever cancelling anything.

describe("cancelStandalonePendingOrder", () => {
  it("cancels the order, and only while it is still pending", async () => {
    queue("orders:update", { data: { id: "o1" } });

    const cancelled = await cancelStandalonePendingOrder(makeIntent());
    expect(cancelled).toBe(true);

    const upd = onlyOrdersUpdate();
    expect((upd.payload as Record<string, unknown>).status).toBe("cancelled");
    expect(upd.filters.id).toBe("o1");
    // Fails if .eq("status", "pending") is dropped. Stripe cancels an intent
    // whose order later settled by another route, and without this filter that
    // event walks a PAID order back to cancelled, unwinding a real sale while
    // the money stays captured.
    expect(upd.filters.status).toBe("pending");
  });

  it("reports false when the order was no longer pending", async () => {
    queue("orders:update", { data: null }); // maybeSingle: nothing matched

    const cancelled = await cancelStandalonePendingOrder(makeIntent());
    expect(cancelled).toBe(false);
    // Positive control: the conditional update DID run and matched nothing,
    // which is a different fact from the function never reaching the database.
    // Without this, the assertion above would also pass on an early return.
    expect(onlyOrdersUpdate().filters.status).toBe("pending");
  });

  it("ignores an intent with no order_id and touches the database not at all", async () => {
    const cancelled = await cancelStandalonePendingOrder(
      makeIntent({ metadata: {} as never }),
    );
    // Fails if the metadata guard goes: `.eq("id", undefined)` against
    // PostgREST is an unfiltered predicate, not a no-op.
    expect(cancelled).toBe(false);
    expect(ops).toHaveLength(0);
  });
});

describe("sweepStalePendingStandaloneOrders", () => {
  // Injected, never ambient: a cutoff asserted against Date.now() is a test
  // that cannot state what it expects.
  const NOW = new Date("2026-08-01T12:00:00.000Z");

  it("cancels standalone pending orders past the 24h default cutoff and audits the count", async () => {
    queue("orders:update", { data: [{ id: "o1" }, { id: "o2" }] });

    const r = await sweepStalePendingStandaloneOrders({ now: NOW });
    expect(r).toEqual({ cancelled: 2 });

    const upd = onlyOrdersUpdate();
    expect(upd.payload).toMatchObject({
      status: "cancelled",
      updated_at: "2026-08-01T12:00:00.000Z",
    });
    // Three independently load-bearing filters:
    //   eq(status,'pending')   -> without it the sweep cancels PAID orders
    //                             wholesale, every night, forever;
    //   is(booking_id, null)   -> without it it reaps booking add-on orders the
    //                             booking flow owns. `.is` and `.eq` are
    //                             different PostgREST predicates for null,
    //                             which is why the harness buckets them apart;
    //   lt(created_at, cutoff) -> without it it cancels the checkout the buyer
    //                             has open in front of them right now.
    expect(upd.filters.status).toBe("pending");
    expect(upd.isFilters).toEqual({ booking_id: null });
    expect(upd.ltFilters).toEqual({ created_at: "2026-07-31T12:00:00.000Z" });

    expect(mockWriteAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "goods_orders_expired",
        details: expect.objectContaining({
          count: 2,
          standalone: true,
          via: "cron_sweep",
        }),
      }),
    );
  });

  it("honours an injected maxAgeHours", async () => {
    queue("orders:update", { data: [] });

    await sweepStalePendingStandaloneOrders({ now: NOW, maxAgeHours: 1 });
    // Fails if the option is ignored (would read 07-31T12:00) or if the unit is
    // wrong: minutes would give 11:59, days 07-31T12:00. All distinguishable.
    expect(onlyOrdersUpdate().ltFilters.created_at).toBe(
      "2026-08-01T11:00:00.000Z",
    );
  });

  it("an empty sweep writes no audit row", async () => {
    queue("orders:update", { data: [] });

    const r = await sweepStalePendingStandaloneOrders({ now: NOW });
    expect(r).toEqual({ cancelled: 0 });
    // Fails if the `if (cancelled > 0)` guard goes: a nightly count-0 audit row
    // buries the runs that actually cancelled something.
    expect(mockWriteAudit).not.toHaveBeenCalled();
  });

  it("a failed sweep reports zero, captures, and audits nothing", async () => {
    // Rows AND an error together. PostgREST would not really send both; the
    // harness does it deliberately so the error branch is OBSERVABLE. Replying
    // {data: null, error} instead would give cancelled 0 down either path and
    // the assertion below would be vacuous. With a row present, deleting the
    // `if (error)` check makes the code fall through to length 1 and write an
    // audit row claiming a cancellation that never happened.
    queue("orders:update", {
      data: [{ id: "o1" }],
      error: { code: "42501", message: "permission denied for table orders" },
    });

    const r = await sweepStalePendingStandaloneOrders({ now: NOW });
    expect(r).toEqual({ cancelled: 0 });
    expect(mockWriteAudit).not.toHaveBeenCalled();
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({ code: "42501" }),
      expect.objectContaining({
        tags: { action: "standalone_pending_order_sweep" },
      }),
    );
  });
});
