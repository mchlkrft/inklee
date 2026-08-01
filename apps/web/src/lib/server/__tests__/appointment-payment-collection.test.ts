import { describe, it, expect, vi, beforeEach } from "vitest";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_OVERRIDES,
  type AccountOverrides,
  type EntitlementFeature,
} from "@/lib/entitlements";
import {
  PAYMENT_REQUEST_STATUSES,
  PAYMENT_REQUEST_TRANSITIONS,
  type PaymentRequestCollects,
  type PaymentRequestStatus,
} from "@inklee/shared/appointment-payments";

// THE COLLECTION BOUNDARY (Plus build P9, slice A3): the quote and the
// PaymentIntent core. Written by a different engineer than the cores, because
// the author of a money path does not certify their own gate. The six
// obligations below were deferred by the A2/fee pass with the reason "they need
// A3's code to exist"; the code exists, so they are discharged here.
//
// WHAT IS PINNED, in the order of what would hurt most if it broke:
//
//  3. OVER-COLLECTION IS REFUSED SERVER-SIDE at the new entry point, and a
//     zero balance produces no charge. A2's handoff finding was that nothing in
//     the product called `checkCollectable`: it was a proven-pure function with
//     no caller. `buildPaymentQuote` is now its only production caller, so this
//     block is what says the wiring is real rather than present.
//  4. THE DISPLAYED AMOUNT AND THE CHARGED AMOUNT ARE ONE FIELD. The
//     discriminating case is a partially collected request, where the frozen
//     total and the collectible remainder are DIFFERENT numbers: a naive
//     implementation reads `total_minor` for one of them and the client is
//     charged an amount they were never shown.
//  5. IDEMPOTENCY, IN BOTH DIRECTIONS. A retried logical collection produces
//     ONE charge, and a legitimate second collection is NOT blocked. Only
//     testing the first direction ships a system that can never collect a
//     remainder, which is a defect that looks like safety.
//  6. ILLEGAL LIFECYCLE MOVES ARE REFUSED BY WIRED CODE. A1 shipped the
//     transition table with no importer, so it constrained nothing. All
//     thirteen statuses are driven through the real core here, and the claiming
//     UPDATE's own status filter is compared against the table it is derived
//     from.
//  7. A FREE ARTIST IS REFUSED AT EVERY NEW ENTRY POINT, cores called directly
//     rather than through a UI. All seven payment entitlement keys are granted
//     one at a time, because a gate that is wrong in the PERMISSIVE direction
//     is invisible to a test that only checks refusals.
//  8. SPEC SECTION 12, the parts reachable at A3: duplicate charge, collecting
//     an already-paid balance through a core, and payment against an obsolete
//     revision. CONCURRENT ATTEMPTS AT THE INTENT LAYER ARE NOT HERE: they need
//     two connections overlapping in time, which a mock cannot arrange, and
//     they live in `tests/db/payment-request-intent-race.test.ts`.
//
// NO STRIPE KEY IS REACHABLE FROM THIS FILE. Every call passes an injected
// `stripeClient` that is a `vi.fn()` triple, and the assertions are on what
// that triple was asked for. The real client (`@/lib/stripe`) is never used.
//
// The entitlement engine is the REAL one (`canAccess` over real
// `AccountOverrides`); only the account read, the kill switch and Connect are
// doubled, so a change in how Free resolves shows up here.
//
// ---------------------------------------------------------------------------
// EXECUTED, RED FIRST, one change at a time. Every test below had its killing
// mutation NAMED BEFORE the run, was observed to fail that way by NAME under
// `--reporter=verbose`, and was restored and re-verified green. The table is in
// `docs/product/plus-build-progress.md`, A3 section. Two results are worth
// carrying here because they are findings rather than confirmations:
//
//   THE FEE IS COMPUTED ON THE FROZEN BASKET, NOT ON WHAT IS BEING COLLECTED.
//   Pinned as an `it.fails` tripwire at the end of block 4. It is not
//   reachable today (no allocation exists until A4) and it is not a number
//   anyone should assert as correct, so it is recorded in the one shape that
//   is neither: a test that FAILS on purpose and goes red the moment it starts
//   passing.
//
//   `failed` IS IN THE CLAIM'S STATUS FILTER AND UNREACHABLE THROUGH THE QUOTE.
//   Pinned in block 6. Three places say a declined card can be retried; one
//   place makes the request unpayable, and it runs first.

const getAccountOverrides = vi.fn();
let disabledCapabilities: string[] = [];
const isCapabilityDisabled = vi.fn((capability: string) =>
  disabledCapabilities.includes(capability),
);
const getConnectRoutingForArtist = vi.fn();
const isConnectAccountUnreachable = vi.fn(() => false);
const markConnectAccountUnreachable = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));
vi.mock("@/lib/entitlements-server", () => ({
  getAccountOverrides: (...a: unknown[]) => getAccountOverrides(...a),
}));
vi.mock("@/lib/server/app-config", () => ({
  isCapabilityDisabled: (c: string) => isCapabilityDisabled(c),
}));
vi.mock("@/lib/stripe-connect", () => ({
  getConnectRoutingForArtist: (...a: unknown[]) =>
    getConnectRoutingForArtist(...a),
  isConnectAccountUnreachable: (...a: unknown[]) =>
    isConnectAccountUnreachable(...(a as [])),
  markConnectAccountUnreachable: (...a: unknown[]) =>
    markConnectAccountUnreachable(...a),
}));

import * as quoteModule from "@/lib/server/appointment-payment-quote";
import * as intentModule from "@/lib/server/appointment-payment-intent";
import {
  buildPaymentQuote,
  splitFeeBases,
  type PaymentQuoteResult,
} from "@/lib/server/appointment-payment-quote";
import {
  STATUSES_ENTERING_PROCESSING,
  createPaymentRequestIntentCore,
  paymentIntentIdempotencyKey,
  type PaymentIntentResult,
} from "@/lib/server/appointment-payment-intent";
import { createPaymentRequestCore } from "@/lib/server/appointment-payments";
import { appointmentApplicationFee } from "@/lib/server/order-fee-sync";

// ---------------------------------------------------------------------------
// A recording Supabase double, adapted from `appointment-payments.test.ts`.
//
// The recording half is not convenience. This path expresses its money floor
// and its concurrency guard as FILTERS on the claiming UPDATE (`.eq("revision",
// …)`, `.in("status", …)`), and a filter that is silently dropped still returns
// a clean result from a mock that only replays rows. Asserting on
// `ops[n].filters` and `ops[n].inFilter` is the only way a dropped guard fails
// a unit test.

type Reply = { data?: unknown; error?: unknown };

type RecordedOp = {
  table: string;
  verb: "select" | "insert" | "update" | "delete";
  payload: Record<string, unknown> | null;
  filters: Record<string, unknown>;
  inFilter: { column: string; values: unknown[] } | null;
};

interface Chain extends PromiseLike<Reply> {
  select(columns?: string, options?: unknown): Chain;
  eq(column: string, value: unknown): Chain;
  in(column: string, values: unknown[]): Chain;
  order(column: string, opts?: unknown): Chain;
  maybeSingle(): Promise<Reply>;
  single(): Promise<Reply>;
}

let ops: RecordedOp[] = [];
let replies: Record<string, Reply[]> = {};

function queue(key: string, ...rs: Reply[]) {
  replies[key] = [...(replies[key] ?? []), ...rs];
}

function nextReply(key: string): Reply {
  const q = replies[key];
  if (q && q.length > 0) return q.shift() as Reply;
  return { data: null, error: null };
}

function makeChain(op: RecordedOp): Chain {
  const key = `${op.table}:${op.verb}`;
  const self: Chain = {
    select: () => self,
    eq: (column, value) => {
      op.filters[column] = value;
      return self;
    },
    in: (column, values) => {
      op.inFilter = { column, values };
      return self;
    },
    order: () => self,
    maybeSingle: () => Promise.resolve(nextReply(key)),
    single: () => Promise.resolve(nextReply(key)),
    then: (onFulfilled, onRejected) =>
      Promise.resolve(nextReply(key)).then(onFulfilled, onRejected),
  };
  return self;
}

function start(
  table: string,
  verb: RecordedOp["verb"],
  payload: RecordedOp["payload"],
): Chain {
  const op: RecordedOp = { table, verb, payload, filters: {}, inFilter: null };
  ops.push(op);
  return makeChain(op);
}

const supabase = {
  from: (table: string) => ({
    select: () => start(table, "select", null),
    insert: (payload: Record<string, unknown>) =>
      start(table, "insert", payload),
    update: (payload: Record<string, unknown>) =>
      start(table, "update", payload),
    delete: () => start(table, "delete", null),
  }),
  rpc: () => Promise.resolve({ data: null, error: null }),
} as unknown as SupabaseClient;

const writes = () => ops.filter((o) => o.verb !== "select");
const claimOp = () =>
  ops.find((o) => o.table === "payment_requests" && o.verb === "update");

// ---------------------------------------------------------------------------
// Stripe: three spies and nothing else. `create` echoes the metadata it was
// given, so the reuse path's "does this intent name my request" check runs
// against a real round trip rather than a hand-written stub.

const stripeCreate = vi.fn();
const stripeRetrieve = vi.fn();
const stripeCancel = vi.fn();
const stripeMock = {
  paymentIntents: {
    create: stripeCreate,
    retrieve: stripeRetrieve,
    cancel: stripeCancel,
  },
} as unknown as Stripe;

const INTENT_ID = "pi_a3_test";
function createdIntent(
  params: Stripe.PaymentIntentCreateParams,
): Stripe.PaymentIntent {
  return {
    id: INTENT_ID,
    client_secret: `${INTENT_ID}_secret`,
    status: "requires_payment_method",
    amount: params.amount,
    currency: params.currency,
    application_fee_amount: params.application_fee_amount,
    metadata: params.metadata,
  } as unknown as Stripe.PaymentIntent;
}

/** Every argument Stripe was handed for the one create on this run. */
function createArgs(): {
  params: Stripe.PaymentIntentCreateParams;
  options: { idempotencyKey: string };
} {
  expect(
    stripeCreate.mock.calls.length,
    "expected exactly one PaymentIntent create",
  ).toBe(1);
  const [params, options] = stripeCreate.mock.calls[0];
  return params && options ? { params, options } : (undefined as never);
}

// ---------------------------------------------------------------------------
// Fixtures.

const ARTIST = "artist-1";
const REQUEST_ID = "pr1";
const BOOKING_ID = "bk1";
const REQUESTS = "payment_requests";
const LINES = "payment_request_lines";
const ALLOCATIONS = "payment_allocations";

const PLUS: AccountOverrides = { ...DEFAULT_OVERRIDES, planTier: "plus" };
/** Plus that ran out. The realistic downgrade: the row still says plus. */
const LAPSED_TO_FREE: AccountOverrides = {
  ...DEFAULT_OVERRIDES,
  planTier: "plus",
  planExpiresAt: "2020-01-01T00:00:00.000Z",
};
function freeWith(...features: EntitlementFeature[]): AccountOverrides {
  return {
    ...DEFAULT_OVERRIDES,
    entitlementOverrides: Object.fromEntries(
      features.map((f) => [f, true]),
    ) as Partial<Record<EntitlementFeature, boolean>>,
  };
}

const FAR_FUTURE = "2099-01-01T00:00:00.000Z";

function storedRequest(over: Record<string, unknown> = {}) {
  return {
    id: REQUEST_ID,
    artist_id: ARTIST,
    booking_id: BOOKING_ID,
    project_id: null,
    status: "sent" as PaymentRequestStatus,
    currency: "eur",
    collects: "balance" as PaymentRequestCollects,
    total_minor: 20_000,
    revision: 1,
    expires_at: FAR_FUTURE,
    payment_intent_id: null,
    payment_intent_amount_minor: null,
    ...over,
  };
}

function serviceLine(over: Record<string, unknown> = {}) {
  return {
    id: "ln1",
    name: "Tattoo balance",
    description: null,
    quantity: 1,
    unit_amount_minor: 20_000,
    line_total_minor: 20_000,
    classification: "tattoo_service",
    currency: "eur",
    position: 0,
    ...over,
  };
}

/** A settled collection against this SUBJECT. `request_id` null is the deposit
 *  taken through the existing booking path, which is the case the
 *  subject-scoped ceiling exists for. */
function allocation(over: Record<string, unknown> = {}) {
  return {
    id: "al1",
    artist_id: ARTIST,
    booking_id: BOOKING_ID,
    project_id: null,
    request_id: null,
    line_id: null,
    payment_intent_id: "pi_old",
    component: "deposit",
    amount_minor: 5_000,
    collected_total_minor: 5_000,
    currency: "eur",
    status: "succeeded",
    settled_at: "2026-07-01T00:00:00.000Z",
    ...over,
  };
}

type Fixture = {
  request?: Record<string, unknown> | null;
  requestError?: unknown;
  lines?: Record<string, unknown>[] | null;
  linesError?: unknown;
  allocations?: Record<string, unknown>[] | null;
  allocationsError?: unknown;
  /** The claiming UPDATE's answer. Default: one row, claimed. */
  claim?: Reply;
  /** The read-back after a lost claim. */
  readBack?: Record<string, unknown> | null;
  /** The read-back FAILING. Distinct from `readBack: null`, and the distinction
   *  is the whole point: null means "the row is not there", an error means "we
   *  do not know". Only one of those may reach the cancel branch. */
  readBackError?: unknown;
};

/** Queue the three reads the quote performs, in the order it performs them. */
function queueQuote(f: Fixture = {}) {
  queue(`${REQUESTS}:select`, {
    data: f.request === undefined ? storedRequest() : f.request,
    error: f.requestError ?? null,
  });
  queue(`${LINES}:select`, {
    data: f.lines === undefined ? [serviceLine()] : f.lines,
    error: f.linesError ?? null,
  });
  queue(`${ALLOCATIONS}:select`, {
    data: f.allocations === undefined ? [] : f.allocations,
    error: f.allocationsError ?? null,
  });
}

/**
 * Queue a whole intent attempt: the quote's three reads, the claim, and the
 * read-back.
 *
 * The read-back is queued ONLY when the fixture asks for one, and that is not
 * tidiness. It shares the `payment_requests:select` queue with the quote's
 * first read, so an unconsumed read-back reply is served to the NEXT attempt as
 * its request row. Queuing it unconditionally made the second of two
 * back-to-back attempts read `null` and answer `not_found`, which looked
 * exactly like the replay path being broken. Found by running the file, not by
 * reading it.
 */
function queueAttempt(f: Fixture = {}) {
  queueQuote(f);
  queue(`${REQUESTS}:update`, f.claim ?? { data: [{ id: REQUEST_ID }] });
  if (f.readBack !== undefined || f.readBackError !== undefined) {
    queue(`${REQUESTS}:select`, {
      data: f.readBack ?? null,
      error: f.readBackError ?? null,
    });
  }
}

function quote(f: Fixture = {}): Promise<PaymentQuoteResult> {
  queueQuote(f);
  return buildPaymentQuote(supabase, REQUEST_ID);
}

function attempt(f: Fixture = {}): Promise<PaymentIntentResult> {
  queueAttempt(f);
  return createPaymentRequestIntentCore(supabase, REQUEST_ID, {
    stripeClient: stripeMock,
  });
}

// ---------------------------------------------------------------------------
// FORCED CALLS. Block 10 asserts that a caller which pushes an options object
// past the type system STILL cannot move entitlement, expiry or the ceiling, so
// the call has to stay expressible after those fields leave the signature.
// Casting through `unknown` is what keeps it compiling either way; a test that
// stopped compiling would be asserting the type rather than the behaviour, and
// a type is not what a `as never` at a call site respects.

type ForcedCall<R> = (
  client: SupabaseClient,
  id: string,
  options: Record<string, unknown>,
) => Promise<R>;

function forcedQuote(
  seams: Record<string, unknown>,
  f: Fixture = {},
): Promise<PaymentQuoteResult> {
  queueQuote(f);
  return (buildPaymentQuote as unknown as ForcedCall<PaymentQuoteResult>)(
    supabase,
    REQUEST_ID,
    seams,
  );
}

function forcedAttempt(
  seams: Record<string, unknown>,
  f: Fixture = {},
): Promise<PaymentIntentResult> {
  queueAttempt(f);
  return (
    createPaymentRequestIntentCore as unknown as ForcedCall<PaymentIntentResult>
  )(supabase, REQUEST_ID, { stripeClient: stripeMock, ...seams });
}

beforeEach(() => {
  vi.clearAllMocks();
  ops = [];
  replies = {};
  disabledCapabilities = [];
  getAccountOverrides.mockResolvedValue(PLUS);
  getConnectRoutingForArtist.mockResolvedValue({
    stripeAccountId: "acct_test",
    routeCharges: true,
  });
  isConnectAccountUnreachable.mockReturnValue(false);
  stripeCreate.mockImplementation((params: Stripe.PaymentIntentCreateParams) =>
    Promise.resolve(createdIntent(params)),
  );
  // The intent the claim would have left behind for the DEFAULT fixture: the
  // same amount, currency and application fee the create path was handed. Block
  // 9 compares a reused intent against its quote, so a retrieve double that
  // omits those fields would be a disagreement rather than a replay.
  stripeRetrieve.mockResolvedValue(
    createdIntent({
      amount: 20_000,
      currency: "eur",
      application_fee_amount: 600,
      metadata: { payment_request_id: REQUEST_ID },
    } as Stripe.PaymentIntentCreateParams),
  );
  stripeCancel.mockResolvedValue({} as Stripe.PaymentIntent);
});

/** No money was asked for, on any channel. Used everywhere a refusal is
 *  asserted, because "returned an error" and "returned an error having already
 *  created a live PaymentIntent" are different outcomes. */
function expectNothingCharged() {
  expect(
    stripeCreate,
    "no PaymentIntent may have been created",
  ).not.toHaveBeenCalled();
  expect(stripeRetrieve).not.toHaveBeenCalled();
  expect(writes(), "no row may have been written").toEqual([]);
}

// ===========================================================================
// 3. OVER-COLLECTION, AND THE ZERO BALANCE.
//
// A2 shipped `checkCollectable` with no caller. These tests are what say the
// quote calls it, and they are written so that DELETING either ceiling from the
// quote turns one of them red rather than leaving the suite green with a
// function nobody runs.

describe("3. over-collection is refused server-side, at the new entry point", () => {
  // The subject-scoped ceiling. `collects: full_price` is the one shape where
  // the artist has stated the final price on the request itself, so the ceiling
  // exists without A6's confirm-the-price field. The 5000 deposit arrived
  // through the OLD booking path (`request_id` null), which is exactly the
  // money a request-scoped check cannot see.
  //
  // FALSIFIED BY: deleting the `if (subjectBalance)` block from
  // `buildPaymentQuote`. Observed: `expected 'above_outstanding' to be
  // undefined` here, and the CONTROL below stayed green, so the refusal is the
  // ceiling and not the fixture.
  it("refuses a request whose frozen total is above what the SUBJECT still owes", async () => {
    const r = await quote({
      request: storedRequest({ collects: "full_price" }),
      allocations: [allocation({ amount_minor: 15_000 })],
    });

    expect(r.ok).toBe(false);
    expect(r.ok === false && r.code).toBe("above_outstanding");
    expect(r.ok === false && r.error).toBe(
      "This payment asks for more than is still owed. Ask the artist to send an updated one.",
    );
  });

  it("CONTROL: the same request with nothing collected against the subject is payable", async () => {
    const r = await quote({
      request: storedRequest({ collects: "full_price" }),
      allocations: [],
    });
    expect(r.ok, r.ok === false ? r.code : "").toBe(true);
    expect(r.ok && r.quote.amountMinor).toBe(20_000);
    // And the ceiling really was computed, rather than skipped: the
    // subject-scoped balance is present and agrees with the request-scoped one.
    expect(r.ok && r.quote.subjectBalance?.maxCollectibleMinor).toBe(20_000);
    expect(r.ok && r.quote.maxCollectibleMinor).toBe(20_000);
  });

  // The intent core is the entry point that spends money, so the refusal is
  // asserted THERE too and not only on the quote it delegates to. A quote that
  // refuses while the core charges anyway is the whole failure mode.
  it("the intent core refuses the same case with no Stripe call at all", async () => {
    const r = await attempt({
      request: storedRequest({ collects: "full_price" }),
      allocations: [allocation({ amount_minor: 15_000 })],
    });
    expect(r).toEqual({
      ok: false,
      code: "quote_refused",
      quoteCode: "above_outstanding",
      error:
        "This payment asks for more than is still owed. Ask the artist to send an updated one.",
    });
    expectNothingCharged();
  });

  // Spec section 4: a zero balance produces no request at all rather than a
  // 0.00 one. At this layer that reads as: no charge, and no claim.
  //
  // FALSIFIED BY: deleting the request-scoped `checkCollectable` call.
  // Observed: `expected 'nothing_outstanding' to be undefined`, and the run
  // reached Stripe with `amount: 0`.
  it("a fully collected request produces no charge", async () => {
    const r = await attempt({
      allocations: [
        allocation({ request_id: REQUEST_ID, amount_minor: 20_000 }),
      ],
    });
    expect(r).toEqual({
      ok: false,
      code: "quote_refused",
      quoteCode: "nothing_outstanding",
      error: "This payment has already been settled. Nothing is due.",
    });
    expectNothingCharged();
  });

  // The dangerous direction, and the reason the read is checked at all: an
  // allocation read that FAILS looks exactly like "nothing has been collected",
  // which raises both ceilings and invites a second charge for a paid balance.
  //
  // FALSIFIED BY: dropping `|| !allocationRows` and letting a null read fall
  // through as an empty array. Observed: `expected 'failed' to be undefined`,
  // with a 20000 charge created against an already-settled balance.
  it("a FAILED allocation read refuses, it does not read as nothing collected", async () => {
    const r = await attempt({
      allocations: null,
      allocationsError: { message: "connection reset" },
    });
    expect(r).toEqual({
      ok: false,
      code: "quote_refused",
      quoteCode: "failed",
      error: "Couldn't load this payment. Please try again.",
    });
    expectNothingCharged();
  });

  // WHAT A3 DID NOT CLOSE, pinned so the residual cannot be lost.
  //
  // A2's finding was "an artist can compose and send a request for more than is
  // owed, because nothing calls `checkCollectable`". A3 closed that at
  // COLLECTION time only. The create core still reads no allocations and still
  // consults no balance, so the over-large request is composed and sent exactly
  // as before; it is the client's payment that is refused. Asserting the
  // ABSENCE of the read is what makes adding one a visible change here rather
  // than an invisible one.
  it("RESIDUAL: composing an over-large request still consults no balance", async () => {
    queue(`${REQUESTS}:insert`, { data: { id: REQUEST_ID }, error: null });
    queue(`${LINES}:insert`, { data: null, error: null });
    const created = await createPaymentRequestCore(supabase, ARTIST, {
      subject: { kind: "booking", id: BOOKING_ID },
      collects: "full_price",
      lines: [
        {
          name: "Tattoo",
          classification: "tattoo_service",
          quantity: 1,
          unitAmountMinor: 999_999,
        },
      ],
    });
    expect(created.ok, created.ok === false ? created.error : "").toBe(true);
    expect(
      ops.filter((o) => o.table === ALLOCATIONS),
      "create still reads no allocations: the send-side hole is A6/A8's, not A3's",
    ).toEqual([]);
  });
});

// ===========================================================================
// 4. ONE QUOTE. The displayed amount and the charged amount are one field.

describe("4. the displayed amount and the charged amount come from ONE quote", () => {
  // THE DISCRIMINATING CASE. A request frozen at 20000 with 5000 already
  // collected against IT has two defensible-looking numbers on it, and they are
  // different: `total_minor` is 20000 and the collectible remainder is 15000. A
  // naive intent core reads the row's own `total_minor` (it is right there in
  // the row it just read) and charges 20000 for a page showing 15000.
  //
  // FALSIFIED BY: `amount: quote.totalMinor` in place of `amount:
  // quote.amountMinor` in `createPaymentRequestIntentCore`. Observed: three
  // assertions red in this one test (`expected 20000 to be 15000` on the Stripe
  // amount, on the metadata, and on the stored attempt amount), while every
  // other test in the file stayed green, because 20000 and 15000 are the same
  // number in every fixture that has collected nothing.
  const PARTIAL: Fixture = {
    allocations: [allocation({ request_id: REQUEST_ID, amount_minor: 5_000 })],
  };

  it("charges the remainder, not the frozen total, when part of it is already paid", async () => {
    const r = await attempt(PARTIAL);
    expect(r.ok, r.ok === false ? r.code : "").toBe(true);
    if (!r.ok) return;

    // The case discriminates: if these were equal the test would prove nothing.
    expect(r.quote.totalMinor).toBe(20_000);
    expect(r.quote.alreadyCollectedMinor).toBe(5_000);
    expect(r.quote.amountMinor).toBe(15_000);
    expect(r.quote.amountMinor).not.toBe(r.quote.totalMinor);

    const { params } = createArgs();
    expect(params.amount, "Stripe is charged the quote's amount").toBe(15_000);
    expect(params.metadata?.quoted_amount_minor).toBe("15000");
    expect(claimOp()?.payload?.payment_intent_amount_minor).toBe(15_000);
  });

  // FOUR CONSUMERS, ONE FIELD. A6 renders `quote.amountMinor` (spec section 11:
  // the button says "Pay EUR X now" and reads this field), Stripe charges
  // `params.amount`, A4 reconciles `metadata.quoted_amount_minor`, and the row
  // records `payment_intent_amount_minor`. Any pair of those drifting is a
  // client charged an amount they were not shown, so all four are compared to
  // ONE source rather than to each other.
  it("all four consumers of the amount read the same field, across every collection state", async () => {
    const CASES: Array<[string, Fixture, number]> = [
      ["nothing collected", {}, 20_000],
      ["a partial collection", PARTIAL, 15_000],
      [
        "two partial collections",
        {
          allocations: [
            allocation({
              id: "a1",
              request_id: REQUEST_ID,
              amount_minor: 5_000,
            }),
            allocation({
              id: "a2",
              request_id: REQUEST_ID,
              amount_minor: 4_000,
              payment_intent_id: "pi_old2",
              component: "tattoo_service_balance",
            }),
          ],
        },
        11_000,
      ],
      [
        "a refund adjustment reopening the balance",
        {
          allocations: [
            allocation({
              id: "a1",
              request_id: REQUEST_ID,
              amount_minor: 20_000,
            }),
            allocation({
              id: "a2",
              request_id: REQUEST_ID,
              amount_minor: -6_000,
              component: "refund_adjustment",
            }),
          ],
        },
        6_000,
      ],
    ];

    const drifted: string[] = [];
    for (const [label, fixture, expected] of CASES) {
      ops = [];
      replies = {};
      vi.clearAllMocks();
      stripeCreate.mockImplementation(
        (params: Stripe.PaymentIntentCreateParams) =>
          Promise.resolve(createdIntent(params)),
      );
      getAccountOverrides.mockResolvedValue(PLUS);
      getConnectRoutingForArtist.mockResolvedValue({
        stripeAccountId: "acct_test",
        routeCharges: true,
      });

      const r = await attempt(fixture);
      if (!r.ok) {
        drifted.push(`${label}: refused with ${r.code}`);
        continue;
      }
      const { params } = createArgs();
      const seen = [
        r.quote.amountMinor,
        params.amount,
        Number(params.metadata?.quoted_amount_minor),
        claimOp()?.payload?.payment_intent_amount_minor,
      ];
      if (seen.some((v) => v !== expected)) {
        drifted.push(`${label}: expected ${expected}, saw ${seen.join("/")}`);
      }
    }
    expect(drifted).toEqual([]);
  });

  // NO AMOUNT CROSSES THE BOUNDARY. Neither core takes one, and a caller that
  // invents the parameter must not be able to move the charge. Checked
  // behaviourally rather than by counting parameters, because an argument a
  // function ignores is the same defect wearing a longer signature.
  it("a caller-supplied amount changes nothing, on either core", async () => {
    const hostile = { amountMinor: 1, amount: 1, totalMinor: 1 };

    const q = await forcedQuote(hostile);
    expect(q.ok && q.quote.amountMinor).toBe(20_000);

    ops = [];
    replies = {};
    const r = await forcedAttempt(hostile);
    expect(r.ok).toBe(true);
    expect(createArgs().params.amount).toBe(20_000);
  });

  // The fee travels with the amount from the same object, and it is the UNIFIED
  // fee function's answer rather than a second computation. `platformFeeCents`
  // is display-only after A3 and must never appear on this path.
  it("the application fee on the intent is the quote's fee, from the one fee function", async () => {
    const r = await attempt();
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const expected = appointmentApplicationFee({
      appointmentBaseMinor: r.quote.appointmentBaseMinor,
      goodsBaseMinor: r.quote.goodsBaseMinor,
      tier: "plus",
      sponsored: false,
    });
    expect(expected.ok).toBe(true);
    expect(expected.ok && expected.applicationFeeMinor).toBe(
      r.quote.applicationFeeMinor,
    );
    const { params } = createArgs();
    expect(params.application_fee_amount).toBe(r.quote.applicationFeeMinor);
    expect(params.metadata?.application_fee_minor).toBe(
      String(r.quote.applicationFeeMinor),
    );
    // 3% of 20000 under the active schedule. A literal, so a schedule change
    // has to be seen here rather than re-derived into agreement.
    expect(r.quote.applicationFeeMinor).toBe(600);
  });

  // The lanes are split by classification and the two fees are never charged on
  // the same value (spec sections 5 and 6). Tips, tax and shipping are in
  // NEITHER base; a discount apportions.
  it("tips, tax and shipping are excluded from both fee bases", () => {
    const bases = splitFeeBases([
      { classification: "tattoo_service", lineTotalMinor: 20_000 },
      { classification: "physical_goods", lineTotalMinor: 10_000 },
      { classification: "tip", lineTotalMinor: 5_000 },
      { classification: "tax", lineTotalMinor: 3_000 },
      { classification: "shipping", lineTotalMinor: 900 },
      { classification: "discount", lineTotalMinor: -3_000 },
    ]);
    // 3000 discount over a 30000 feeable gross: goods take 1000, appointment
    // takes the remainder so the two shares sum to the discount exactly.
    expect(bases).toEqual({
      appointmentBaseMinor: 18_000,
      goodsBaseMinor: 9_000,
    });
    expect(
      bases.appointmentBaseMinor + bases.goodsBaseMinor,
      "the 8900 of tip, tax and shipping is in neither lane",
    ).toBe(27_000);
  });

  // =======================================================================
  // TRIPWIRE, DELIBERATELY FAILING. Read the header before changing it.
  //
  // `it.fails` asserts that the body FAILS. It keeps the suite green while the
  // defect stands and goes RED the moment the defect is fixed, which is the
  // only shape that neither asserts a wrong number as correct nor loses the
  // finding. Deleting this test is not the way to make it pass.
  //
  // THE DEFECT. `buildPaymentQuote` computes the fee bases with
  // `splitFeeBases(lines)`, over the WHOLE frozen basket, while charging
  // `requestBalance.remainingMinor`. On a partially collected request those are
  // different numbers, so:
  //
  //   1. the fee is charged twice on the same value. 20000 basket, 5000
  //      collected, remainder 15000: the first attempt was quoted 600 and this
  //      one is quoted 600 again, which is 1200 on 20000 collected. Spec
  //      section 6 puts the appointment fee on "eligible tattoo-service value
  //      successfully collected", and section 5 says the two fees are never
  //      charged on the same value.
  //   2. when the remainder is smaller than the fee, `application_fee_amount`
  //      exceeds `amount` and STRIPE REJECTS THE PAYMENTINTENT OUTRIGHT. That
  //      is the assertion below, chosen because it is a hard platform rule
  //      rather than a commercial opinion about which lane a partial payment
  //      pays off first.
  //
  // NOT REACHABLE TODAY, which is why it is a tripwire and not a bug report
  // with a patch. REASON CORRECTED 2026-08-01 (verified by the Track A
  // verification pass): this used to say "A4's settlement webhook does not
  // exist". A4 EXISTS now (settlePaymentRequestSuccess writes allocations and
  // is wired into the webhook), so that premise is false. The tripwire stays
  // unreachable for a DIFFERENT reason: nothing anywhere writes
  // `partially_paid` (settlement sets `paid` unconditionally), so a request
  // carrying allocations is never in a payable state and a partial-collection
  // re-quote cannot occur. It becomes reachable in the change that introduces
  // real partial collection (writing `partially_paid`), which is when the
  // lane-split decision below must be made.
  //
  // OWNER: A4, together with the allocation writer. The fix is a lane split of
  // what is being COLLECTED, not of what was quoted, and choosing it is a
  // product decision (which lane a partial payment discharges first), not a
  // computation this pass may make on the author's behalf.
  it.fails(
    "TRIPWIRE (A4 owns): the fee must never exceed the amount being charged",
    async () => {
      // 19900 of a 20000 basket already collected. The remainder is 100 and the
      // fee is still computed on 20000, so Stripe is asked for a 600 platform
      // fee on a 100 charge.
      const r = await attempt({
        allocations: [
          allocation({ request_id: REQUEST_ID, amount_minor: 19_900 }),
        ],
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.quote.amountMinor).toBe(100);
      expect(
        r.quote.applicationFeeMinor,
        "Stripe refuses an application fee above the charge amount",
      ).toBeLessThanOrEqual(r.quote.amountMinor);
    },
  );
});

// ===========================================================================
// 5. IDEMPOTENCY, BOTH DIRECTIONS.

describe("5. a retry produces ONE charge, and a second collection is not blocked", () => {
  // DIRECTION ONE. The client reloads the payment page. The row now says
  // `payment_processing` and carries the intent id, so the attempt is answered
  // from the row: one create across both calls, and the SAME secret.
  //
  // FALSIFIED BY: removing the `quote.status === "payment_processing" &&
  // quote.existingPaymentIntentId` replay branch. Observed: `expected 2 to be
  // 1` on the create count, i.e. a second live PaymentIntent for one debt.
  it("a reload after a claim returns the SAME intent and creates no second one", async () => {
    const first = await attempt();
    expect(first.ok && first.reused).toBe(false);
    expect(stripeCreate).toHaveBeenCalledTimes(1);

    // The row as the claim left it.
    const second = await attempt({
      request: storedRequest({
        status: "payment_processing",
        payment_intent_id: INTENT_ID,
        payment_intent_amount_minor: 20_000,
      }),
    });
    expect(second.ok).toBe(true);
    expect(second.ok && second.reused).toBe(true);
    expect(second.ok && second.paymentIntentId).toBe(INTENT_ID);
    expect(
      stripeCreate,
      "the whole point: still ONE create after two logical attempts",
    ).toHaveBeenCalledTimes(1);
    expect(stripeRetrieve).toHaveBeenCalledTimes(1);
    // And nothing was re-claimed, so the reload cannot clobber a settlement.
    expect(
      ops.filter((o) => o.table === REQUESTS && o.verb === "update"),
    ).toHaveLength(1);
  });

  // The key itself. Stripe's own idempotency window is 24 hours and the design
  // does not lean on it, but the key must still be stable within it: two first
  // attempts on identical state must send the SAME key or two intents are
  // created for one debt before the row is ever claimed.
  it("identical state yields an identical key, with no clock and no randomness in it", async () => {
    const keys = new Set<string>();
    for (let i = 0; i < 5; i += 1) {
      ops = [];
      replies = {};
      vi.clearAllMocks();
      stripeCreate.mockImplementation(
        (params: Stripe.PaymentIntentCreateParams) =>
          Promise.resolve(createdIntent(params)),
      );
      getAccountOverrides.mockResolvedValue(PLUS);
      getConnectRoutingForArtist.mockResolvedValue({
        stripeAccountId: "acct_test",
        routeCharges: true,
      });
      await attempt();
      keys.add(createArgs().options.idempotencyKey);
    }
    expect(
      keys.size,
      `five identical attempts produced ${keys.size} keys`,
    ).toBe(1);
    expect([...keys][0]).toMatch(/^p9-apr-[0-9a-f]{32}$/);
  });

  // DIRECTION TWO, and it is a defect in the other direction. A request that
  // took a partial payment is `partially_paid`, which is payable and is in the
  // transition table's entry list, so collecting the remainder must WORK. If it
  // were answered from the stored intent, or if it reused the first attempt's
  // key, the artist could never collect the rest.
  //
  // FALSIFIED BY: widening the replay branch to any status with a stored intent
  // id. Observed: `expected 0 to be 1` on the create count, and the remainder
  // was never collectible.
  it("collecting the remainder after a partial payment creates a NEW intent, with a NEW key", async () => {
    await attempt();
    const firstKey = createArgs().options.idempotencyKey;

    ops = [];
    replies = {};
    vi.clearAllMocks();
    stripeCreate.mockImplementation(
      (params: Stripe.PaymentIntentCreateParams) =>
        Promise.resolve(createdIntent({ ...params })),
    );
    getAccountOverrides.mockResolvedValue(PLUS);
    getConnectRoutingForArtist.mockResolvedValue({
      stripeAccountId: "acct_test",
      routeCharges: true,
    });

    const second = await attempt({
      request: storedRequest({
        status: "partially_paid",
        payment_intent_id: "pi_first_attempt",
        payment_intent_amount_minor: 20_000,
      }),
      allocations: [
        allocation({ request_id: REQUEST_ID, amount_minor: 5_000 }),
      ],
    });

    expect(second.ok, second.ok === false ? second.code : "").toBe(true);
    expect(second.ok && second.reused).toBe(false);
    expect(
      stripeCreate,
      "the remainder must be collectible",
    ).toHaveBeenCalledTimes(1);
    const { params, options } = createArgs();
    expect(params.amount).toBe(15_000);
    expect(
      options.idempotencyKey,
      "a different collection must not replay the first one's key",
    ).not.toBe(firstKey);
  });

  // Every field the key is derived from must be able to move it, or a genuinely
  // different collection silently replays an old charge. Driven through the
  // real exported key function over the quote's own canonical string.
  it("each fact that makes a collection different also makes the key different", () => {
    const base = ["p9a3", REQUEST_ID, 1, "eur", 20_000, 600, 0, "fees-v1"].join(
      "|",
    );
    const variants: Record<string, string> = {
      "a different request": base.replace(REQUEST_ID, "pr2"),
      "a new revision": [
        "p9a3",
        REQUEST_ID,
        2,
        "eur",
        20_000,
        600,
        0,
        "fees-v1",
      ].join("|"),
      "a different amount": base.replace("20000", "15000"),
      "a different fee": base.replace("|600|", "|100|"),
      "money already collected": base.replace("|600|0|", "|600|5000|"),
      "a new schedule version": base.replace("fees-v1", "fees-v2"),
    };
    const baseKey = paymentIntentIdempotencyKey(base);
    const collided: string[] = [];
    for (const [label, source] of Object.entries(variants)) {
      if (paymentIntentIdempotencyKey(source) === baseKey) collided.push(label);
    }
    expect(collided).toEqual([]);
    // Stable, and inside Stripe's 255-character cap.
    expect(paymentIntentIdempotencyKey(base)).toBe(baseKey);
    expect(baseKey.length).toBeLessThanOrEqual(255);
  });
});

// ===========================================================================
// 6. THE LIFECYCLE TABLE IS WIRED, NOT DESCRIBED.

describe("6. illegal lifecycle moves are refused by code that runs", () => {
  /** What the transition table SAYS may enter `payment_processing`, derived
   *  here rather than copied, so this compares two derivations of one fact. */
  const DERIVED_ENTRY_STATUSES = PAYMENT_REQUEST_STATUSES.filter((from) =>
    PAYMENT_REQUEST_TRANSITIONS[from].includes("payment_processing"),
  );

  it("the claiming UPDATE filters on the table, not on a hand-written list", async () => {
    await attempt();
    const claim = claimOp();
    expect(claim, "the claim must exist").toBeTruthy();
    expect(claim?.inFilter?.column).toBe("status");
    expect([...(claim?.inFilter?.values ?? [])].sort()).toEqual(
      [...DERIVED_ENTRY_STATUSES].sort(),
    );
    expect([...STATUSES_ENTERING_PROCESSING].sort()).toEqual(
      [...DERIVED_ENTRY_STATUSES].sort(),
    );
    // The claim also carries the row identity and the revision it quoted.
    expect(claim?.filters).toEqual({ id: REQUEST_ID, revision: 1 });
    expect(claim?.payload?.status).toBe("payment_processing");
  });

  // ALL THIRTEEN STATUSES, DRIVEN THROUGH THE REAL CORE. Collected into one
  // table so a failure names every status that moved rather than stopping at
  // the first, and so a future edit to either gate is visible as a diff of
  // outcomes rather than as a passing test.
  //
  // FALSIFIED BY: deleting the `canTransitionPaymentRequest` pre-check.
  // Observed: `payment_processing (no stored intent): charged` in the list, a
  // SECOND live intent for a request already collecting.
  it("every status produces its documented outcome, and only three can charge", async () => {
    const outcomes: string[] = [];
    for (const status of PAYMENT_REQUEST_STATUSES) {
      ops = [];
      replies = {};
      vi.clearAllMocks();
      stripeCreate.mockImplementation(
        (params: Stripe.PaymentIntentCreateParams) =>
          Promise.resolve(createdIntent(params)),
      );
      getAccountOverrides.mockResolvedValue(PLUS);
      getConnectRoutingForArtist.mockResolvedValue({
        stripeAccountId: "acct_test",
        routeCharges: true,
      });

      // No stored intent, so the replay path cannot answer for any of them.
      const r = await attempt({ request: storedRequest({ status }) });
      const verdict = r.ok
        ? "charged"
        : r.code === "quote_refused"
          ? `refused:${r.quoteCode}`
          : `refused:${r.code}`;
      outcomes.push(
        `${status} -> ${verdict}` +
          (stripeCreate.mock.calls.length ? "" : " (no stripe call)"),
      );
    }

    expect(outcomes).toEqual([
      "draft -> refused:not_payable (no stripe call)",
      "ready -> refused:not_payable (no stripe call)",
      "sent -> charged",
      "viewed -> charged",
      // THE CASE THE PRE-CHECK EXISTS FOR. The quote lets `payment_processing`
      // through (it is payable), the replay path cannot answer it because no
      // intent id is stored, and without the table this would mint a second
      // live intent for a request already collecting.
      "payment_processing -> refused:illegal_transition (no stripe call)",
      "partially_paid -> charged",
      "paid -> refused:not_payable (no stripe call)",
      "expired -> refused:not_payable (no stripe call)",
      "cancelled -> refused:not_payable (no stripe call)",
      "partially_refunded -> refused:not_payable (no stripe call)",
      "refunded -> refused:not_payable (no stripe call)",
      "disputed -> refused:not_payable (no stripe call)",
      // FINDING, PINNED RATHER THAN FIXED. `failed` is in the claim's status
      // filter (the transition table allows `failed -> payment_processing`) and
      // the intent core's own header says a declined card is retried on the
      // same key. It is unreachable: `PAYABLE_PAYMENT_REQUEST_STATUSES` excludes
      // `failed`, and the quote runs first. Three places say retry, one place
      // says no, and the one that says no wins. Reported to the A4 owner; the
      // resolution is a product decision (a declined card either reopens the
      // link or forces a new one) and both halves must move together.
      "failed -> refused:not_payable (no stripe call)",
    ]);
  });

  // The claim is CONDITIONAL, and a lost claim is reconciled rather than
  // assumed. Zero rows with no error is the shape a core mistakes for success.
  it("a claim that affects zero rows is read back, not treated as a win", async () => {
    const r = await attempt({
      claim: { data: [] },
      readBack: { status: "cancelled", payment_intent_id: null },
    });
    expect(r).toEqual({
      ok: false,
      code: "conflict",
      error: "This payment changed while you were paying. Please refresh.",
    });
    // The intent belongs to nothing now, so it must not be left live.
    expect(stripeCancel).toHaveBeenCalledWith(INTENT_ID);
  });

  // The other half of the same branch: the row moved because a CONCURRENT TWIN
  // of this attempt won it, holding the same intent id (the key is stable, so
  // both halves are at the same object). Nothing was lost and cancelling would
  // destroy a live payment the client is in the middle of.
  // THE THIRD BRANCH, and it had ZERO coverage until an independent verifier
  // pointed out that deleting the whole `if (afterError)` guard left the entire
  // unit suite green. The guard was added to close a CRITICAL: the read-back
  // originally discarded its error, so a failed SELECT was indistinguishable
  // from "the row moved" and the code cancelled an intent a twin might be
  // collecting on.
  //
  // The distinction this pins is null-versus-error. `readBack: null` means the
  // row is genuinely not there and cancelling is right. `readBackError` means we
  // know NOTHING, and the destructive branch must never fire on an unknown.
  it("a read-back that ERRORS cancels nothing, because a blip is not a move", async () => {
    const r = await attempt({
      claim: { data: [] },
      readBackError: { message: "connection reset", code: "08006" },
    });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.code).toBe("failed");
    expect(
      stripeCancel,
      "cancelling on an unknown would destroy a payment a twin may be collecting",
    ).not.toHaveBeenCalled();
  });

  it("a claim lost to a twin holding the SAME intent is a success, and cancels nothing", async () => {
    const r = await attempt({
      claim: { data: [] },
      readBack: { status: "payment_processing", payment_intent_id: INTENT_ID },
    });
    expect(r.ok).toBe(true);
    expect(r.ok && r.reused).toBe(true);
    expect(
      stripeCancel,
      "cancelling here would kill the payment the client is making",
    ).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 7. THE ENTITLEMENT GATE ON EVERY NEW ENTRY POINT.

describe("7. a Free artist is refused server-side at every entry point A3 adds", () => {
  /** The entry points A3 adds. The list doubles as the inventory of gated
   *  surfaces: a third one that forgets the gate has to be added here to be
   *  green, which is a conversation rather than an omission. */
  const NEW_ENTRY_POINTS: Array<
    [string, () => Promise<{ ok: boolean; code?: string; error?: string }>]
  > = [
    [
      "buildPaymentQuote",
      async () => {
        queueQuote();
        const r = await buildPaymentQuote(supabase, REQUEST_ID);
        return r.ok
          ? { ok: true }
          : { ok: false, code: r.code, error: r.error };
      },
    ],
    [
      "createPaymentRequestIntentCore",
      async () => {
        const r = await attempt();
        return r.ok
          ? { ok: true }
          : { ok: false, code: r.quoteCode ?? r.code, error: r.error };
      },
    ],
  ];

  it.each(NEW_ENTRY_POINTS)(
    "%s refuses a lapsed-to-Free artist before any charge",
    async (_name, call) => {
      getAccountOverrides.mockResolvedValue(LAPSED_TO_FREE);
      const r = await call();
      expect(r).toEqual({
        ok: false,
        code: "not_entitled",
        error:
          "This payment isn't available right now. Please contact the artist.",
      });
      expectNothingCharged();
    },
  );

  it.each(NEW_ENTRY_POINTS)(
    "%s refuses rather than failing open when the plan cannot be read",
    async (_name, call) => {
      // A failed entitlement read is an ERROR, never "free plan". Resolving a
      // blip to Free would refuse a payment on a link the artist already sent.
      getAccountOverrides.mockRejectedValue(new Error("db down"));
      const r = await call();
      expect(r).toEqual({
        ok: false,
        code: "failed",
        error: "Couldn't load this payment. Please try again.",
      });
      expectNothingCharged();
    },
  );

  it.each(NEW_ENTRY_POINTS)(
    "%s refuses an entitled artist while `appointment_payments` is paused",
    async (_name, call) => {
      disabledCapabilities = ["appointment_payments"];
      const r = await call();
      expect(r).toEqual({
        ok: false,
        code: "not_entitled",
        error: "Payments are paused right now. Please try again later.",
      });
      expectNothingCharged();
    },
  );

  // ALL SEVEN KEYS, ONE AT A TIME, PLUS THE LEGACY ONE. A gate that is wrong in
  // the permissive direction is invisible to a refusal-only test, so the matrix
  // asserts what each key UNLOCKS as well as what it does not. `deposits` is
  // included because it is the live gate on the OLD deposit path and would be
  // the natural thing for a tired implementation to reach for here.
  const PAYMENT_KEYS: EntitlementFeature[] = [
    "manual_deposit_tracking",
    "card_deposit_collection",
    "appointment_balance_collection",
    "full_appointment_payment_collection",
    "appointment_payment_line_items",
    "appointment_payment_refunds",
    "appointment_payment_insights",
  ];
  const COLLECTS: PaymentRequestCollects[] = [
    "deposit",
    "balance",
    "full_price",
  ];

  it("each of the seven payment keys unlocks exactly its own collection, and nothing else", async () => {
    const matrix: string[] = [];
    for (const key of [...PAYMENT_KEYS, "deposits" as EntitlementFeature]) {
      for (const collects of COLLECTS) {
        ops = [];
        replies = {};
        vi.clearAllMocks();
        getAccountOverrides.mockResolvedValue(freeWith(key));
        getConnectRoutingForArtist.mockResolvedValue({
          stripeAccountId: "acct_test",
          routeCharges: true,
        });
        stripeCreate.mockImplementation(
          (params: Stripe.PaymentIntentCreateParams) =>
            Promise.resolve(createdIntent(params)),
        );

        // ONE line, so `appointment_payment_line_items` is not required and
        // each collection key is tested on its own.
        const r = await attempt({
          request: storedRequest({ collects }),
        });
        matrix.push(`${key} + ${collects} -> ${r.ok ? "ALLOWED" : "refused"}`);
      }
    }

    expect(matrix).toEqual([
      "manual_deposit_tracking + deposit -> refused",
      "manual_deposit_tracking + balance -> refused",
      "manual_deposit_tracking + full_price -> refused",
      "card_deposit_collection + deposit -> ALLOWED",
      "card_deposit_collection + balance -> refused",
      "card_deposit_collection + full_price -> refused",
      "appointment_balance_collection + deposit -> refused",
      "appointment_balance_collection + balance -> ALLOWED",
      "appointment_balance_collection + full_price -> refused",
      "full_appointment_payment_collection + deposit -> refused",
      "full_appointment_payment_collection + balance -> refused",
      "full_appointment_payment_collection + full_price -> ALLOWED",
      "appointment_payment_line_items + deposit -> refused",
      "appointment_payment_line_items + balance -> refused",
      "appointment_payment_line_items + full_price -> refused",
      "appointment_payment_refunds + deposit -> refused",
      "appointment_payment_refunds + balance -> refused",
      "appointment_payment_refunds + full_price -> refused",
      "appointment_payment_insights + deposit -> refused",
      "appointment_payment_insights + balance -> refused",
      "appointment_payment_insights + full_price -> refused",
      // The legacy broad key. It gates the OLD card-deposit path and must not
      // stand for a payment request: spec section 2 exists because one noun for
      // all payment behaviour is how a capability boundary rots.
      "deposits + deposit -> refused",
      "deposits + balance -> refused",
      "deposits + full_price -> refused",
    ]);
  });

  // The itemization key is a SECOND requirement, not an alternative: a
  // multi-line request needs the collection key AND the line-items key.
  it("a second line additionally requires appointment_payment_line_items", async () => {
    const twoLines = [
      serviceLine(),
      serviceLine({
        id: "ln2",
        name: "Aftercare kit",
        classification: "physical_goods",
        unit_amount_minor: 2_000,
        line_total_minor: 2_000,
        position: 1,
      }),
    ];
    const request = storedRequest({ collects: "balance", total_minor: 22_000 });

    getAccountOverrides.mockResolvedValue(
      freeWith("appointment_balance_collection"),
    );
    const withoutItems = await attempt({ request, lines: twoLines });
    expect(withoutItems.ok).toBe(false);
    expectNothingCharged();

    ops = [];
    replies = {};
    vi.clearAllMocks();
    getConnectRoutingForArtist.mockResolvedValue({
      stripeAccountId: "acct_test",
      routeCharges: true,
    });
    stripeCreate.mockImplementation(
      (params: Stripe.PaymentIntentCreateParams) =>
        Promise.resolve(createdIntent(params)),
    );
    getAccountOverrides.mockResolvedValue(
      freeWith(
        "appointment_balance_collection",
        "appointment_payment_line_items",
      ),
    );
    const withItems = await attempt({ request, lines: twoLines });
    expect(withItems.ok, withItems.ok === false ? withItems.error : "").toBe(
      true,
    );
  });

  // NO CONNECTED ACCOUNT IS EVER CREATED HERE (spec section 1: an artist who
  // never upgrades never costs one). Asserted by absence at the module
  // boundary: `ensureConnectAccount` is not imported, so it cannot be mocked
  // into existence, and the read-only routing helper is the only Connect call.
  it("reads Connect routing and never creates an account", async () => {
    await attempt();
    expect(getConnectRoutingForArtist).toHaveBeenCalledWith(ARTIST);
    expect(getConnectRoutingForArtist).toHaveBeenCalledTimes(1);
  });

  // Cached Connect state lies in both directions, and this is the safe half:
  // refusing a collection costs nobody money, and there is no manual fallback
  // on this path to silently degrade into (AGENTS.md, the 2026-07-21 defect).
  it("an artist whose Connect routing is off is refused, never quietly made manual", async () => {
    getConnectRoutingForArtist.mockResolvedValue({
      stripeAccountId: null,
      routeCharges: false,
    });
    const r = await attempt();
    expect(r).toEqual({
      ok: false,
      code: "not_collectable",
      error:
        "The artist can't take card payments right now. Please contact them directly.",
    });
    expect(stripeCreate).not.toHaveBeenCalled();
    expect(writes()).toEqual([]);
  });

  // A Stripe failure is RETURNED, never swallowed into a half-state. The
  // 2026-07-21 production defect was a swallowed create error leaving a booking
  // that rendered as a manual deposit with no pay button.
  it("a Stripe failure returns an error and leaves the row untouched", async () => {
    stripeCreate.mockRejectedValue(new Error("stripe is down"));
    const r = await attempt();
    expect(r).toEqual({
      ok: false,
      code: "stripe_failed",
      error: "We couldn't start this payment. Please try again in a moment.",
    });
    expect(writes(), "the request must not have been claimed").toEqual([]);
  });

  // The narrow half of "cached Connect state lies": a 403 that NAMES the
  // account downgrades the cache. stripe-node maps every 403 to
  // `StripePermissionError`, so a platform-scope fault must not knock the whole
  // fleet onto refusals at once, which is why the test is on the named case.
  it("downgrades cached Connect state only when the error names the account", async () => {
    stripeCreate.mockRejectedValue(new Error("no such account acct_test"));
    isConnectAccountUnreachable.mockReturnValue(true);
    const named = await attempt();
    expect(named.ok === false && named.code).toBe("not_collectable");
    expect(markConnectAccountUnreachable).toHaveBeenCalledWith(ARTIST);

    ops = [];
    replies = {};
    vi.clearAllMocks();
    getAccountOverrides.mockResolvedValue(PLUS);
    getConnectRoutingForArtist.mockResolvedValue({
      stripeAccountId: "acct_test",
      routeCharges: true,
    });
    stripeCreate.mockRejectedValue(new Error("rate limited"));
    isConnectAccountUnreachable.mockReturnValue(false);
    const unnamed = await attempt();
    expect(unnamed.ok === false && unnamed.code).toBe("stripe_failed");
    expect(
      markConnectAccountUnreachable,
      "a platform-scope fault must not downgrade an artist",
    ).not.toHaveBeenCalled();
  });

  // CANCEL AND EXPIRE REFUSE NOBODY, BY DESIGN, and A3 adds no entry point to
  // either. The asymmetry is a decision (a core that STOPS money being asked
  // for must work for an artist who has just lost the plan), so it is asserted
  // rather than left to be re-derived from an absence:
  // `appointment-payments.test.ts` owns the behaviour, and this pins that A3
  // did not quietly add a third surface that would need the same call.
  it("A3 adds exactly two entry points, and both are gated", () => {
    expect(Object.keys(quoteModule).sort()).toEqual([
      "buildPaymentQuote",
      "resolveFinalServicePrice",
      "splitFeeBases",
    ]);
    expect(Object.keys(intentModule).sort()).toEqual([
      "STATUSES_ENTERING_PROCESSING",
      "createPaymentRequestIntentCore",
      "paymentIntentIdempotencyKey",
    ]);
  });
});

// ===========================================================================
// 8. SPEC SECTION 12, the obligations reachable at A3.
//
// "Concurrent attempts" is the one item in this block that a mock cannot reach:
// it needs two connections overlapping in time, and it lives in
// `tests/db/payment-request-intent-race.test.ts`. Everything else is here.

describe("8. spec section 12: duplicate charge, already-paid balance, obsolete revision", () => {
  // DUPLICATE REQUEST, DUPLICATE CHARGE. Ten logical attempts against a request
  // that is already collecting produce ten reads and ZERO creates.
  it("ten attempts against a collecting request produce zero further charges", async () => {
    const processing = storedRequest({
      status: "payment_processing",
      payment_intent_id: INTENT_ID,
      payment_intent_amount_minor: 20_000,
    });
    for (let i = 0; i < 10; i += 1) {
      const r = await attempt({ request: processing });
      expect(r.ok, `attempt ${i}`).toBe(true);
      expect(r.ok && r.paymentIntentId).toBe(INTENT_ID);
    }
    expect(stripeCreate).not.toHaveBeenCalled();
    expect(stripeRetrieve).toHaveBeenCalledTimes(10);
    expect(writes(), "and no attempt re-claimed the row").toEqual([]);
  });

  // A settled or cancelled intent must never hand back a payable secret, even
  // when the row still points at it: the row is behind, not the truth.
  it("a stored intent that has already succeeded is not handed back as payable", async () => {
    stripeRetrieve.mockResolvedValue({
      id: INTENT_ID,
      status: "succeeded",
      client_secret: `${INTENT_ID}_secret`,
      metadata: { payment_request_id: REQUEST_ID },
    } as unknown as Stripe.PaymentIntent);
    const r = await attempt({
      request: storedRequest({
        status: "payment_processing",
        payment_intent_id: INTENT_ID,
        payment_intent_amount_minor: 20_000,
      }),
    });
    expect(r).toEqual({
      ok: false,
      code: "conflict",
      error: "This payment has already been completed. Refresh to see it.",
    });
    expect(stripeCreate).not.toHaveBeenCalled();
  });

  // UNRELATED PAYMENTS ON THE WRONG CLIENT. The stored id is trusted because of
  // a schema property (an artist cannot put their own row into
  // `payment_processing`), and the metadata is verified anyway.
  it("a stored intent naming a DIFFERENT request is refused, not returned", async () => {
    stripeRetrieve.mockResolvedValue({
      id: INTENT_ID,
      status: "requires_payment_method",
      client_secret: `${INTENT_ID}_secret`,
      metadata: { payment_request_id: "pr-someone-else" },
    } as unknown as Stripe.PaymentIntent);
    const r = await attempt({
      request: storedRequest({
        status: "payment_processing",
        payment_intent_id: INTENT_ID,
        payment_intent_amount_minor: 20_000,
      }),
    });
    expect(r).toEqual({
      ok: false,
      code: "conflict",
      error: "We couldn't load this payment. Please contact the artist.",
    });
  });

  // PAYMENT AGAINST AN OBSOLETE REVISION, first half: the predecessor a
  // revision replaced. A2's send cancels it in the same transaction that
  // freezes the successor, so the old link reads `cancelled` and the quote
  // refuses it before Stripe is reached.
  it("the link of a superseded revision is refused with no charge", async () => {
    const r = await attempt({
      request: storedRequest({ status: "cancelled", revision: 1 }),
    });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.quoteCode).toBe("not_payable");
    expectNothingCharged();
  });

  // Second half: the revision moving UNDER an in-flight attempt. The claim
  // carries `.eq("revision", quote.revision)`, so a row that is no longer the
  // revision this attempt quoted is not claimed.
  //
  // DEFENCE IN DEPTH, AND SAID SO. `revision` is in the frozen column list of
  // `enforce_payment_request_immutability` (0125), so a sent row's revision
  // cannot change for ANY role; a revision is a new ROW. The database half is
  // executed in `tests/db/payment-request-intent-race.test.ts`. What this pins
  // is that the filter is present at all, because a mock replaying rows returns
  // a clean result whether or not it was applied.
  it("the claim is scoped to the revision it quoted, and a miss is not success", async () => {
    const r = await attempt({
      claim: { data: [] },
      readBack: { status: "sent", payment_intent_id: null },
    });
    expect(claimOp()?.filters.revision).toBe(1);
    expect(r).toEqual({
      ok: false,
      code: "conflict",
      error: "This payment changed while you were paying. Please refresh.",
    });
    expect(stripeCancel).toHaveBeenCalledWith(INTENT_ID);
  });

  // EXPIRED LINK. The sweep is not guaranteed to have run, so expiry is read at
  // quote time as well: an expired link nobody swept is still expired, and
  // charging against it collects on a price whose validity the artist limited.
  it("an expired link is refused at quote time even if nothing swept it", async () => {
    const r = await attempt({
      request: storedRequest({
        status: "sent",
        expires_at: "2020-01-01T00:00:00.000Z",
      }),
    });
    expect(r.ok === false && r.quoteCode).toBe("expired");
    expect(r.ok === false && r.error).toBe(
      "This payment link has expired. Ask the artist to send a new one.",
    );
    expectNothingCharged();
  });

  // A line nobody could classify has no fee lane, and spec section 6 excludes
  // different things from each one. Guessing produces a wrong fee on a real
  // charge, so the collection refuses and leaves it with the artist.
  it("a manual_review line refuses the collection rather than guessing a lane", async () => {
    const r = await attempt({
      lines: [
        serviceLine(),
        serviceLine({
          id: "ln2",
          name: "Something the importer could not place",
          classification: "manual_review",
          unit_amount_minor: 1_000,
          line_total_minor: 1_000,
          position: 1,
        }),
      ],
      request: storedRequest({ total_minor: 21_000 }),
    });
    expect(r.ok === false && r.quoteCode).toBe("requires_manual_review");
    expectNothingCharged();
  });

  // What A4 is handed, and what it may NOT do with it. Every one of these is
  // evidence of INTENT: per the money-path rules a waiver or a settlement is
  // booked against what Stripe reported, never against this metadata.
  it("the intent carries the subject and the request A4 needs to settle it", async () => {
    const r = await attempt();
    expect(r.ok).toBe(true);
    const { params } = createArgs();
    expect(params.metadata).toEqual({
      payment_request_id: REQUEST_ID,
      artist_id: ARTIST,
      booking_id: BOOKING_ID,
      collects: "balance",
      revision: "1",
      quoted_amount_minor: "20000",
      application_fee_minor: "600",
      appointment_base_minor: "20000",
      goods_base_minor: "0",
      fee_schedule_version: "fees-v1-2026-07-04",
    });
    // Destination charge, artist as merchant of record, same shape as the
    // deposit path. `on_behalf_of` and `transfer_data` must both name the
    // artist's account or the fee lands in the wrong balance.
    expect(params.on_behalf_of).toBe("acct_test");
    expect(params.transfer_data).toEqual({ destination: "acct_test" });
  });
});

// ===========================================================================
// 9. THE REUSED INTENT IS COMPARED TO THE QUOTE IT IS HANDED BACK WITH.
//
// Block 4 pins "one quote" on the CREATE path, where the amount travels from
// the quote into `paymentIntents.create` in the same statement. The REUSE path
// is the other half and it had none of that: it returned the FRESH quote next
// to a STORED intent's secret, comparing only metadata and Stripe status.
//
// EXECUTED BEFORE THE CHECK EXISTED (2026-07-30): a request quoting 15000
// against a stored 20000 intent answered `ok: true`, `quote.amountMinor` 15000,
// `clientSecret` "pi_a3_test_secret". The artist's page says 150.00 and Stripe
// charges 200.00, which is spec section 8's "the displayed amount and the
// Stripe charge come from the same quote" broken by the one path that returns a
// secret it did not create.
//
// THE IDEMPOTENCY KEY CANNOT COVER THIS, so it is a check gap and not a keying
// bug. The key is derived per CREATE, and this branch returns before any key is
// derived: nothing about re-quoting at a new amount can reach an object that is
// only retrieved. The key stops a second intent being minted for one debt; it
// says nothing about handing back a first one that no longer matches.

describe("9. a reused intent must agree with the quote returned beside it", () => {
  /** Status `payment_processing` with a stored intent, which is the only shape
   *  that reaches the reuse path at all. */
  function processing(over: Record<string, unknown> = {}) {
    return storedRequest({
      status: "payment_processing",
      payment_intent_id: INTENT_ID,
      payment_intent_amount_minor: 20_000,
      ...over,
    });
  }

  /** A retrieved intent that is live, names this request, and otherwise agrees
   *  with the default fixture's quote. Each case below moves exactly one fact. */
  function retrieved(over: Record<string, unknown> = {}) {
    return {
      id: INTENT_ID,
      client_secret: `${INTENT_ID}_secret`,
      status: "requires_payment_method",
      amount: 20_000,
      currency: "eur",
      application_fee_amount: 600,
      metadata: { payment_request_id: REQUEST_ID },
      ...over,
    } as unknown as Stripe.PaymentIntent;
  }

  // THE PROBE, and the discriminating case: the collectible remainder MOVED
  // after the intent was created. A 5000 allocation against this request drops
  // the quote to 15000 while the stored intent stays at 20000.
  //
  // KILLING MUTATION, NAMED BEFORE THE RUN: delete the amount comparison from
  // `reuseExistingIntent`. Expected red: `expected true to be false` here, with
  // the secret for a 20000 intent returned next to a 15000 quote.
  it("refuses a stored intent whose amount no longer matches the quote", async () => {
    const r = await attempt({
      request: processing(),
      allocations: [
        allocation({ request_id: REQUEST_ID, amount_minor: 5_000 }),
      ],
    });

    expect(
      r.ok,
      "a 20000 intent must not be returned beside a 15000 quote",
    ).toBe(false);
    expect(r.ok === false && r.code).toBe("conflict");
    expect(r.ok === false && r.error).toBe(
      "This payment changed while you were paying. Please refresh.",
    );
    // REFUSED, NOT CANCELLED. A live intent may be one the client is in the
    // middle of paying (`processing`, `requires_action`), and this path cannot
    // tell that from an abandoned one. Same reasoning as the read-back branch:
    // the destructive move is never taken on an ambiguous reading.
    expect(
      stripeCancel,
      "cancelling could destroy a payment in flight",
    ).not.toHaveBeenCalled();
    expect(writes(), "and nothing was written").toEqual([]);
  });

  // CONTROL. The same reuse with every fact agreeing is still payable, so the
  // refusal above is the comparison and not the fixture.
  it("CONTROL: a stored intent that agrees with the quote is still returned", async () => {
    const r = await attempt({ request: processing() });
    expect(r.ok, r.ok === false ? r.code : "").toBe(true);
    expect(r.ok && r.reused).toBe(true);
    expect(r.ok && r.clientSecret).toBe(`${INTENT_ID}_secret`);
  });

  // EVERY FACT THAT DECIDES THE CHARGE, one at a time, collected so a failure
  // names each fact that stopped being checked rather than stopping at the
  // first. `currency` and `application_fee_amount` are here because they are
  // the other two halves of what Stripe was told: a fee that disagrees is
  // Inklee taking a rate the quote did not state, on a schedule flip.
  it("every fact that decides the charge is compared, not just the amount", async () => {
    const CASES: Array<
      [string, Stripe.PaymentIntent, Record<string, unknown>]
    > = [
      ["amount", retrieved({ amount: 25_000 }), {}],
      ["currency", retrieved({ currency: "usd" }), {}],
      ["application fee", retrieved({ application_fee_amount: 100 }), {}],
      // The stored column (migration 0127) is the server's own record of what
      // the attempt was for, and nothing read it before this. Stripe agrees
      // with the quote here; the ROW does not, so the pair is inconsistent.
      [
        "the stored attempt amount",
        retrieved(),
        { payment_intent_amount_minor: 19_000 },
      ],
    ];

    const returnedAnyway: string[] = [];
    for (const [label, intent, rowOver] of CASES) {
      ops = [];
      replies = {};
      vi.clearAllMocks();
      getAccountOverrides.mockResolvedValue(PLUS);
      getConnectRoutingForArtist.mockResolvedValue({
        stripeAccountId: "acct_test",
        routeCharges: true,
      });
      stripeRetrieve.mockResolvedValue(intent);

      const r = await attempt({ request: processing(rowOver) });
      if (r.ok) returnedAnyway.push(`${label}: returned ${r.clientSecret}`);
      else if (r.code !== "conflict") {
        returnedAnyway.push(`${label}: refused with the wrong code ${r.code}`);
      }
    }
    expect(returnedAnyway).toEqual([]);
  });

  // ORDER MATTERS FOR THE MESSAGE, not for safety. A settled intent is reported
  // as settled rather than as a disagreement, because "already completed" is
  // what the client needs to read. Pinned so a future edit that hoists the
  // comparison above the status check is visible.
  it("a succeeded intent still reports completion, not a disagreement", async () => {
    stripeRetrieve.mockResolvedValue(
      retrieved({ status: "succeeded", amount: 25_000 }),
    );
    const r = await attempt({ request: processing() });
    expect(r.ok === false && r.error).toBe(
      "This payment has already been completed. Refresh to see it.",
    );
  });
});

// ===========================================================================
// 10. NO CALLER CAN ASSERT ITS OWN ENTITLEMENT, ITS OWN CLOCK, OR ITS OWN
//     CEILING.
//
// `CreatePaymentIntentOptions` used to extend `BuildPaymentQuoteOptions`, so a
// money-spending core's PUBLIC signature accepted `overrides`, `now` and
// `finalServicePriceMinor`. Those were test seams and no test ever used them;
// what they actually did was let the caller supply the three server-side facts
// that decide whether money may be taken at all.
//
// EXECUTED BEFORE THEY WERE REMOVED (2026-07-30): with the stored plan lapsed
// to Free, `{ overrides: PLUS }` charged 20000 and `getAccountOverrides` was
// never called. A seam that lets a caller assert its own entitlement is not a
// seam.
//
// ASSERTED BEHAVIOURALLY, NOT BY COUNTING PARAMETERS. Deleting a field from a
// type stops an object literal and nothing else: a `as never` or a spread walks
// straight past it, and an argument the function still reads is the same defect
// wearing a shorter signature. Every test here FORCES the field through and
// asserts the outcome did not move.

describe("10. the server-side facts cannot be supplied by the caller", () => {
  // ENTITLEMENT. The stored plan is the lapsed one; the caller claims Plus.
  //
  // KILLING MUTATION, NAMED BEFORE THE RUN: restore `if (options.overrides)`.
  // Expected red: `expected true to be false` on the refusal, and
  // `getAccountOverrides` uncalled.
  it("a caller-supplied `overrides` cannot buy entitlement it does not have", async () => {
    getAccountOverrides.mockResolvedValue(LAPSED_TO_FREE);
    const r = await forcedAttempt({ overrides: PLUS });

    expect(r.ok, "a caller must not be able to assert its own plan").toBe(
      false,
    );
    expect(r.ok === false && r.quoteCode).toBe("not_entitled");
    expect(
      getAccountOverrides,
      "the plan is read from the server on every attempt",
    ).toHaveBeenCalledWith(ARTIST);
    expectNothingCharged();
  });

  it("the quote reads the plan from the server too, not from its options", async () => {
    getAccountOverrides.mockResolvedValue(LAPSED_TO_FREE);
    const q = await forcedQuote({ overrides: PLUS });
    expect(q.ok).toBe(false);
    expect(q.ok === false && q.code).toBe("not_entitled");
    expect(getAccountOverrides).toHaveBeenCalledWith(ARTIST);
  });

  // EXPIRY. The link ran out in 2020; the caller claims it is 2019.
  //
  // KILLING MUTATION: restore `options.now ?? new Date()`. Expected red:
  // `expected 'expired' to be ...` and a 20000 charge on a dead link.
  it("a caller-supplied `now` cannot revive an expired link", async () => {
    const r = await forcedAttempt(
      { now: new Date("2019-01-01T00:00:00.000Z") },
      { request: storedRequest({ expires_at: "2020-01-01T00:00:00.000Z" }) },
    );

    expect(r.ok, "the clock is the server's, not the caller's").toBe(false);
    expect(r.ok === false && r.quoteCode).toBe("expired");
    expectNothingCharged();
  });

  it("CONTROL: the same forced clock does not break a link that is genuinely live", async () => {
    const r = await forcedAttempt({
      now: new Date("2019-01-01T00:00:00.000Z"),
    });
    expect(r.ok, r.ok === false ? r.code : "").toBe(true);
  });

  // CEILING. The subject already took 15000 of a 20000 debt, so the request's
  // frozen 20000 is above what is still owed. The caller claims a final service
  // price large enough to lift the ceiling over it.
  //
  // KILLING MUTATION: restore `options.finalServicePriceMinor` as
  // `resolveFinalServicePrice`'s first argument. Expected red: `expected true
  // to be false`, with 20000 charged against a balance of 5000.
  it("a caller-supplied `finalServicePriceMinor` cannot lift the subject ceiling", async () => {
    const r = await forcedAttempt(
      { finalServicePriceMinor: 9_999_999 },
      {
        request: storedRequest({ collects: "full_price" }),
        allocations: [allocation({ amount_minor: 15_000 })],
      },
    );

    expect(
      r.ok,
      "the ceiling is derived from stored rows, not from a caller",
    ).toBe(false);
    expect(r.ok === false && r.quoteCode).toBe("above_outstanding");
    expectNothingCharged();
  });
});
