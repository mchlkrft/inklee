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
    paymentIntents: { create: vi.fn(), cancel: vi.fn(), retrieve: vi.fn() },
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
// Partial mock: isGoodsCommerceEnabled is the controllable park switch, but
// shopCheckoutEnabled must stay the REAL pure function — the S2 toggle tests
// below exercise it through the profiles:select mock data, not a stub.
vi.mock("@/lib/features", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/features")>();
  return {
    ...actual,
    isGoodsCommerceEnabled: () => flags.goodsCommerce,
  };
});
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
vi.mock("@/lib/order-fulfillment", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/order-fulfillment")>()),
  // The stock MOVER is mocked; the expansion rule (expandInventoryMovements,
  // SHOP-FUL-001) stays REAL so its line classification is under test here.
  // Product-only fixtures pass through it without any DB read.
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
  /** `.in(col, values)` — a third bucket, because the bundle catalog read's
   *  `in("id", ids)` is the only thing scoping it to the ids the buyer actually
   *  selected, and an unrecorded `.in` would let that assertion be vacuous. */
  inFilters: Record<string, unknown>;
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
    inFilters: {},
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
    in: (column: string, values: unknown) => {
      op.inFilters[column] = values;
      return chain;
    },
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

// --- Bundle fixtures (C4 / GC6) ---------------------------------------------
// The bundle is priced BELOW its parts on purpose: 40.00 against components
// listing at 30.00 + 2 x 11.00 = 52.00. Every money assertion below therefore
// distinguishes "charged the bundle price" from "charged the components' sum",
// which two identical numbers could not.

const CATALOG_ROW_2 = {
  id: "p2",
  title: "Tee",
  price_amount: 11,
  currency: "eur",
  status: "active",
  quantity: 10,
  available_from: null,
  preorder: false,
  product_variants: [],
};

const BUNDLE_ROW = {
  id: "b1",
  name: "Starter kit",
  price_amount: 40,
  currency: "eur",
  is_public_visible: true,
  archived_at: null,
};

const BUNDLE_ITEM_ROWS = [
  { bundle_id: "b1", product_id: "p1", quantity: 1 },
  { bundle_id: "b1", product_id: "p2", quantity: 2 },
];

/** An explicit per-feature entitlement override, so the gate's answer does not
 *  depend on which features the free/plus baselines happen to carry today. */
const BUNDLES_ENTITLED = { entitlementOverrides: { goods_bundles: true } };
const BUNDLES_BLOCKED = { entitlementOverrides: { goods_bundles: false } };

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

  // Decision S2 (Plus build C5): the artist's own standalone-shop toggle,
  // re-checked on the money path itself (SHOP-VIS-001 lesson: a page filter
  // never protects the money path). The page and the action both check this
  // too, but this core is the authority.
  describe("shop_checkout toggle (S2)", () => {
    it("refuses BEFORE any order insert when the artist turned shop_checkout off", async () => {
      queue("profiles:select", {
        data: { settings: { features: { shop_checkout: false } } },
      });
      // Nothing past the gate should be queued/consumed: if the gate were
      // deleted, the happy path below would carry the order through and this
      // test would still see r.ok === true.
      const r = await createStandaloneGoodsCheckoutCore(INPUT);
      expect(r).toEqual({
        ok: false,
        error: "The shop isn't taking card orders yet.",
      });
      expect(
        ops.find((o) => o.table === "products" && o.verb === "select"),
      ).toBeUndefined();
      expect(
        ops.find((o) => o.table === "orders" && o.verb === "insert"),
      ).toBeUndefined();
    });

    it("refuses when the whole goods module is off, even if shop_checkout itself is untouched", async () => {
      queue("profiles:select", {
        data: { settings: { features: { goods_module: false } } },
      });
      const r = await createStandaloneGoodsCheckoutCore(INPUT);
      expect(r.ok).toBe(false);
      expect(
        ops.find((o) => o.table === "orders" && o.verb === "insert"),
      ).toBeUndefined();
    });

    it("fails CLOSED on a genuine profile-settings read error (money rule)", async () => {
      queue("profiles:select", {
        data: null,
        error: { code: "42501", message: "permission denied" },
      });
      const r = await createStandaloneGoodsCheckoutCore(INPUT);
      expect(r).toEqual({
        ok: false,
        error: "Couldn't prepare the order. Try again.",
      });
      expect(
        ops.find((o) => o.table === "orders" && o.verb === "insert"),
      ).toBeUndefined();
    });

    it("proceeds when the artist explicitly left shop_checkout on", async () => {
      queue("profiles:select", {
        data: { settings: { features: { shop_checkout: true } } },
      });
      queueHappyPath();
      const r = await createStandaloneGoodsCheckoutCore(INPUT);
      expect(r.ok).toBe(true);
    });

    it("defaults ON for an artist who has never touched the toggle (no settings row, no error)", async () => {
      // No profiles:select queued at all: the mock's default reply is
      // { data: null, error: null } — a legitimately empty/missing settings
      // row, NOT a read failure. Every other test in this file relies on this
      // exact default to keep working after the gate was added, so this test
      // pins that it is intentional, not an accident of the mock.
      queueHappyPath();
      const r = await createStandaloneGoodsCheckoutCore(INPUT);
      expect(r.ok).toBe(true);
    });
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
// PAYABLE BUNDLES (C4, decision GC6). A bundle is ONE first-class order line at
// the BUNDLE price, plus a sale-time composition snapshot that fulfilment, the
// refund restock and the product-deletion guard all read instead of the live
// join. Everything here is on the money path through serviceClient, where RLS
// never applies, so the resolver's own filters are the only protection.

describe("createStandaloneGoodsCheckoutCore: bundle lines (GC6)", () => {
  beforeEach(() => {
    mockOverrides.mockResolvedValue(BUNDLES_ENTITLED);
  });

  function queueBundleHappyPath() {
    queue("products:select", { data: [CATALOG_ROW, CATALOG_ROW_2] });
    queue("product_bundles:select", { data: [BUNDLE_ROW] });
    queue("product_bundle_items:select", { data: BUNDLE_ITEM_ROWS });
    queue("orders:insert", { data: { id: "o1" } });
    queue("order_items:insert", { data: null }); // product lines
    queue("order_items:insert", {
      data: [{ id: "oi-b1", bundle_id: "b1" }], // bundle lines, .select("id, bundle_id")
    });
    queue("order_item_bundle_components:insert", { data: null });
    queue("orders:update", { data: null });
  }

  const MIXED_INPUT = {
    ...INPUT,
    bundles: [{ bundleId: "b1", quantity: 2 }],
  };

  it("charges product gross + the BUNDLE price x quantity, never the components' sum", async () => {
    queueBundleHappyPath();

    const r = await createStandaloneGoodsCheckoutCore(MIXED_INPUT);

    // 2 x 30.00 product = 60.00, plus 2 x 40.00 bundle = 80.00 -> 140.00.
    // MUTANT KILLED (fee/charge on the components' sum): pricing the bundle
    // from its parts would give 2 x 52.00 = 104.00 and a 164.00 total. B2/GC6
    // say the artist's own bundle price is the price, full stop.
    // MUTANT KILLED (bundle gross dropped from goodsGrossMinor): 6000.
    expect(r).toEqual({
      ok: true,
      orderId: "o1",
      clientSecret: "secret_1",
      totalMinor: 14000,
      currency: "eur",
    });
    expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 14000 }),
      expect.anything(),
    );

    const orderInsert = ops.find(
      (o) => o.table === "orders" && o.verb === "insert",
    );
    expect(orderInsert!.payload).toMatchObject({
      goods_amount: 140, // product 60 + bundle 80, both in the goods lane
      subtotal_amount: 140,
    });
  });

  it("writes ONE 'bundle' order item at the bundle price, with its bundle_id", async () => {
    queueBundleHappyPath();
    await createStandaloneGoodsCheckoutCore(MIXED_INPUT);

    const inserts = ops.filter(
      (o) => o.table === "order_items" && o.verb === "insert",
    );
    // Two inserts: the product lines, then the bundle lines. Fails if bundles
    // are folded into the product insert, which would lose the `.select("id,
    // bundle_id")` the snapshot rows are keyed on.
    expect(inserts).toHaveLength(2);

    const bundleRows = inserts[1]!.payload as Record<string, unknown>[];
    expect(bundleRows).toHaveLength(1);
    expect(bundleRows[0]).toEqual({
      order_id: "o1",
      // type 'bundle', not 'product': goodsBaseMinorFromLines counts both, but
      // expandInventoryMovements and the refund restock branch on this value,
      // and a bundle mislabelled 'product' would try to move stock on a line
      // with no product_id and silently move nothing.
      type: "bundle",
      product_id: null,
      variant_id: null,
      bundle_id: "b1",
      title_snapshot: "Starter kit",
      variant_snapshot: null,
      quantity: 2,
      unit_amount: 40, // the bundle price, not 52
      total_amount: 80,
      currency: "eur",
    });
  });

  it("snapshots the composition with PER-BUNDLE quantities and component list prices", async () => {
    queueBundleHappyPath();
    await createStandaloneGoodsCheckoutCore(MIXED_INPUT);

    const snap = ops.find(
      (o) => o.table === "order_item_bundle_components" && o.verb === "insert",
    );
    expect(snap).toBeDefined();
    // Quantities are per ONE bundle (1 and 2), NOT already multiplied by the
    // line quantity of 2. That division of labour is load-bearing:
    // expandInventoryMovements multiplies by the line quantity at fulfilment
    // time, so pre-multiplying here would decrement 2 and 8 instead of 2 and 4
    // — a double-count that only shows up as stock drift after real sales.
    expect(snap!.payload).toEqual([
      {
        order_item_id: "oi-b1",
        product_id: "p1",
        title_snapshot: "Print",
        quantity: 1,
        unit_list_price: 30,
      },
      {
        order_item_id: "oi-b1",
        product_id: "p2",
        title_snapshot: "Tee",
        quantity: 2,
        unit_list_price: 11,
      },
    ]);
  });

  // SHOP-VIS-001, applied to bundles. The same lesson as the product catalog
  // read one describe up: this read feeds the MONEY path through serviceClient
  // where RLS never applies, so these filters are the only thing between a
  // crafted `bundles` payload and an offer the artist has hidden, archived, or
  // never owned.
  it("SHOP-VIS-001: the bundle read is scoped to this artist's VISIBLE, unarchived, EUR bundles", async () => {
    queueBundleHappyPath();
    const r = await createStandaloneGoodsCheckoutCore(MIXED_INPUT);
    expect(r.ok).toBe(true);

    const bundleRead = ops.find(
      (o) => o.table === "product_bundles" && o.verb === "select",
    );
    expect(bundleRead).toBeDefined();
    // Exact, not a subset, so deleting ANY one line turns this red. Per line —
    //   artist_id         -> deleting it sells another artist's bundle through
    //                        this artist's Connect account;
    //   is_public_visible -> deleting it sells a bundle the artist has hidden
    //                        (the SHOP-VIS-001 defect itself, one table over);
    //   currency          -> deleting it charges a non-EUR bundle's number as
    //                        if it were EUR, because this path charges EUR
    //                        unconditionally.
    expect(bundleRead!.filters).toEqual({
      artist_id: "a1",
      is_public_visible: true,
      currency: "eur",
    });
    // `.is(archived_at, null)`, not `.eq`: they are different PostgREST
    // predicates for null, and only `.is` excludes archived offers.
    expect(bundleRead!.isFilters).toEqual({ archived_at: null });
    // Scoped to the ids the buyer selected.
    expect(bundleRead!.inFilters).toEqual({ id: ["b1"] });

    // The composition read is artist-scoped too: without it a crafted payload
    // could pull another artist's bundle_items into this order's snapshot.
    const itemsRead = ops.find(
      (o) => o.table === "product_bundle_items" && o.verb === "select",
    );
    expect(itemsRead!.filters).toEqual({ artist_id: "a1" });
    expect(itemsRead!.inFilters).toEqual({ bundle_id: ["b1"] });
  });

  it("refuses when the artist is not entitled to bundles", async () => {
    mockOverrides.mockResolvedValue(BUNDLES_BLOCKED);
    queueBundleHappyPath();

    const r = await createStandaloneGoodsCheckoutCore(MIXED_INPUT);

    expect(r).toEqual({
      ok: false,
      error: "That bundle isn't available right now.",
    });
    // The gate runs BEFORE the reads: a blocked artist's bundle catalog is
    // never even looked at. Fails if the gate is deleted, because the queued
    // rows would then be consumed and the order would go through.
    expect(ops.find((o) => o.table === "product_bundles")).toBeUndefined();
    expect(
      ops.find((o) => o.table === "orders" && o.verb === "insert"),
    ).toBeUndefined();
  });

  it("fails CLOSED when the plan read blows up (money rule)", async () => {
    mockOverrides.mockRejectedValue(new Error("plan read down"));
    queueBundleHappyPath();

    const r = await createStandaloneGoodsCheckoutCore(MIXED_INPUT);
    expect(r).toEqual({
      ok: false,
      error: "Couldn't prepare the order. Try again.",
    });

    // The discriminator. The fee block LATER catches the same throw and returns
    // the SAME string, so asserting only on the message would pass with the
    // bundle gate's try/catch deleted. What separates them is how far the code
    // got: with the gate present the bundle catalog is never read.
    expect(ops.find((o) => o.table === "product_bundles")).toBeUndefined();
    expect(
      ops.find((o) => o.table === "orders" && o.verb === "insert"),
    ).toBeUndefined();
  });

  it("aggregates duplicate bundle ids BEFORE the quantity cap", async () => {
    queueBundleHappyPath();

    const r = await createStandaloneGoodsCheckoutCore({
      ...INPUT,
      bundles: [
        { bundleId: "b1", quantity: 6 },
        { bundleId: "b1", quantity: 5 },
      ],
    });

    // 6 + 5 = 11 > MAX_ADDON_QUANTITY (10). Fails if the aggregation is
    // dropped, or moved after the cap check: two entries of 6 and 5 each pass a
    // per-entry cap and the buyer walks away with 11 bundles, which is also 11
    // bundles' worth of stock the artist may not have.
    expect(r).toEqual({
      ok: false,
      error: "You can add at most 10 of a bundle.",
    });
    expect(
      ops.find((o) => o.table === "orders" && o.verb === "insert"),
    ).toBeUndefined();
  });

  it("refuses a bundle whose component is short on stock, and writes no order", async () => {
    queue("products:select", {
      // p2 has ONE in stock; the bundle needs 2 per bundle x 2 bundles = 4.
      data: [CATALOG_ROW, { ...CATALOG_ROW_2, quantity: 1 }],
    });
    queue("product_bundles:select", { data: [BUNDLE_ROW] });
    queue("product_bundle_items:select", { data: BUNDLE_ITEM_ROWS });

    const r = await createStandaloneGoodsCheckoutCore(MIXED_INPUT);

    // The named bundle, so the buyer knows which offer failed. Fails if
    // bundlePurchasable's verdict is ignored, which would sell a bundle the
    // artist cannot fulfil whole.
    expect(r).toEqual({
      ok: false,
      error: 'Not enough stock for "Starter kit".',
    });
    expect(
      ops.find((o) => o.table === "orders" && o.verb === "insert"),
    ).toBeUndefined();
    expect(mockStripe.paymentIntents.create).not.toHaveBeenCalled();
  });

  it("refuses a bundle whose component is not in the sellable catalog", async () => {
    queue("products:select", { data: [CATALOG_ROW] }); // p2 hidden/archived
    queue("product_bundles:select", { data: [BUNDLE_ROW] });
    queue("product_bundle_items:select", { data: BUNDLE_ITEM_ROWS });

    const r = await createStandaloneGoodsCheckoutCore(MIXED_INPUT);

    // The editor legitimately allows a hidden product inside a bundle. The
    // checkout's answer is "refuse", never "sell it short" — a buyer paying
    // 40.00 for a two-item kit must not receive one item.
    expect(r).toEqual({
      ok: false,
      error: "Part of that bundle isn't available right now.",
    });
    expect(
      ops.find((o) => o.table === "orders" && o.verb === "insert"),
    ).toBeUndefined();
  });

  it("refuses an unknown, hidden, archived or non-EUR bundle with one answer", async () => {
    queue("products:select", { data: [CATALOG_ROW, CATALOG_ROW_2] });
    queue("product_bundles:select", { data: [] }); // filtered out by the read
    queue("product_bundle_items:select", { data: [] });

    const r = await createStandaloneGoodsCheckoutCore(MIXED_INPUT);
    // Deliberately no oracle for WHICH: a buyer must not be able to probe an
    // artist's hidden catalog by reading the refusal.
    expect(r).toEqual({
      ok: false,
      error: "That bundle isn't available right now.",
    });
  });

  it("SHOP-DROP-001: a bundle containing an UNDROPPED product is refused, same as buying it directly", async () => {
    // The component is active, visible and in stock — but its drop has not
    // opened. Direct purchase is refused by productAvailability inside the
    // compositor; the bundle path used to consult only stock, so the bundle
    // was a drop-gate bypass (proven by the round-2 verifier by executing
    // both gates side by side). Year-9999 fixture: deterministic against the
    // ambient clock without injecting one.
    queue("products:select", {
      data: [
        { ...CATALOG_ROW, available_from: "9999-01-01T00:00:00.000Z" },
        CATALOG_ROW_2,
      ],
    });
    queue("product_bundles:select", { data: [BUNDLE_ROW] });
    queue("product_bundle_items:select", { data: BUNDLE_ITEM_ROWS });

    const r = await createStandaloneGoodsCheckoutCore({
      ...INPUT,
      selections: [],
      bundles: [{ bundleId: "b1", quantity: 1 }],
    });

    // Fails if resolveBundleLines drops the productAvailability gate and goes
    // back to stock-only: the bundle resolves, an order row is inserted, and
    // the undropped product is sold through the side door.
    expect(r).toEqual({
      ok: false,
      error: "Part of that bundle isn't available right now.",
    });
    expect(
      ops.find((o) => o.table === "orders" && o.verb === "insert"),
    ).toBeUndefined();
  });

  it("SHOP-VAR-001 (GC7): a bundle containing a VARIANT-bearing product is refused", async () => {
    // A variant-stocked parent has quantity null, which reads as unlimited
    // while decrementInventory moves nothing, and v1 bundles cannot carry a
    // variant choice at all. The same product bought directly REQUIRES a
    // choice in the compositor, so selling it choicelessly inside a bundle
    // sells ambiguous goods and skips the stock ledger.
    queue("products:select", {
      data: [
        {
          ...CATALOG_ROW,
          quantity: null,
          product_variants: [
            {
              id: "v1",
              name: "M",
              price_amount_override: null,
              stock_quantity: 3,
              status: "active",
              sort_order: 0,
            },
          ],
        },
        CATALOG_ROW_2,
      ],
    });
    queue("product_bundles:select", { data: [BUNDLE_ROW] });
    queue("product_bundle_items:select", { data: BUNDLE_ITEM_ROWS });

    const r = await createStandaloneGoodsCheckoutCore({
      ...INPUT,
      selections: [],
      bundles: [{ bundleId: "b1", quantity: 1 }],
    });

    // Fails if the active-variants check is dropped from the component
    // resolution: the bundle sells with no variant chosen and no stock moved
    // (the round-2 verifier executed bundlePurchasable at lineQuantity 99
    // against a null-stock parent and it answered ok).
    expect(r).toEqual({
      ok: false,
      error: "Part of that bundle isn't available right now.",
    });
    expect(
      ops.find((o) => o.table === "orders" && o.verb === "insert"),
    ).toBeUndefined();
  });

  it("rolls the whole order back when the composition snapshot fails to write", async () => {
    queue("products:select", { data: [CATALOG_ROW, CATALOG_ROW_2] });
    queue("product_bundles:select", { data: [BUNDLE_ROW] });
    queue("product_bundle_items:select", { data: BUNDLE_ITEM_ROWS });
    queue("orders:insert", { data: { id: "o1" } });
    queue("order_items:insert", { data: null });
    queue("order_items:insert", { data: [{ id: "oi-b1", bundle_id: "b1" }] });
    queue("order_item_bundle_components:insert", {
      error: { code: "23503", message: "insert or update violates fk" },
    });

    const r = await createStandaloneGoodsCheckoutCore(MIXED_INPUT);

    // Without the snapshot the sale is unfulfillable: settlement would find no
    // components, move no stock, and the refund would restock nothing. Fails if
    // the rollback is downgraded to a Sentry capture that lets the order stand.
    expect(r).toEqual({
      ok: false,
      error: "Couldn't save the items. Try again.",
    });
    const del = ops.find((o) => o.table === "orders" && o.verb === "delete");
    expect(del).toBeDefined();
    expect(del!.filters.id).toBe("o1");
    // And no money was ever asked for.
    expect(mockStripe.paymentIntents.create).not.toHaveBeenCalled();
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tags: { action: "standalone_goods_bundle_snapshot" },
      }),
    );
  });

  it("a BUNDLE-ONLY order is a real order, not an empty basket", async () => {
    queue("products:select", { data: [CATALOG_ROW, CATALOG_ROW_2] });
    queue("product_bundles:select", { data: [BUNDLE_ROW] });
    queue("product_bundle_items:select", { data: BUNDLE_ITEM_ROWS });
    queue("orders:insert", { data: { id: "o1" } });
    queue("order_items:insert", { data: [{ id: "oi-b1", bundle_id: "b1" }] });
    queue("order_item_bundle_components:insert", { data: null });
    queue("orders:update", { data: null });

    const r = await createStandaloneGoodsCheckoutCore({
      ...INPUT,
      selections: [],
      bundles: [{ bundleId: "b1", quantity: 1 }],
    });

    // Fails if the empty-basket guard forgets bundles (`computed.lines.length
    // === 0` alone): buying only a bundle would be refused with "Pick something
    // to buy first", which is the entire feature not working.
    expect(r).toMatchObject({ ok: true, totalMinor: 4000 });
    // Only ONE order_items insert here: the product branch is skipped.
    expect(
      ops.filter((o) => o.table === "order_items" && o.verb === "insert"),
    ).toHaveLength(1);
  });

  // TEST-VAC-003, one table over. The v1 goods rate is 0%, so a bundle line
  // wrongly excluded from the fee base, or a fee taken on the gross instead of
  // the discounted subtotal, produces application_fee_amount: 0 either way and
  // is completely invisible on the intent. The engine stays REAL and the spy
  // records only what the checkout HANDED it, which is the one observable that
  // separates the two.
  it("bases the fee on the DISCOUNTED product + bundle subtotal", async () => {
    queueBundleHappyPath();
    mockResolveDiscount.mockResolvedValue({
      codeId: "dc1",
      discountMinor: 1500,
      error: null,
    });

    const r = await createStandaloneGoodsCheckoutCore({
      ...MIXED_INPUT,
      discountCode: "SUMMER25",
    });

    // The code is thresholded against the FULL goods gross, bundles included.
    // Fails if the bundle gross is left out: a min_subtotal_minor of, say,
    // 100.00 would reject a code on a 140.00 order.
    expect(mockResolveDiscount).toHaveBeenCalledWith(
      expect.objectContaining({ subtotalMinor: 14000 }),
    );
    expect(r).toMatchObject({ ok: true, totalMinor: 12500 });

    // MUTANT KILLED (bundle line dropped from goodsBaseMinorFromLines): 4500.
    // MUTANT KILLED (fee on the gross): 14000.
    // MUTANT KILLED (bundle priced from its components): 8500.
    expect(mockComputeOrderFees).toHaveBeenCalledTimes(1);
    expect(mockComputeOrderFees).toHaveBeenCalledWith({
      appointmentBaseMinor: 0,
      goodsBaseMinor: 12500,
      tier: "free",
    });
  });

  it("ignores zero, negative and idless bundle entries without touching the gate", async () => {
    queueHappyPath();

    const r = await createStandaloneGoodsCheckoutCore({
      ...INPUT,
      bundles: [
        { bundleId: "b1", quantity: 0 },
        { bundleId: "b1", quantity: -3 },
        { bundleId: "", quantity: 2 },
      ],
    });

    // A payload of nothing resolves to no bundle lines and the product-only
    // order goes through untouched, with no bundle read at all. Fails if the
    // sanitising `add <= 0` / `!s.bundleId` filter goes: a negative quantity
    // would reach the aggregate and subtract from a real line's total.
    expect(r).toMatchObject({ ok: true, totalMinor: 6000 });
    expect(ops.find((o) => o.table === "product_bundles")).toBeUndefined();
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
// Settlement of an order carrying a bundle line (C4 / GC6). expandInventoryMovements
// is REAL here (only the stock MOVER is mocked), so these exercise the shipped
// classification rule end to end: the paid flip reads the lines, the expansion
// turns the bundle into its snapshot components, and only then does stock move.

const BUNDLE_PAID_LINE = {
  id: "oi-b1",
  bundle_id: "b1",
  product_id: null,
  variant_id: null,
  quantity: 2,
  type: "bundle",
  title_snapshot: "Starter kit",
  variant_snapshot: null,
  total_amount: 80,
};

function queuePaidBundleOrder() {
  queue("orders:update", {
    data: [
      {
        id: "o1",
        artist_id: "a1",
        client_email: null, // no receipt: keeps this test on the inventory path
        discount_code_id: null,
        discount_amount: 0,
      },
    ],
  });
  queue("order_items:select", { data: [PAID_ITEMS[0], BUNDLE_PAID_LINE] });
}

describe("settleStandaloneGoodsOrder: bundle inventory (SHOP-FUL-001)", () => {
  it("decrements the bundle's SNAPSHOT components, multiplied by the line quantity", async () => {
    queuePaidBundleOrder();
    queue("order_item_bundle_components:select", {
      data: [
        { product_id: "p1", title_snapshot: "Print", quantity: 1 },
        { product_id: "p2", title_snapshot: "Tee", quantity: 2 },
      ],
    });

    const settled = await settleStandaloneGoodsOrder(makeIntent());
    expect(settled).toBe(true);

    // MUTANT KILLED (settlement hands `items` straight to decrementInventory,
    // skipping the expansion): the mover would receive the raw bundle line,
    // whose product_id and variant_id are both null, take neither branch and
    // move NO stock at all — a bundle sale that silently never decrements. That
    // is exactly the pre-GC6 hole, and it is invisible without this assertion
    // because decrementInventory reports nothing.
    // MUTANT KILLED (component quantity not multiplied by the line quantity):
    // 1 and 2 instead of 2 and 4.
    expect(mockDecrement).toHaveBeenCalledTimes(1);
    expect(mockDecrement).toHaveBeenCalledWith([
      PAID_ITEMS[0], // the product line, unchanged
      {
        product_id: "p1",
        variant_id: null,
        quantity: 2, // 1 per bundle x 2 bundles
        type: "product",
        title_snapshot: "Print",
        variant_snapshot: null,
        total_amount: 0,
      },
      {
        product_id: "p2",
        variant_id: null,
        quantity: 4, // 2 per bundle x 2 bundles
        type: "product",
        title_snapshot: "Tee",
        variant_snapshot: null,
        total_amount: 0,
      },
    ]);

    // Read from the snapshot for THIS order item, never the live join.
    const snapRead = ops.find(
      (o) => o.table === "order_item_bundle_components" && o.verb === "select",
    );
    expect(snapRead!.filters).toEqual({ order_item_id: "oi-b1" });
  });

  it("SHOP-FUL-003: a failed snapshot read returns false WITHOUT consuming the paid flip", async () => {
    queuePaidBundleOrder();
    queue("order_item_bundle_components:select", {
      data: null,
      error: { code: "42501", message: "permission denied" },
    });

    const settled = await settleStandaloneGoodsOrder(makeIntent());

    // The posture changed with SHOP-FUL-003 (round-2 verifier): reads +
    // expansion now run BEFORE the once-only paid flip, exactly like the
    // refund side's SHOP-FUL-002 fix. The old shape (expansion after the flip
    // in a catch that kept settled=true) meant a paid bundle order silently
    // skipped its inventory decrement forever: an oversell observable only in
    // Sentry. Fails if the expansion moves back below the flip: the orders
    // update is recorded here, the gate is consumed, and the decrement is
    // lost with no retry path.
    expect(settled).toBe(false);
    expect(
      ops.find((o) => o.table === "orders" && o.verb === "update"),
    ).toBeUndefined();
    expect(mockDecrement).not.toHaveBeenCalled();
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("oi-b1"),
      }),
      expect.objectContaining({
        tags: { action: "standalone_goods_inventory" },
      }),
    );
    // Nothing downstream of the flip ran: no audit, no receipt, no
    // redemption. The order is still pending; a redelivery or the
    // reconciliation backstop can settle it whole.
    expect(mockWriteAudit).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("the buyer's receipt lists the bundle line", async () => {
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
    queue("order_items:select", { data: [BUNDLE_PAID_LINE] });
    queue("order_item_bundle_components:select", { data: [] });
    queue("profiles:select", { data: { display_name: "Mika Ink" } });

    await settleStandaloneGoodsOrder(makeIntent());

    // Fails if the receipt's line filter stays product-only: a buyer who bought
    // one bundle would receive a receipt whose item list is empty.
    const html = mockSendEmail.mock.calls[0]![0].html as string;
    expect(html).toContain("- Starter kit x 2");
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

  // Intent-aware since SHOP-ORD-002 (round-2 verifier): the sweep SELECTS the
  // stale rows, resolves each row's PaymentIntent on Stripe, and only then
  // touches the order. Cancelling only the row would leave a live payable
  // intent whose late success settles nothing: money captured against a
  // cancelled order, invisible to everyone.

  function sweepSelectOp(): RecordedOp {
    const sel = ops.find((o) => o.table === "orders" && o.verb === "select");
    expect(sel).toBeDefined();
    return sel!;
  }

  it("cancels a stale order with NO intent id directly, pinning all three scope predicates", async () => {
    queue("orders:select", {
      data: [{ id: "o1", stripe_payment_intent_id: null }],
    });
    queue("orders:update", { data: { id: "o1" } });

    const r = await sweepStalePendingStandaloneOrders({ now: NOW });
    expect(r).toEqual({ cancelled: 1, settled: 0, skipped: 0 });

    // Three independently load-bearing filters, now on the SELECT:
    //   eq(status,'pending')   -> without it the sweep processes PAID orders
    //                             wholesale, every night, forever;
    //   is(booking_id, null)   -> without it it reaps booking add-on orders the
    //                             booking flow owns. `.is` and `.eq` are
    //                             different PostgREST predicates for null,
    //                             which is why the harness buckets them apart;
    //   lt(created_at, cutoff) -> without it it processes the checkout the
    //                             buyer has open in front of them right now.
    const sel = sweepSelectOp();
    expect(sel.filters.status).toBe("pending");
    expect(sel.isFilters).toEqual({ booking_id: null });
    expect(sel.ltFilters).toEqual({ created_at: "2026-07-31T12:00:00.000Z" });

    // The row flip is itself pending-gated (a concurrent payment between the
    // select and the update must win).
    const upd = onlyOrdersUpdate();
    expect(upd.payload).toMatchObject({ status: "cancelled" });
    expect(upd.filters).toMatchObject({ id: "o1", status: "pending" });

    // No intent existed, so Stripe was never touched.
    expect(mockStripe.paymentIntents.retrieve).not.toHaveBeenCalled();
    expect(mockStripe.paymentIntents.cancel).not.toHaveBeenCalled();

    expect(mockWriteAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "goods_orders_expired",
        details: expect.objectContaining({
          count: 1,
          settled_late: 0,
          standalone: true,
          via: "cron_sweep",
        }),
      }),
    );
  });

  it("honours an injected maxAgeHours", async () => {
    queue("orders:select", { data: [] });

    await sweepStalePendingStandaloneOrders({ now: NOW, maxAgeHours: 1 });
    // Fails if the option is ignored (would read 07-31T12:00) or if the unit is
    // wrong: minutes would give 11:59, days 07-31T12:00. All distinguishable.
    expect(sweepSelectOp().ltFilters.created_at).toBe(
      "2026-08-01T11:00:00.000Z",
    );
  });

  it("SHOP-ORD-002: a cancelable intent is cancelled ON STRIPE and then the order row", async () => {
    queue("orders:select", {
      data: [{ id: "o1", stripe_payment_intent_id: "pi_1" }],
    });
    mockStripe.paymentIntents.retrieve.mockResolvedValue({
      id: "pi_1",
      status: "requires_payment_method",
    });
    queue("orders:update", { data: { id: "o1" } });

    const r = await sweepStalePendingStandaloneOrders({ now: NOW });
    expect(r).toEqual({ cancelled: 1, settled: 0, skipped: 0 });

    // THE point of SHOP-ORD-002: the buyer's client secret must die with the
    // order. Fails if the sweep goes back to cancelling only the row: the
    // intent stays payable, a next-day payment is captured against a
    // cancelled order, and the webhook's pending-gated flip makes the money
    // invisible to everyone.
    expect(mockStripe.paymentIntents.cancel).toHaveBeenCalledWith("pi_1");
    expect(onlyOrdersUpdate().payload).toMatchObject({ status: "cancelled" });
  });

  it("SHOP-ORD-002: an already-canceled intent skips the Stripe cancel but still cancels the row", async () => {
    queue("orders:select", {
      data: [{ id: "o1", stripe_payment_intent_id: "pi_1" }],
    });
    mockStripe.paymentIntents.retrieve.mockResolvedValue({
      id: "pi_1",
      status: "canceled",
    });
    queue("orders:update", { data: { id: "o1" } });

    const r = await sweepStalePendingStandaloneOrders({ now: NOW });
    expect(r).toEqual({ cancelled: 1, settled: 0, skipped: 0 });
    expect(mockStripe.paymentIntents.cancel).not.toHaveBeenCalled();
  });

  it("SHOP-ORD-002: a SUCCEEDED intent settles the order instead of cancelling it (lost-webhook recovery)", async () => {
    queue("orders:select", {
      data: [{ id: "o1", stripe_payment_intent_id: "pi_1" }],
    });
    mockStripe.paymentIntents.retrieve.mockResolvedValue({
      id: "pi_1",
      status: "succeeded",
      amount: 5000,
      amount_received: 5000,
      metadata: { order_id: "o1", artist_id: "a1", standalone_goods: "1" },
    });
    // settleStandaloneGoodsOrder's own chain: pre-flip items read (empty is
    // fine), then the pending->paid flip.
    queue("order_items:select", { data: [] });
    queue("orders:update", {
      data: [
        {
          id: "o1",
          artist_id: "a1",
          client_email: null,
          discount_code_id: null,
          discount_amount: 0,
        },
      ],
    });

    const r = await sweepStalePendingStandaloneOrders({ now: NOW });
    expect(r).toEqual({ cancelled: 0, settled: 1, skipped: 0 });

    // The order was PAID, never cancelled — the sweep converged a lost
    // webhook instead of destroying a real sale. Fails if the succeeded
    // branch is removed: the intent gets a cancel attempt and the order row
    // a 'cancelled' write.
    expect(mockStripe.paymentIntents.cancel).not.toHaveBeenCalled();
    expect(onlyOrdersUpdate().payload).toMatchObject({ status: "paid" });
    expect(mockWriteAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "goods_orders_expired",
        details: expect.objectContaining({ count: 0, settled_late: 1 }),
      }),
    );
  });

  it("a PROCESSING intent is left alone this round", async () => {
    queue("orders:select", {
      data: [{ id: "o1", stripe_payment_intent_id: "pi_1" }],
    });
    mockStripe.paymentIntents.retrieve.mockResolvedValue({
      id: "pi_1",
      status: "processing",
    });

    const r = await sweepStalePendingStandaloneOrders({ now: NOW });
    // A decision either way races the processor; skipping costs one more day.
    expect(r).toEqual({ cancelled: 0, settled: 0, skipped: 1 });
    expect(mockStripe.paymentIntents.cancel).not.toHaveBeenCalled();
    expect(
      ops.find((o) => o.table === "orders" && o.verb === "update"),
    ).toBeUndefined();
    expect(mockWriteAudit).not.toHaveBeenCalled();
  });

  it("a Stripe failure skips the row for the next run and never touches the order", async () => {
    queue("orders:select", {
      data: [{ id: "o1", stripe_payment_intent_id: "pi_1" }],
    });
    mockStripe.paymentIntents.retrieve.mockRejectedValue(
      new Error("stripe unreachable"),
    );

    const r = await sweepStalePendingStandaloneOrders({ now: NOW });
    // Fails if the catch cancels the order anyway: an order whose intent
    // state is UNKNOWN must not be orphaned from a possibly-payable intent.
    expect(r).toEqual({ cancelled: 0, settled: 0, skipped: 1 });
    expect(
      ops.find((o) => o.table === "orders" && o.verb === "update"),
    ).toBeUndefined();
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "stripe unreachable" }),
      expect.objectContaining({
        tags: { action: "standalone_pending_order_sweep" },
      }),
    );
  });

  it("an empty sweep writes no audit row", async () => {
    queue("orders:select", { data: [] });

    const r = await sweepStalePendingStandaloneOrders({ now: NOW });
    expect(r).toEqual({ cancelled: 0, settled: 0, skipped: 0 });
    // Fails if the `if (cancelled > 0 || settled > 0)` guard goes: a nightly
    // count-0 audit row buries the runs that actually did something.
    expect(mockWriteAudit).not.toHaveBeenCalled();
  });

  it("a failed sweep SELECT reports zeros, captures, and audits nothing", async () => {
    // Rows AND an error together. PostgREST would not really send both; the
    // harness does it deliberately so the error branch is OBSERVABLE. With a
    // row present, deleting the `if (error)` check makes the code fall
    // through to processing a row from a failed read.
    queue("orders:select", {
      data: [{ id: "o1", stripe_payment_intent_id: null }],
      error: { code: "42501", message: "permission denied for table orders" },
    });

    const r = await sweepStalePendingStandaloneOrders({ now: NOW });
    expect(r).toEqual({ cancelled: 0, settled: 0, skipped: 0 });
    expect(mockWriteAudit).not.toHaveBeenCalled();
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({ code: "42501" }),
      expect.objectContaining({
        tags: { action: "standalone_pending_order_sweep" },
      }),
    );
  });
});
