import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  adminClient,
  makeActor,
  destroyActor,
  type Actor,
} from "./helpers/actor";
import { PgSession } from "./helpers/pg-session";

/**
 * THE COLLECTION ATTEMPT, UNDER CONCURRENCY (Plus build P9, slice A3,
 * migration 0127).
 *
 * Spec section 8 lists "concurrent attempts" among the failure modes
 * double-charge prevention has to cover.
 * `tests/db/payment-request-concurrent-send.test.ts` covers the SEND layer: two
 * artists' sessions racing to make a request payable. Nothing covered the
 * INTENT layer, which is a different race with a different loser: two
 * COLLECTION attempts against one payable request, where the thing at stake is
 * a live PaymentIntent rather than a row.
 *
 * WHAT THE UNIT SUITE CANNOT SEE.
 * `src/lib/server/__tests__/appointment-payment-collection.test.ts` drives the
 * same core with a mocked Supabase and proves what it does with a claim that
 * returns zero rows. It cannot prove that a claim ever DOES return zero rows,
 * because "the row moved while this attempt was at Stripe" is not a value a
 * mock can be given: it is an ordering between two connections. That ordering
 * is the whole subject here, and it is the reason the read-back branch exists
 * at all.
 *
 * THE PROPERTY BEING MEASURED IS READ COMMITTED, and it is the same one 0124
 * and 0125 taught this codebase. The core reads the request's status through
 * PostgREST, goes to Stripe, and only then writes. One statement sees one
 * snapshot, so the status it read is stale by the time the write runs. The
 * authoritative test is therefore in the claiming UPDATE's OWN qual: Postgres
 * re-evaluates an UPDATE's qual against the updated row version after blocking
 * on its lock (EvalPlanQual), so a settlement or a cancellation that commits
 * while this attempt waits leaves the claim affecting zero rows instead of
 * overwriting it.
 *
 * The two contended tests differ in ONE thing, deliberately: what the holder
 * commits.
 *
 *   A TWIN of this attempt (the same intent id, because the idempotency key is
 *   derived only from stored state and both halves therefore derive the same
 *   one). Nothing was lost. The loser must return the intent, and must NOT
 *   cancel it: cancelling here kills the payment the client is in the middle
 *   of making.
 *
 *   A CANCELLATION by the artist. The intent now belongs to nothing. The loser
 *   must refuse AND cancel, or a payable object is left behind for a request
 *   that is no longer collecting.
 *
 * Both are only distinguishable by reading the row back, which is why the core
 * reads it back rather than assuming.
 *
 * ---------------------------------------------------------------------------
 * NO STRIPE KEY IS REACHABLE FROM THIS FILE. `STRIPE_SECRET_KEY` is absent from
 * `.env.e2e`, so `@/lib/stripe` exports null, and every call here injects a
 * `vi.fn()` triple as `stripeClient`. The assertions are on what that triple
 * was asked for. Connect routing is mocked to a read-only answer:
 * `ensureConnectAccount` is not imported by the core and cannot be reached.
 *
 * WHAT IS REAL: the database, the two extra connections, the RLS-bypassing
 * service client the core is handed in production, the trigger set, the
 * constraints and the index from 0127, and the core itself.
 */

const getAccountOverrides = vi.fn();
const getConnectRoutingForArtist = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));
vi.mock("@/lib/entitlements-server", () => ({
  getAccountOverrides: (...a: unknown[]) => getAccountOverrides(...a),
}));
vi.mock("@/lib/stripe-connect", () => ({
  getConnectRoutingForArtist: (...a: unknown[]) =>
    getConnectRoutingForArtist(...a),
  isConnectAccountUnreachable: () => false,
  markConnectAccountUnreachable: vi.fn(),
}));

import { DEFAULT_OVERRIDES } from "@/lib/entitlements";
import { createPaymentRequestIntentCore } from "@/lib/server/appointment-payment-intent";

const MARGIN_MS = 1200; // the holder's write lands -> the call under test starts
const HOLD_MS = 2000; // the call is issued -> the holder commits

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const FEE_VERSION = "fees-v1-2026-07-04";
const FAR_FUTURE = new Date(Date.now() + 30 * 864e5).toISOString();
const TOTAL_MINOR = 20_000;
const ACCOUNT = "acct_a3_race";

/**
 * The intent id this test is about, unique per test.
 *
 * A CONSTANT DOES NOT WORK HERE, and finding out why is worth the two lines:
 * 0127's `payment_requests_intent_idx` is a real partial unique index over
 * `payment_intent_id`, so the second test to store the same id raises 23505
 * from the FIXTURE. The first version of this file used one constant and the
 * second contended test failed inside its own setup, which reads as a broken
 * race and is actually the schema working.
 */
let currentIntentId = "";
/** The request the retrieve double should claim to belong to. */
let currentRequestId = "";
let intentSeq = 0;

let admin: SupabaseClient;
let owner: Actor;
let writer: PgSession;
let observer: PgSession;

// ---------------------------------------------------------------------------
// Stripe, doubled. `create` returns a fixed id so the TWIN case can pre-claim
// the row with the very id this attempt is about to hold, which is what makes
// the twin a twin rather than two unrelated intents.

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

function fakeIntent(params?: Partial<Stripe.PaymentIntentCreateParams>) {
  return {
    id: currentIntentId,
    client_secret: `${currentIntentId}_secret`,
    status: "requires_payment_method",
    amount: params?.amount ?? TOTAL_MINOR,
    currency: params?.currency ?? "eur",
    // Echoed, not defaulted to a literal. The reuse path compares a retrieved
    // intent's amount, currency and application fee against the quote it would
    // be returned beside, so a double that drops a field is a disagreement
    // rather than a replay, and the test would be asserting the double.
    application_fee_amount: params?.application_fee_amount ?? null,
    metadata: params?.metadata ?? { payment_request_id: currentRequestId },
  } as unknown as Stripe.PaymentIntent;
}

/**
 * What `create` last produced, which is what `retrieve` answers with.
 *
 * A real PaymentIntent read back is the object that was created, and the reuse
 * path's comparison is against exactly those fields, so replaying the recorded
 * object is what keeps the double honest: a hand-written retrieve stub can
 * agree with the quote by accident or disagree with it by omission, and neither
 * is the property under test here.
 */
let lastCreatedIntent: Stripe.PaymentIntent | null = null;

function createDouble(params: Stripe.PaymentIntentCreateParams) {
  lastCreatedIntent = fakeIntent(params);
  return Promise.resolve(lastCreatedIntent);
}

function callCore(requestId: string) {
  return createPaymentRequestIntentCore(admin, requestId, {
    stripeClient: stripeMock,
  });
}

// ---------------------------------------------------------------------------
// Fixtures. Service role, because they are fixtures rather than the thing under
// test, and every one destructures `error` and asserts it: a silently rejected
// setup write turns a later assertion into a test of nothing, which is how
// eight tests in the P5d suite came to be incapable of failing.

async function freshBooking(): Promise<string> {
  const { data, error } = await admin
    .from("booking_requests")
    .insert({ artist_id: owner.id })
    .select("id")
    .single();
  expect(error, `booking setup failed: ${error?.message}`).toBeNull();
  return data!.id as string;
}

/**
 * A request that is SENT, frozen and payable, with one tattoo-service line.
 *
 * Built as draft -> line -> update, never inserted as `sent` directly: the
 * lines trigger refuses an insert into an already-frozen parent, and the freeze
 * trigger checks `total_minor` against the sum of the lines at the moment
 * `sent_at` goes non-null, so a fixture without the line is unsendable.
 */
async function makeSentRequest(bookingId: string): Promise<string> {
  const { data, error } = await admin
    .from("payment_requests")
    .insert({
      artist_id: owner.id,
      booking_id: bookingId,
      status: "ready",
      currency: "eur",
      collects: "balance",
      total_minor: TOTAL_MINOR,
      revision: 1,
    })
    .select("id")
    .single();
  expect(error, `draft setup failed: ${error?.message}`).toBeNull();
  const id = data!.id as string;

  const line = await admin.from("payment_request_lines").insert({
    request_id: id,
    artist_id: owner.id,
    currency: "eur",
    name: "Tattoo balance",
    quantity: 1,
    unit_amount_minor: TOTAL_MINOR,
    line_total_minor: TOTAL_MINOR,
    classification: "tattoo_service",
    position: 0,
  });
  expect(line.error, `line setup failed: ${line.error?.message}`).toBeNull();

  const sent = await admin
    .from("payment_requests")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      expires_at: FAR_FUTURE,
      fee_schedule_version: FEE_VERSION,
    })
    .eq("id", id)
    .select("id, status")
    .single();
  expect(sent.error, `send setup failed: ${sent.error?.message}`).toBeNull();
  expect(sent.data!.status, "the fixture must actually be sent").toBe("sent");
  return id;
}

/** Read through the superuser session, so RLS cannot hide the truth. */
async function stateOf(id: string): Promise<{
  status: string;
  intentId: string | null;
  intentAmount: number | null;
}> {
  const rows = await observer.query<{
    status: string;
    payment_intent_id: string | null;
    payment_intent_amount_minor: number | null;
  }>(
    `select status::text as status, payment_intent_id, payment_intent_amount_minor
       from payment_requests where id = $1`,
    [id],
  );
  expect(rows, `request ${id} vanished`).toHaveLength(1);
  return {
    status: rows[0].status,
    intentId: rows[0].payment_intent_id,
    intentAmount: rows[0].payment_intent_amount_minor,
  };
}

beforeAll(async () => {
  admin = adminClient();
  writer = PgSession.open("intent-writer");
  observer = PgSession.open("intent-observer");
  owner = await makeActor(admin, "a3-intent");

  // Two backends, asserted rather than assumed. Everything below depends on the
  // holder and the observer being different sessions; a pooled client that
  // silently shared one would turn "hold a transaction open" into two
  // autocommitted statements and every race test would pass while racing
  // nothing.
  const wp = await writer.backendPid();
  const op = await observer.backendPid();
  expect(wp).not.toBe(op);

  // 0127 must actually be applied, or every assertion about the stored attempt
  // is an assertion about a column that does not exist.
  const cols = await observer.query<{ column_name: string }>(
    `select column_name from information_schema.columns
      where table_name = 'payment_requests'
        and column_name in ('payment_intent_id','payment_intent_amount_minor')
      order by column_name`,
  );
  expect(
    cols.map((c) => c.column_name),
    "migration 0127 is not applied to this database",
  ).toEqual(["payment_intent_amount_minor", "payment_intent_id"]);
}, 60_000);

afterAll(async () => {
  // Sessions first: a writer transaction left open would make every cleanup
  // statement below block on its locks until the hook times out, and the
  // failure would look like a broken teardown rather than a test that threw
  // mid-hold.
  await writer.close();
  await observer.close();
  // Requests BEFORE lines: the lines trigger refuses a direct delete of a
  // frozen request's lines for every role, so clearing lines first raises
  // 23514. Deleting the parents lets the cascade do it, which the trigger
  // explicitly tolerates.
  await admin.from("payment_requests").delete().eq("artist_id", owner.id);
  await admin.from("booking_requests").delete().eq("artist_id", owner.id);
  await destroyActor(admin, owner);
}, 60_000);

/** Arm the doubles. Called by `beforeEach` and again by any test that clears
 *  mocks mid-body to count a second round trip from zero. */
function armStripe() {
  getAccountOverrides.mockResolvedValue({
    ...DEFAULT_OVERRIDES,
    planTier: "plus",
  });
  getConnectRoutingForArtist.mockResolvedValue({
    stripeAccountId: ACCOUNT,
    routeCharges: true,
  });
  lastCreatedIntent = null;
  stripeCreate.mockImplementation(createDouble);
  stripeRetrieve.mockImplementation(() =>
    Promise.resolve(lastCreatedIntent ?? fakeIntent()),
  );
  stripeCancel.mockResolvedValue({} as Stripe.PaymentIntent);
}

beforeEach(() => {
  vi.clearAllMocks();
  intentSeq += 1;
  currentIntentId = `pi_a3_race_${intentSeq}`;
  armStripe();
});

// A transaction left open by a test that threw mid-hold would make every
// statement in the NEXT test block on its locks, and the failure would look
// like a race rather than like leaked state.
afterEach(async () => {
  await writer.rollbackIfOpen();
});

// ===========================================================================

describe("the collection attempt: uncontended", () => {
  it("CONTROL (harness): a sent request is claimed, and the attempt is recorded", async () => {
    // Proves the harness can produce a SUCCESS at all. Without it, a refusal in
    // any contended test below could be an artefact of the fixtures rather than
    // a property of the core.
    const requestId = await makeSentRequest(await freshBooking());
    currentRequestId = requestId;

    const r = await callCore(requestId);
    expect(r.ok, r.ok === false ? `${r.code}: ${r.error}` : "").toBe(true);
    expect(r.ok && r.reused).toBe(false);
    expect(stripeCreate).toHaveBeenCalledTimes(1);
    expect(stripeCancel).not.toHaveBeenCalled();

    const after = await stateOf(requestId);
    expect(after.status).toBe("payment_processing");
    expect(after.intentId).toBe(currentIntentId);
    expect(
      after.intentAmount,
      "the attempt's size is what A4 reconciles against, not total_minor",
    ).toBe(TOTAL_MINOR);
  });

  it("a second attempt on the SAME row creates nothing: the replay is answered from the database", async () => {
    // The duplicate-charge property proven against the real row rather than
    // against a mocked read. Stripe's own idempotency key expires after 24
    // hours; this is what answers a visit on day two, and 0127 exists for it.
    const requestId = await makeSentRequest(await freshBooking());
    currentRequestId = requestId;

    const first = await callCore(requestId);
    expect(first.ok && first.reused).toBe(false);

    vi.clearAllMocks();
    stripeCreate.mockImplementation(createDouble);
    // The object the FIRST attempt created, replayed exactly. Stripe returns
    // what was created, and the reuse path compares it against the fresh quote:
    // rebuilding it by hand here would let the double, rather than the core,
    // decide whether the two agree.
    const created = lastCreatedIntent as Stripe.PaymentIntent;
    expect(created?.id, "the first attempt must have created one").toBe(
      currentIntentId,
    );
    stripeRetrieve.mockResolvedValue(created);
    getAccountOverrides.mockResolvedValue({
      ...DEFAULT_OVERRIDES,
      planTier: "plus",
    });
    getConnectRoutingForArtist.mockResolvedValue({
      stripeAccountId: ACCOUNT,
      routeCharges: true,
    });

    const second = await callCore(requestId);
    expect(second.ok).toBe(true);
    expect(second.ok && second.reused).toBe(true);
    expect(second.ok && second.paymentIntentId).toBe(currentIntentId);
    expect(
      stripeCreate,
      "a second live intent for one debt is the defect this closes",
    ).not.toHaveBeenCalled();
    expect(stripeRetrieve).toHaveBeenCalledTimes(1);
  });
});

describe("the collection attempt: two connections, overlapping in time", () => {
  it("loses the claim to a TWIN holding the same intent, and cancels nothing", async () => {
    const requestId = await makeSentRequest(await freshBooking());
    currentRequestId = requestId;

    // The twin. It claims the row with the SAME intent id, which is not a
    // convenience: the idempotency key is derived only from stored state, so
    // two concurrent first attempts send Stripe the same key and receive the
    // same PaymentIntent. Held uncommitted.
    await writer.begin();
    await writer.query(
      `update payment_requests
          set status = 'payment_processing',
              payment_intent_id = $2,
              payment_intent_amount_minor = $3
        where id = $1`,
      [requestId, currentIntentId, TOTAL_MINOR],
    );
    const writerPid = await writer.backendPid();
    await sleep(MARGIN_MS);

    const startedAt = Date.now();
    const pending = callCore(requestId);
    await sleep(HOLD_MS);
    // THE BEHAVIOURAL PROOF OF CONTENTION. Timing alone cannot distinguish "the
    // claim blocked on the twin's row lock" from "the claim was slow", and a
    // race test that cannot tell those apart can pass for the wrong reason.
    const blocked = await observer.countBlockedBy(writerPid);
    await writer.commit();

    const r = await pending;
    const elapsed = Date.now() - startedAt;
    const trace = `blocked=${blocked} elapsed=${elapsed}ms`;

    expect(
      blocked,
      `a backend must have been waiting on the twin: ${trace}`,
    ).toBeGreaterThanOrEqual(1);
    expect(
      elapsed,
      `the call must have waited for the commit: ${trace}`,
    ).toBeGreaterThanOrEqual(HOLD_MS);

    // Nothing was lost: the winner holds the same object this attempt holds.
    expect(r.ok, r.ok === false ? `${r.code} (${trace})` : "").toBe(true);
    expect(r.ok && r.reused, trace).toBe(true);
    expect(r.ok && r.paymentIntentId).toBe(currentIntentId);
    expect(
      stripeCancel,
      `cancelling here kills the payment the client is making: ${trace}`,
    ).not.toHaveBeenCalled();

    // And the winner's row was NOT overwritten by the loser.
    const after = await stateOf(requestId);
    expect(after.status).toBe("payment_processing");
    expect(after.intentId).toBe(currentIntentId);
  });

  it("loses the claim to a CANCELLATION, refuses, and cancels the orphaned intent", async () => {
    const requestId = await makeSentRequest(await freshBooking());
    currentRequestId = requestId;

    // Same shape, one difference: the holder withdraws the request instead of
    // collecting against it. `sent -> cancelled` is a legal move and one the
    // artist may perform, so this is the realistic version of "the row moved".
    await writer.begin();
    await writer.query(
      `update payment_requests
          set status = 'cancelled', cancelled_at = now()
        where id = $1`,
      [requestId],
    );
    const writerPid = await writer.backendPid();
    await sleep(MARGIN_MS);

    const startedAt = Date.now();
    const pending = callCore(requestId);
    await sleep(HOLD_MS);
    const blocked = await observer.countBlockedBy(writerPid);
    await writer.commit();

    const r = await pending;
    const elapsed = Date.now() - startedAt;
    const trace = `blocked=${blocked} elapsed=${elapsed}ms`;

    expect(
      blocked,
      `a backend must have been waiting: ${trace}`,
    ).toBeGreaterThanOrEqual(1);
    expect(elapsed, trace).toBeGreaterThanOrEqual(HOLD_MS);

    // The attempt WAS made: the quote saw a payable row, because it read a
    // snapshot taken before the cancellation committed. That is the point. What
    // must not happen is the claim landing anyway.
    expect(stripeCreate, trace).toHaveBeenCalledTimes(1);
    expect(r.ok, trace).toBe(false);
    expect(r.ok === false && r.code, trace).toBe("conflict");
    expect(
      stripeCancel,
      `an intent nothing references must not be left live: ${trace}`,
    ).toHaveBeenCalledWith(currentIntentId);

    // The artist's cancellation stands. A claim that overwrote it would have
    // resurrected a withdrawn request into collecting money.
    const after = await stateOf(requestId);
    expect(after.status, `the cancellation must survive: ${trace}`).toBe(
      "cancelled",
    );
    expect(after.intentId, "and no attempt may be recorded on it").toBeNull();
  });

  it("CONTROL (sequential): the same cancellation committed BEFORE the call creates no intent at all", async () => {
    // The contrast that shows the previous test is snapshot-scoped rather than
    // a broken predicate. Same fixture, same two states, same refusal expected.
    // The ONLY difference is that the cancellation commits before the call
    // begins, so every snapshot inside the core already contains it, and the
    // quote refuses before Stripe is reached.
    const requestId = await makeSentRequest(await freshBooking());
    currentRequestId = requestId;

    await writer.begin();
    await writer.query(
      `update payment_requests set status = 'cancelled', cancelled_at = now() where id = $1`,
      [requestId],
    );
    await writer.commit();

    const r = await callCore(requestId);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.code).toBe("quote_refused");
    expect(r.ok === false && r.quoteCode).toBe("not_payable");
    expect(
      stripeCreate,
      "a refusal that costs a PaymentIntent is not a refusal",
    ).not.toHaveBeenCalled();
    expect(stripeCancel).not.toHaveBeenCalled();
  });
});

describe("what the schema, not the core, makes impossible", () => {
  it("a sent request's revision cannot change, so the claim's revision filter is depth", async () => {
    // The unit suite pins that the claim carries `.eq("revision", …)`. This is
    // why that filter can never be the thing that saves it: `revision` is in
    // the frozen column list of `enforce_payment_request_immutability` (0125),
    // and a revision is a new ROW rather than an edit. Executed on the
    // superuser session, because the trigger is `security invoker` and binds
    // every role including the service role the core runs as.
    const requestId = await makeSentRequest(await freshBooking());
    await expect(
      writer.query(`update payment_requests set revision = 2 where id = $1`, [
        requestId,
      ]),
    ).rejects.toThrow(/payment_request_frozen/);
  });

  it("two requests cannot collect against ONE intent (0127's partial unique index)", async () => {
    // Spec section 8, "cross-appointment deposit application": one intent
    // settling against two requests would let one payment discharge two debts.
    // An index rather than a constraint, because a unique constraint cannot be
    // partial, and it binds the service role, which RLS never does.
    const a = await makeSentRequest(await freshBooking());
    const b = await makeSentRequest(await freshBooking());
    const shared = `pi_shared_${Date.now()}`;

    const first = await admin
      .from("payment_requests")
      .update({
        status: "payment_processing",
        payment_intent_id: shared,
        payment_intent_amount_minor: TOTAL_MINOR,
      })
      .eq("id", a)
      .select("id");
    expect(first.error, first.error?.message).toBeNull();
    expect(first.data).toHaveLength(1);

    const second = await admin
      .from("payment_requests")
      .update({
        status: "payment_processing",
        payment_intent_id: shared,
        payment_intent_amount_minor: TOTAL_MINOR,
      })
      .eq("id", b)
      .select("id");
    expect(second.error?.code, "expected a unique violation").toBe("23505");
  });

  it("the stored attempt is all-or-nothing: an id with no amount is refused", async () => {
    // An id with no amount is an attempt whose size nobody recorded, and an
    // amount with no id is a quote pretending to be an attempt. Either half
    // alone would be read as the whole by A4.
    const requestId = await makeSentRequest(await freshBooking());
    const half = await admin
      .from("payment_requests")
      .update({ payment_intent_id: "pi_half" })
      .eq("id", requestId)
      .select("id");
    expect(half.error?.code, "expected a check violation").toBe("23514");
    expect(half.error?.message).toMatch(/payment_requests_intent_pair_check/);

    const zero = await admin
      .from("payment_requests")
      .update({
        payment_intent_id: "pi_zero",
        payment_intent_amount_minor: 0,
      })
      .eq("id", requestId)
      .select("id");
    expect(zero.error?.code, "a zero-amount attempt is not an attempt").toBe(
      "23514",
    );
  });
});
