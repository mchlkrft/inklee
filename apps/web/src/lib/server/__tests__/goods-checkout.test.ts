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
  flags: { goodsCommerce: true },
}));

vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));
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
};
let ops: RecordedOp[] = [];

function makeChain(op: RecordedOp) {
  const key = `${op.table}:${op.verb}`;
  const chain = {
    eq: (column: string, value: unknown) => {
      op.filters[column] = value;
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
    select: () => {
      const op: RecordedOp = {
        table,
        verb: "select",
        payload: null,
        filters: {},
      };
      ops.push(op);
      return makeChain(op);
    },
    insert: (payload: unknown) => {
      const op: RecordedOp = { table, verb: "insert", payload, filters: {} };
      ops.push(op);
      return makeChain(op);
    },
    update: (payload: unknown) => {
      const op: RecordedOp = { table, verb: "update", payload, filters: {} };
      ops.push(op);
      return makeChain(op);
    },
    delete: () => {
      const op: RecordedOp = {
        table,
        verb: "delete",
        payload: null,
        filters: {},
      };
      ops.push(op);
      return makeChain(op);
    },
  }));
});

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
