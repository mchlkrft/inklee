import { describe, it, expect, vi, beforeEach } from "vitest";
import type Stripe from "stripe";

// `payment_intent.succeeded` at the ROUTE level. Two properties live here and
// nowhere else, and both were unpinned before this file existed:
//
//  1. TEST-VAC-007 / FEE-STP-001 — the deposit flip stamps the fee schedule
//     version and tier read from the INTENT'S OWN metadata (what the artist
//     was quoted at request time), falling back to the active schedule only
//     for an intent created before the stamp existed. The round-3 verifier
//     reverted this to the settlement-time `ACTIVE_FEE_SCHEDULE_VERSION` read
//     and the whole suite stayed green: mutation b2 survived because only one
//     test file in the repo imported this route at all.
//
//  2. SHOP-FUL-005 — the standalone-goods branch maps the settle outcome onto
//     HTTP, and the HTTP CODE is the retry decision. A `refused` answered 200
//     abandons a pre-flip failure to the daily sweep with the money already
//     captured; an `already` answered 500 puts a settled order on Stripe's
//     retry ladder forever. The mapping is a route concern: a function-level
//     test of settleStandaloneGoodsOrder cannot see either mistake.
//
// Harness follows payment-intent-canceled.test.ts: the `stripe` package is
// replaced with a double whose constructEvent parses the body, and every route
// import is mocked. `@inklee/shared/fee-schedule` stays REAL, deliberately —
// ACTIVE_FEE_SCHEDULE_VERSION is the fallback under test and stubbing it would
// let the assertion agree with itself.

const {
  mockServiceClient,
  mockGetUserById,
  mockSettleStandalone,
  mockSettlePaymentRequestSuccess,
  mockCaptureMessage,
} = vi.hoisted(() => ({
  mockServiceClient: { from: vi.fn(), rpc: vi.fn(), auth: { admin: {} } },
  mockGetUserById: vi.fn(),
  mockSettleStandalone: vi.fn(),
  mockSettlePaymentRequestSuccess: vi.fn(),
  mockCaptureMessage: vi.fn(),
}));

vi.mock("stripe", () => {
  class FakeStripe {
    webhooks = {
      // Signature verification is Stripe's, not ours; the event is taken at
      // face value here exactly as in the canceled-dispatch harness.
      constructEvent: (body: string) => JSON.parse(body) as Stripe.Event,
    };
  }
  return { default: FakeStripe };
});

vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  captureMessage: (...a: unknown[]) => mockCaptureMessage(...a),
}));
vi.mock("@/lib/supabase/service", () => ({ serviceClient: mockServiceClient }));
vi.mock("@/lib/server/goods-checkout", () => ({
  settleStandaloneGoodsOrder: (...a: unknown[]) => mockSettleStandalone(...a),
  cancelStandalonePendingOrder: vi.fn(),
}));
vi.mock("@/lib/server/appointment-payment-settlement", () => ({
  settlePaymentRequestSuccess: (...a: unknown[]) =>
    mockSettlePaymentRequestSuccess(...a),
  settlePaymentRequestRefund: vi.fn(),
  settlePaymentRequestDispute: vi.fn(),
  settlePaymentRequestFailure: vi.fn(),
}));
vi.mock("@/lib/server/goods-refund", () => ({
  settleGoodsOrderRefund: vi.fn(),
  resolveDepositRefundAmountMinor: vi.fn(),
}));
vi.mock("@/lib/booking-schema", () => ({ formatSize: vi.fn() }));
vi.mock("@/lib/email/send-booking-email", () => ({
  sendBookingEmail: vi.fn(),
  sendGoodsOrderConfirmation: vi.fn(),
  sendArtistDepositPaidEmail: vi.fn(),
  sendClientDepositReceiptEmail: vi.fn(),
}));
// Returns [] rather than undefined: the route iterates the low-stock hits, so
// a bare vi.fn() would throw inside the order branch and mask the routing
// property the add-on test is actually about.
vi.mock("@/lib/order-fulfillment", () => ({
  decrementInventory: async () => [],
}));
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn() }));
vi.mock("@/lib/server/discounts", () => ({
  recordDiscountRedemption: vi.fn(),
}));
vi.mock("@/lib/revalidate-bookings", () => ({
  revalidateBookingViews: vi.fn(),
}));
vi.mock("@/lib/booking-domain", () => ({ customerLabel: () => "A client" }));
vi.mock("@/lib/booking-studio", () => ({ resolveStudioForBooking: vi.fn() }));
vi.mock("@/lib/stripe-connect", () => ({
  clearConnectAccountByExternalId: vi.fn(),
  persistConnectAccountFromEvent: vi.fn(),
}));

import { POST } from "../route";
import { ACTIVE_FEE_SCHEDULE_VERSION } from "@inklee/shared/fee-schedule";

// ---------------------------------------------------------------------------
// Recording Supabase double, keyed replies per table:verb. Same shape as the
// goods-checkout harness: an unqueued read answers {data: null, error: null},
// so `ops` is what distinguishes "the code read and got nothing" from "the
// code never read".

type Reply = { data?: unknown; error?: unknown; count?: number };
let replies: Record<string, Reply[]> = {};
function queue(key: string, ...rs: Reply[]) {
  replies[key] = [...(replies[key] ?? []), ...rs];
}
function nextReply(key: string): Reply {
  const q = replies[key];
  if (q && q.length > 0) return q.shift() as Reply;
  return { data: null, error: null, count: 0 };
}

type RecordedOp = {
  table: string;
  verb: string;
  payload: unknown;
  filters: Record<string, unknown>;
};
let ops: RecordedOp[] = [];

function chain(table: string, verb: string, payload: unknown) {
  const op: RecordedOp = { table, verb, payload, filters: {} };
  ops.push(op);
  const key = `${table}:${verb}`;
  const self = {
    select: () => self,
    eq: (column: string, value: unknown) => {
      op.filters[column] = value;
      return self;
    },
    is: (column: string, value: unknown) => {
      op.filters[column] = value;
      return self;
    },
    contains: () => self,
    single: () => Promise.resolve(nextReply(key)),
    maybeSingle: () => Promise.resolve(nextReply(key)),
    then: (onF?: (v: Reply) => unknown, onR?: (r: unknown) => unknown) =>
      Promise.resolve(nextReply(key)).then(onF, onR),
  };
  return self;
}

const BOOKING_ID = "bk_1";

/** The booking the deposit branch reads. `customer_email: null` on purpose:
 *  it short-circuits the three email fan-outs below the flip, which are not
 *  what this file is about. The flip itself is unaffected. */
const BOOKING_ROW = {
  id: BOOKING_ID,
  status: "deposit_pending",
  customer_email: null,
  customer_handle: "@buyer",
  preferred_date: "2026-09-01",
  form_data: null,
  artist_id: "a1",
  deposit_amount: 50,
  deposit_currency: "eur",
  deposit_payment_intent_id: null,
  deposit_policy_snapshot: null,
};

/** The minimum reply set for one clean deposit settlement: the booking read,
 *  the idempotency count (0 = not seen before), the once-only flip matching
 *  exactly one row, and the artist profile read for the notification copy. */
function queueDepositHappyPath() {
  queue("booking_requests:select", { data: BOOKING_ROW });
  queue("audit_log:select", { count: 0 });
  queue("booking_requests:update", { data: [{ id: BOOKING_ID }], error: null });
  queue("profiles:select", { data: { display_name: "Mika Ink" } });
}

beforeEach(() => {
  vi.clearAllMocks();
  ops = [];
  replies = {};
  process.env.STRIPE_SECRET_KEY = "sk_test_succeeded";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_succeeded";
  mockServiceClient.from.mockImplementation((table: string) => ({
    select: () => chain(table, "select", null),
    insert: (payload: unknown) => chain(table, "insert", payload),
    update: (payload: unknown) => chain(table, "update", payload),
    delete: () => chain(table, "delete", null),
  }));
  mockServiceClient.rpc.mockResolvedValue({ data: 0, error: null });
  mockServiceClient.auth.admin = { getUserById: mockGetUserById };
  // No artist auth email: keeps the run on the flip, off the mail path.
  mockGetUserById.mockResolvedValue({ data: { user: { email: null } } });
});

/** POST a `payment_intent.succeeded` carrying exactly this intent. */
async function postSucceeded(intent: Record<string, unknown>) {
  const event = {
    id: "evt_1",
    type: "payment_intent.succeeded",
    data: { object: { id: "pi_1", currency: "eur", ...intent } },
  };
  const res = await POST(
    new Request("https://inkl.ee/api/stripe/webhook", {
      method: "POST",
      body: JSON.stringify(event),
      headers: { "stripe-signature": "t=1,v1=whatever" },
    }),
  );
  return {
    status: res.status,
    body: (await res.json()) as Record<string, unknown>,
  };
}

/** The single `booking_requests` update op, asserted to be the only one. The
 *  branch writes that table twice on a sponsored deposit, and a `.find()`
 *  would silently pick the wrong one. */
function onlyBookingUpdate(): RecordedOp {
  const updates = ops.filter(
    (o) => o.table === "booking_requests" && o.verb === "update",
  );
  expect(updates).toHaveLength(1);
  return updates[0]!;
}

// ---------------------------------------------------------------------------

describe("payment_intent.succeeded: the deposit fee stamp (FEE-STP-001)", () => {
  it("stamps the version and tier from the INTENT'S metadata, not the active schedule", async () => {
    queueDepositHappyPath();

    // A version that is deliberately NOT the active one. That difference is
    // the entire test: with "fees-v1-2026-07-04" in the metadata — today's
    // active value — a stamp read from the metadata and a stamp read from
    // ACTIVE_FEE_SCHEDULE_VERSION produce the same string and the assertion
    // proves nothing. This is the schedule-flip scenario the fix exists for:
    // an intent quoted under one schedule settling after the flip to another.
    const { status, body } = await postSucceeded({
      amount: 5000,
      metadata: {
        booking_id: BOOKING_ID,
        artist_id: "a1",
        fee_schedule_version: "fees-v2-plus-payments",
        fee_tier: "legacy",
      },
    });
    expect(status).toBe(200);
    expect(body).toEqual({ received: true });

    const flip = onlyBookingUpdate();
    const payload = flip.payload as Record<string, unknown>;

    // MUTANT KILLED (b2, the round-3 survivor): reverting the stamp to
    // `fee_schedule_version: ACTIVE_FEE_SCHEDULE_VERSION` and dropping the
    // metadata read. Every intent in flight at the moment of a schedule flip
    // would be misattributed to the new schedule, so the artist's records
    // would say they were charged under rates they were never quoted.
    expect(payload.fee_schedule_version).toBe("fees-v2-plus-payments");
    // And it is genuinely different from the ambient fallback, which is what
    // makes the assertion above load-bearing rather than a coincidence.
    expect(payload.fee_schedule_version).not.toBe(ACTIVE_FEE_SCHEDULE_VERSION);

    // MUTANT KILLED (tier hardcoded to null, or dropped from the payload).
    // `fee_tier` has NO ambient fallback at all — the source's only other
    // possible value is null — so this half of the stamp cannot be faked by
    // an accidental agreement between two reads.
    expect(payload.fee_tier).toBe("legacy");

    // The stamp rides the SAME once-only conditional flip as the deposit
    // itself. Fails if it is ever moved to a separate write: a fee could then
    // exist without its payment, or a replayed delivery could restamp a
    // booking whose deposit was recorded under the old schedule.
    expect(payload.status).toBe("approved");
    expect(flip.filters).toEqual({
      id: BOOKING_ID,
      status: "deposit_pending",
      deposit_paid_at: null,
    });
  });

  it("falls back to the ACTIVE schedule and a null tier for an intent created before the stamp existed", async () => {
    queueDepositHappyPath();

    const { status } = await postSucceeded({
      amount: 5000,
      metadata: { booking_id: BOOKING_ID, artist_id: "a1" },
    });
    expect(status).toBe(200);

    const payload = onlyBookingUpdate().payload as Record<string, unknown>;
    // Honest null over a guessed tier: an intent from before the stamp was
    // quoted at a tier nobody recorded, and inventing one would make the
    // whole column untrustworthy for the rows that do carry a real value.
    // Fails if the fallback ever becomes a default tier string.
    expect(payload.fee_tier).toBeNull();
    // The version has a defensible fallback (the schedule in force), so this
    // one does default. Asserted against the module's own constant rather
    // than a literal: this row must move when the schedule moves.
    expect(payload.fee_schedule_version).toBe(ACTIVE_FEE_SCHEDULE_VERSION);
  });

  it("records Stripe's OWN application fee, not a recomputation", async () => {
    queueDepositHappyPath();

    await postSucceeded({
      amount: 5000,
      application_fee_amount: 150,
      metadata: {
        booking_id: BOOKING_ID,
        artist_id: "a1",
        fee_schedule_version: "fees-v2-plus-payments",
        fee_tier: "plus",
      },
    });

    const payload = onlyBookingUpdate().payload as Record<string, unknown>;
    // 150, NOT the 0.5% of 5000 (25) that the v2 plus rate in the metadata
    // would imply. What Inklee actually took is what Stripe says it took;
    // fails if this is ever derived from the stamped schedule instead, which
    // would make the fee column disagree with the Stripe balance.
    expect(payload.platform_fee_collected_cents).toBe(150);
  });

  it("an appointment payment never reaches the deposit stamp at all", async () => {
    mockSettlePaymentRequestSuccess.mockResolvedValue(true);

    const { status, body } = await postSucceeded({
      amount: 5000,
      metadata: {
        payment_request_id: "pr_1",
        booking_id: BOOKING_ID,
        fee_schedule_version: "fees-v2-plus-payments",
      },
    });

    expect(status).toBe(200);
    expect(body).toEqual({ received: true, settled: true });
    // Appointment PIs also carry booking_id, so payment_request_id must stay
    // the FIRST discriminator. Fails if the deposit branch is moved above it:
    // an appointment payment would flip the booking to approved and stamp a
    // deposit that was never taken. The empty op list is the discriminator —
    // asserting only on the body would pass on a route that did both.
    expect(ops).toEqual([]);
  });
});

describe("payment_intent.succeeded: standalone goods outcome mapping (SHOP-FUL-005)", () => {
  const STANDALONE = {
    amount: 6000,
    metadata: { order_id: "o1", artist_id: "a1", standalone_goods: "1" },
  };

  it("REFUSED answers 500 with retry, so Stripe redelivers", async () => {
    mockSettleStandalone.mockResolvedValue("refused");

    const { status, body } = await postSucceeded(STANDALONE);

    // 500 is the whole fix. The settle refused BEFORE consuming its once-only
    // flip, so the work is entirely redoable and Stripe's retry ladder
    // recovers it in minutes. Fails if the branch is flattened back to a
    // single 200 response: the order waits for the nightly sweep instead,
    // worst case roughly two days with the money already captured, and the
    // buyer's receipt and the artist's stock decrement wait with it.
    expect(status).toBe(500);
    // `retry: true` is for the human reading Stripe's event log; the status
    // is what Stripe itself acts on. Both asserted: a route that returned the
    // flag with a 200 would look right in the dashboard and retry never.
    expect(body).toEqual({ received: true, outcome: "refused", retry: true });
    expect(mockSettleStandalone).toHaveBeenCalledTimes(1);
  });

  it("ALREADY answers 200, so a settled order is never retried forever", async () => {
    mockSettleStandalone.mockResolvedValue("already");

    const { status, body } = await postSucceeded(STANDALONE);

    // The counterweight to the test above, and the reason the outcome is a
    // tri-state rather than a boolean. Another delivery or the sweep owns
    // this order; there is nothing a retry could achieve. Fails if the
    // mapping is widened to "anything that is not settled retries", which is
    // what a naive 500-on-false would have done: every redelivered success
    // would 500 on Stripe's full ladder until the event expired.
    expect(status).toBe(200);
    expect(body).toEqual({ received: true, outcome: "already" });
  });

  it("SETTLED answers 200 with the outcome", async () => {
    mockSettleStandalone.mockResolvedValue("settled");

    const { status, body } = await postSucceeded(STANDALONE);

    expect(status).toBe(200);
    // The outcome is forwarded verbatim, not flattened to a boolean: Stripe's
    // event log is the only place a human can see which of the three
    // happened. Fails if the route hardcodes a value instead of the
    // function's answer.
    expect(body).toEqual({ received: true, outcome: "settled" });
    // No booking-side work on a standalone order: the branch returns before
    // the deposit path, and this order has no booking to advance.
    expect(ops).toEqual([]);
  });

  it("a booking's ADD-ON order (order_id WITH booking_id) is not routed to the standalone settle", async () => {
    queue("booking_requests:select", { data: BOOKING_ROW });
    // An add-on order belonging to THIS booking. The intent amount is the
    // ORDER subtotal, not the deposit, which is what the route's amount
    // re-check compares against on this path.
    queue("orders:select", {
      data: {
        id: "o1",
        status: "pending",
        booking_id: BOOKING_ID,
        subtotal_amount: 50,
        discount_code_id: null,
        discount_amount: 0,
      },
    });
    queue("audit_log:select", { count: 0 });
    queue("booking_requests:update", {
      data: [{ id: BOOKING_ID }],
      error: null,
    });
    queue("orders:update", { data: [{ id: "o1" }] });
    queue("order_items:select", { data: [] });
    queue("profiles:select", { data: { display_name: "Mika Ink" } });

    await postSucceeded({
      amount: 5000,
      metadata: {
        order_id: "o1",
        booking_id: BOOKING_ID,
        artist_id: "a1",
        fee_tier: "plus",
      },
    });

    // Fails if the `&& !intent.metadata?.booking_id` conjunct is dropped: an
    // add-on order riding the booking's deposit intent would be settled as if
    // it were standalone, and the BOOKING would never be advanced to approved
    // — a paid deposit that leaves the client's request sitting in
    // deposit_pending forever.
    expect(mockSettleStandalone).not.toHaveBeenCalled();
    expect(onlyBookingUpdate().payload).toMatchObject({
      status: "approved",
      fee_tier: "plus",
    });
    // The order side ran too, under its own once-only gate: an add-on order
    // is settled by the BOOKING path, not by the standalone one.
    const orderFlip = ops.find(
      (o) => o.table === "orders" && o.verb === "update",
    );
    expect(orderFlip!.payload).toMatchObject({ status: "paid" });
    expect(orderFlip!.filters).toEqual({ id: "o1", status: "pending" });
  });
});
