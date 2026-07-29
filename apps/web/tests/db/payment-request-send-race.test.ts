import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  adminClient,
  makeActor,
  destroyActor,
  type Actor,
} from "./helpers/actor";
import { PgSession } from "./helpers/pg-session";

/**
 * SEND, UNDER CONCURRENCY (Plus build P9, slice A2, migration 0126).
 *
 * Sending a payment request is a state transition that touches TWO rows: the
 * successor freezes and becomes payable, and the request it replaces is
 * cancelled. `send_payment_request` does both in one transaction, locks the
 * predecessor, and re-checks it in a LATER statement. This file is why those
 * three properties are there, and it is the artifact that goes red when any of
 * them is removed.
 *
 * WHAT THE OTHER TESTS CANNOT SEE. `appointment-payments-rls.test.ts` proves
 * the policies, the composite keys and the freeze. Every unit test of the pure
 * model proves the transition table. All of them are green against a send that
 * loses data, because the defect is not in the rule: it is in WHEN the rule is
 * evaluated, and that is only observable with two connections overlapping in
 * time, which PostgREST alone cannot arrange.
 *
 * ---------------------------------------------------------------------------
 * WHY THE PARTIAL UNIQUE INDEX IS NOT THE WHOLE ANSWER, since it looks like it
 * should be. 0125's `payment_requests_one_payable_per_*_idx` makes two payable
 * requests per subject UNSTORABLE, for every role, whatever the application
 * does. Executed while designing this file: with a payable request outstanding,
 * a second request for the same appointment cannot be flipped to `sent` at all,
 * so "two live requests against one balance" is closed by the schema and no
 * amount of naive application code reopens it.
 *
 * What the index cannot see is a predecessor that has left the payable set by
 * SETTLING. `paid` is not payable, so the index has nothing to say, and a send
 * that read the predecessor as `sent` a moment earlier will happily freeze a
 * replacement: the client is then asked to pay a balance they have already
 * paid, which is spec section 8's covered failure mode. That is the shape
 * REGRESSION A reproduces, and it is the 0124 shape exactly.
 *
 * The second thing the index cannot do is make the cancel and the freeze
 * atomic. Through PostgREST they are two transactions, and the cancel has to go
 * FIRST (the index refuses the freeze while the predecessor is still payable),
 * so anything that fails the freeze afterwards leaves the artist's outstanding
 * request destroyed and nothing sent. That is REGRESSION B, and the test
 * immediately below it performs the two-round-trip version and asserts the
 * damage, so B's green means something.
 *
 * ---------------------------------------------------------------------------
 * EXECUTED, on the local stack (127.0.0.1:54322), each run bracketed by
 * `md5(prosrc)` so a red run names WHICH body produced it. `fn_md5` is carried
 * in the failure messages. Verbatim:
 *
 *  1. SHIPPED body (0126), md5 `ccf1ba94aeb00939022189a6584d7ded`: GREEN, 8/8.
 *
 *  2. NAIVE CHECK-THEN-WRITE, md5 `11c7f6a514936f9faf92aaf059fc333b`. Exactly
 *     two deletions from the shipped body: the predecessor's
 *     `perform 1 … for update`, and the `and status = v_pred_status` guard on
 *     its cancel. In other words: read the status, then act on the reading.
 *     RED, with data damage rather than on a technicality.
 *
 *       REGRESSION A: `expected 'sent' to be 'supersedes_settled'`,
 *       `settled=+0ms rpcIssued=+1213ms committed=+3257ms rpcReturned=+3266ms
 *       blockedFor=2053ms blockedByWriter=1`.
 *
 *     Every guard above the verdict passed, so the run WAS a race: the send
 *     blocked for 2.05s on the settlement and a backend really was waiting on
 *     the writer. The re-check had already run, on a snapshot taken before the
 *     settlement committed, seen `sent`, and concluded the predecessor was
 *     replaceable. It then froze a replacement for a balance the client had
 *     already paid, and answered `sent`.
 *
 *     Note REGRESSION B stayed GREEN here, and that is not a weakness in it:
 *     this variant keeps the SUCCESSOR lock, which is the property B measures.
 *     The two tests cover two different locks and neither substitutes for the
 *     other.
 *
 *     The predecessor was not cancelled in this run, and the reason is worth
 *     recording because it is easy to mistake for the naive body being safe.
 *     0125's UPDATE policy USING clause excludes `paid`, so the cancel affected
 *     ZERO ROWS AND RAISED NOTHING. Probed directly rather than inferred: as
 *     `authenticated`, `update payment_requests set status='cancelled' where
 *     id=<paid row>` returns `rows: 0, error: null`, while the same artist's
 *     plain SELECT still reads the row as `paid`. That asymmetry is exactly
 *     what the shipped body's re-check relies on, and it is also why the naive
 *     body never learned that it had failed.
 *
 *  3. NEAR MISS, and the reason the optimistic guard is in the shipped body.
 *     Lock removed, `and status = v_pred_status` KEPT, md5
 *     `52ff67a115597e7876ec5d4f7cf3bf7d`: still RED,
 *     `expected 'supersedes_changed' to be 'supersedes_settled'`,
 *     `blockedFor=2048ms blockedByWriter=1`. No data was harmed: the cancel's
 *     own qual caught the stale reading. But it refuses for the wrong reason,
 *     tells the artist to refresh instead of telling them a payment has been
 *     made, and its safety rests entirely on a guard rather than on knowing the
 *     truth. A body that is right by accident is one edit away from being
 *     wrong.
 *
 *  4. Re-applying 0126 returns `md5` to `ccf1ba94aeb00939022189a6584d7ded` and
 *     the file to GREEN, so its result tracks the function body rather than the
 *     weather.
 *
 * Runs 2 and 3 were produced by `create or replace`-ing the body directly
 * against the local database and restoring it afterwards. NOTHING IN THIS FILE
 * MODIFIES THE SCHEMA: a test that rewrites the thing it is testing is not a
 * gate.
 *
 * Treat these md5s as identifying a RUN, never as a schema check: `prosrc`
 * includes comments, so the fingerprint moves whenever the body's comments are
 * edited.
 */

const MARGIN_MS = 1200; // the held write lands -> the call under test is issued
const HOLD_MS = 2000; // the call is issued -> the holder commits

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const FEE_VERSION = "fees-v1-2026-07-04";
const FAR_FUTURE = new Date(Date.now() + 30 * 864e5).toISOString();

let admin: SupabaseClient;
let owner: Actor;
let writer: PgSession;
let observer: PgSession;
/** md5 of the deployed function body, so a red run names WHICH body it ran. */
let fnFingerprint = "unknown";

// ---------------------------------------------------------------------------
// Fixtures. Written on the SERVICE ROLE because they are fixtures, not the
// thing under test, and every one destructures `error` and asserts it: a
// silently rejected setup write turns a later assertion into a test of nothing,
// which is how eight tests in the P5d suite came to be unable to fail.

async function freshBooking(): Promise<string> {
  const { data, error } = await admin
    .from("booking_requests")
    .insert({ artist_id: owner.id })
    .select("id")
    .single();
  expect(error, `booking setup failed: ${error?.message}`).toBeNull();
  return data!.id as string;
}

/** A draft request plus ONE line that sums to its total. Both are needed: the
 *  freeze trigger verifies `total_minor` against the sum of the lines, so a
 *  request with no lines is unsendable and would make every send below refuse
 *  for a reason that has nothing to do with concurrency. */
async function makeDraft(args: {
  bookingId: string;
  totalMinor: number;
  revision?: number;
  supersedesId?: string | null;
  status?: "draft" | "ready";
}): Promise<string> {
  const { data, error } = await admin
    .from("payment_requests")
    .insert({
      artist_id: owner.id,
      booking_id: args.bookingId,
      status: args.status ?? "ready",
      currency: "eur",
      collects: "balance",
      total_minor: args.totalMinor,
      revision: args.revision ?? 1,
      supersedes_id: args.supersedesId ?? null,
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
    unit_amount_minor: args.totalMinor,
    line_total_minor: args.totalMinor,
    classification: "tattoo_service",
    position: 0,
  });
  expect(line.error, `line setup failed: ${line.error?.message}`).toBeNull();
  return id;
}

/** A request that is already SENT, i.e. frozen and payable.
 *
 *  Built as draft -> lines -> update, never inserted as `sent` directly: the
 *  lines trigger refuses an insert into an already-frozen parent, so the other
 *  order does not work and a fixture that skipped the lines would be unsendable
 *  in a way that quietly changes what every test below is measuring. */
async function makeSentRequest(
  bookingId: string,
  totalMinor: number,
): Promise<string> {
  const id = await makeDraft({ bookingId, totalMinor });
  const { data, error } = await admin
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
  expect(error, `send setup failed: ${error?.message}`).toBeNull();
  expect(data!.status, "the fixture must actually be sent").toBe("sent");
  return id;
}

function callSend(requestId: string) {
  return owner.client.rpc("send_payment_request", {
    p_request_id: requestId,
    p_artist_id: owner.id,
    p_expires_at: FAR_FUTURE,
    p_fee_schedule_version: FEE_VERSION,
  });
}

/** Reads through the superuser session, so RLS cannot hide the truth. */
async function stateOf(
  id: string,
): Promise<{
  status: string;
  sentAt: string | null;
  cancelledAt: string | null;
}> {
  const rows = await observer.query<{
    status: string;
    sent_at: string | null;
    cancelled_at: string | null;
  }>(
    "select status::text as status, sent_at, cancelled_at from payment_requests where id = $1",
    [id],
  );
  expect(rows, `request ${id} vanished`).toHaveLength(1);
  return {
    status: rows[0].status,
    sentAt: rows[0].sent_at,
    cancelledAt: rows[0].cancelled_at,
  };
}

beforeAll(async () => {
  admin = adminClient();
  writer = PgSession.open("send-writer");
  observer = PgSession.open("send-observer");
  owner = await makeActor(admin, "a2-send");

  const rows = await observer.query<{ md5: string }>(
    "select md5(prosrc) as md5 from pg_proc where proname = 'send_payment_request'",
  );
  expect(
    rows,
    "send_payment_request must exist, or nothing below is testing anything",
  ).toHaveLength(1);
  fnFingerprint = rows[0].md5;
}, 60_000);

afterAll(async () => {
  // Sessions first. A writer transaction left open would make every cleanup
  // statement below block on its locks until the hook times out, and the
  // failure would look like a broken teardown rather than a test that threw
  // mid-hold.
  await writer.close();
  await observer.close();
  // Requests BEFORE lines, and the order is not arbitrary: the lines trigger
  // refuses a direct delete of a frozen request's lines for EVERY role, so
  // clearing lines first raises 23514 and only works because the cascade from
  // the parent tidies up afterwards. Deleting the parents lets the cascade do
  // it, which the trigger explicitly tolerates. Probed: as the service role,
  // `delete from payment_request_lines where artist_id = …` against a sent
  // request returns `payment_request_lines_frozen`.
  await admin.from("payment_requests").delete().eq("artist_id", owner.id);
  await admin.from("booking_requests").delete().eq("artist_id", owner.id);
  await destroyActor(admin, owner);
}, 60_000);

describe("send_payment_request: privileges", () => {
  it("is callable by authenticated and NOT by anon", async () => {
    // `set role anon` segfaults this Postgres image, so the privilege is read
    // from the catalog rather than exercised.
    const rows = await observer.query<{ rolname: string; ex: boolean }>(
      `select r.rolname,
              has_function_privilege(
                r.rolname,
                'public.send_payment_request(uuid,uuid,timestamptz,text)',
                'EXECUTE') as ex
         from pg_roles r
        where r.rolname in ('anon', 'authenticated')
        order by r.rolname`,
    );
    expect(rows).toEqual([
      { rolname: "anon", ex: false },
      { rolname: "authenticated", ex: true },
    ]);
  });
});

describe("send_payment_request: uncontended", () => {
  it("CONTROL (harness): a ready draft with no predecessor sends", async () => {
    // Proves the harness can produce a `sent` verdict at all. Without this, a
    // refusal anywhere below could be an artefact of the fixtures rather than a
    // property of the function.
    const bookingId = await freshBooking();
    const draft = await makeDraft({ bookingId, totalMinor: 12_000 });

    const { data: verdict, error } = await callSend(draft);
    expect(error, error?.message).toBeNull();
    expect(verdict, `fn_md5=${fnFingerprint}`).toBe("sent");

    const after = await stateOf(draft);
    expect(after.status).toBe("sent");
    expect(after.sentAt, "the freeze latch must be set").not.toBeNull();
  });

  it("CONTROL (sequential): a predecessor that settled BEFORE the call is refused", async () => {
    // The contrast that shows REGRESSION A is snapshot-scoped rather than a
    // broken predicate. Same fixture, same two rows, same verdict expected. The
    // ONLY difference is that the settlement commits before the call begins, so
    // every snapshot inside the function already contains it.
    const bookingId = await freshBooking();
    const predecessor = await makeSentRequest(bookingId, 20_000);
    const successor = await makeDraft({
      bookingId,
      totalMinor: 25_000,
      revision: 2,
      supersedesId: predecessor,
    });

    await writer.begin();
    await writer.query(
      "update payment_requests set status = 'paid', updated_at = now() where id = $1",
      [predecessor],
    );
    await writer.commit();
    expect((await stateOf(predecessor)).status).toBe("paid");

    const { data: verdict, error } = await callSend(successor);
    expect(error, error?.message).toBeNull();
    expect(verdict, `fn_md5=${fnFingerprint}`).toBe("supersedes_settled");
    expect((await stateOf(successor)).sentAt).toBeNull();
    expect((await stateOf(predecessor)).status).toBe("paid");
  });

  it("cancels the predecessor and freezes the successor as ONE outcome", async () => {
    // "Cancelled and replaced" and "a new revision" are the two halves of one
    // operation. Asserted together, because a green half is exactly how they
    // would drift.
    const bookingId = await freshBooking();
    const predecessor = await makeSentRequest(bookingId, 20_000);
    const successor = await makeDraft({
      bookingId,
      totalMinor: 25_000,
      revision: 2,
      supersedesId: predecessor,
    });

    const { data: verdict, error } = await callSend(successor);
    expect(error, error?.message).toBeNull();
    expect(verdict, `fn_md5=${fnFingerprint}`).toBe("sent");

    const before = await stateOf(predecessor);
    const after = await stateOf(successor);
    expect(before.status, "the replaced request must be cancelled").toBe(
      "cancelled",
    );
    expect(before.cancelledAt).not.toBeNull();
    expect(after.status, "the replacement must be payable").toBe("sent");
    expect(after.sentAt).not.toBeNull();
  });

  it("refuses a revision that names ANOTHER subject's outstanding request, and leaves it payable", async () => {
    // THE ONE BRANCH NOTHING ELSE MEASURES. `supersedes_id` carries a composite
    // FK on (id, artist_id, currency), which deliberately does NOT bind the
    // subject, so the schema is perfectly happy for booking B's revision to name
    // booking A's outstanding request. Between that and an artist cancelling one
    // appointment's client link by sending another appointment's revision there
    // is exactly one thing: the `supersedes_foreign` test in the function body.
    //
    // MEASURED, by deleting those four lines from the deployed body and running
    // this file (2026-07-29, local stack): the send returned `sent`, FROZE the
    // revision on booking B, and CANCELLED booking A's outstanding request. The
    // whole 152-test database suite stayed green through that deletion, which is
    // what makes this test the artifact rather than a restatement. The
    // verdict-token test in the unit suite reads the migration FILE, so it pins
    // file-to-TypeScript agreement and cannot see a deployed body that lost the
    // branch.
    //
    // BOTH halves are asserted on purpose. The verdict alone would be satisfied
    // by a body that refuses for the wrong reason after cancelling, which is the
    // failure this exists to catch.
    const bookingA = await freshBooking();
    const bookingB = await freshBooking();
    const outstandingOnA = await makeSentRequest(bookingA, 20_000);
    const revisionOnB = await makeDraft({
      bookingId: bookingB,
      totalMinor: 30_000,
      revision: 2,
      supersedesId: outstandingOnA,
    });

    // The predecessor starts payable, or a surviving `sent` below would prove
    // nothing about the send.
    expect(
      (await stateOf(outstandingOnA)).status,
      "booking A's request must start payable",
    ).toBe("sent");

    const { data: verdict, error } = await callSend(revisionOnB);
    expect(error, error?.message).toBeNull();
    expect(verdict, `fn_md5=${fnFingerprint}`).toBe("supersedes_foreign");

    const a = await stateOf(outstandingOnA);
    expect(a.status, "the OTHER appointment's request must survive").toBe(
      "sent",
    );
    expect(a.cancelledAt, "and it must not have been cancelled").toBeNull();

    const b = await stateOf(revisionOnB);
    expect(b.status, "and nothing may have been frozen").toBe("ready");
    expect(b.sentAt).toBeNull();
  });

  it("refuses a second payable request for the same appointment", async () => {
    // The unique index, reached through the pre-check that exists to give this
    // a message rather than a constraint name.
    const bookingId = await freshBooking();
    await makeSentRequest(bookingId, 20_000);
    const other = await makeDraft({ bookingId, totalMinor: 5_000 });

    const { data: verdict, error } = await callSend(other);
    expect(error, error?.message).toBeNull();
    expect(verdict, `fn_md5=${fnFingerprint}`).toBe("already_outstanding");
    expect((await stateOf(other)).sentAt).toBeNull();
  });
});

// ===========================================================================

describe("send_payment_request under concurrency", () => {
  it("REGRESSION A: a settlement that commits WHILE the send waits must be seen", async () => {
    // THE 0124 SHAPE, on the money path. A revision is sent while the request
    // it replaces is being paid. Under READ COMMITTED a statement evaluates
    // against ONE snapshot taken when it begins, and BLOCKING ON A LOCK DOES
    // NOT RE-EVALUATE A SUBQUERY, so a body that reads the predecessor and then
    // acts on the reading freezes a replacement for a balance that has just
    // been paid.
    //
    // The partial unique index cannot cover this: `paid` is not payable, so it
    // has nothing to say. The lock and the later-statement re-check are the
    // whole defence.
    const bookingId = await freshBooking();
    const predecessor = await makeSentRequest(bookingId, 20_000);
    const successor = await makeDraft({
      bookingId,
      totalMinor: 25_000,
      revision: 2,
      supersedesId: predecessor,
    });

    // The predecessor starts SENT and unsettled. Deliberate and load-bearing:
    // it means the pre-race verdict is unambiguously `sent`, proven by the
    // third test above on the identical fixture, so a `supersedes_settled` here
    // can only have come from the concurrent settlement.
    expect(
      (await stateOf(predecessor)).status,
      "the predecessor must start payable, or the refusal proves nothing",
    ).toBe("sent");

    const t: Record<string, number> = {};
    let verdict: unknown;
    let rpcError: { code?: string; message?: string } | null = null;
    let writerPid = -1;
    let visibleOutside = "";
    let blockedByWriter = -1;

    try {
      writerPid = await writer.backendPid();
      await writer.begin();

      // SESSION 1 is A4's webhook: the SERVICE ROLE, which bypasses RLS, moving
      // the request through the states Stripe reports. Held uncommitted, which
      // is the one thing PostgREST cannot arrange and the whole reason
      // PgSession exists.
      await writer.query(
        "update payment_requests set status = 'payment_processing', updated_at = now() where id = $1",
        [predecessor],
      );
      await writer.query(
        "update payment_requests set status = 'paid', updated_at = now() where id = $1",
        [predecessor],
      );
      t.settled = Date.now();
      visibleOutside = (await stateOf(predecessor)).status;

      // A WIDE margin. The window this defect needs is not microseconds: the
      // re-check's snapshot is fixed when its statement begins, and the
      // writer's lock parks the function there for as long as the writer holds.
      await sleep(MARGIN_MS);

      // SESSION 2 calls through the real PostgREST path as the real artist, so
      // the policies under test are the ones production runs.
      t.rpcIssued = Date.now();
      const rpcPromise = callSend(successor).then((res) => {
        t.rpcReturned = Date.now();
        return res;
      });

      // THE OVERLAP, MEASURED. `pg_blocking_pids` is what makes this a race
      // test rather than two statements that happened to be near each other in
      // time. If this reads 0, the sessions never contended and the verdict
      // below is meaningless whichever way it goes.
      await sleep(Math.floor(HOLD_MS / 2));
      blockedByWriter = await observer.countBlockedBy(writerPid);

      await sleep(HOLD_MS - Math.floor(HOLD_MS / 2));
      await writer.commit();
      t.committed = Date.now();

      const res = await rpcPromise;
      verdict = res.data;
      rpcError = res.error;
    } finally {
      await writer.rollbackIfOpen();
    }

    const blockedMs = (t.rpcReturned ?? 0) - (t.rpcIssued ?? 0);
    const timeline =
      `settled=+0ms rpcIssued=+${t.rpcIssued - t.settled}ms ` +
      `committed=+${t.committed - t.settled}ms ` +
      `rpcReturned=+${t.rpcReturned - t.settled}ms ` +
      `blockedFor=${blockedMs}ms blockedByWriter=${blockedByWriter} ` +
      `fn_md5=${fnFingerprint}`;

    // --- the run was actually a race -------------------------------------
    expect(
      visibleOutside,
      "the settlement must still be UNCOMMITTED when the send is issued",
    ).toBe("sent");
    expect(
      t.rpcIssued,
      "the send must be issued BEFORE the settlement commits",
    ).toBeLessThan(t.committed);
    expect(
      blockedByWriter,
      `no backend was blocked by the writer, so the two sessions never contended (${timeline})`,
    ).toBeGreaterThanOrEqual(1);
    expect(
      blockedMs,
      `the send returned without waiting for the writer, so there was no race (${timeline})`,
    ).toBeGreaterThanOrEqual(HOLD_MS / 2);
    expect(
      rpcError,
      `the send must reach a verdict, not fail (${rpcError?.code}: ${rpcError?.message})`,
    ).toBeNull();

    // --- the verdict ------------------------------------------------------
    // A payment that COMMITTED before this call returned is a payment that
    // happened. The rule does not become conditional on when the client got
    // there.
    expect(
      verdict,
      `a request whose predecessor was paid while this waited must be refused (${timeline})`,
    ).toBe("supersedes_settled");

    // --- and the verdict meant something ----------------------------------
    const after = await stateOf(successor);
    expect(
      after.sentAt,
      `the replacement must NOT be payable: the client already paid (${timeline})`,
    ).toBeNull();
    expect(
      after.status,
      `the replacement must stay a draft (${timeline})`,
    ).toBe("ready");
    const pred = await stateOf(predecessor);
    expect(
      pred.status,
      `the paid request must survive untouched (${timeline})`,
    ).toBe("paid");
    expect(
      pred.cancelledAt,
      `a paid request must never be cancelled by a send (${timeline})`,
    ).toBeNull();
  });

  it("REGRESSION B (atomicity): a send that cannot freeze must not have cancelled anything", async () => {
    // The successor is withdrawn in another tab while this send is in flight.
    // The fixed body locks the SUCCESSOR first, so it discovers that before it
    // has touched the predecessor at all. The two-round-trip shape below cannot
    // do that, because its cancel has to go first: the unique index refuses the
    // freeze while the predecessor is still payable.
    const bookingId = await freshBooking();
    const predecessor = await makeSentRequest(bookingId, 20_000);
    const successor = await makeDraft({
      bookingId,
      totalMinor: 25_000,
      revision: 2,
      supersedesId: predecessor,
    });

    const t: Record<string, number> = {};
    let verdict: unknown;
    let rpcError: { code?: string; message?: string } | null = null;
    let writerPid = -1;
    let writerRole = "";
    let blockedByWriter = -1;

    try {
      writerPid = await writer.backendPid();
      await writer.begin();
      // SESSION 1 is the artist's OTHER TAB, under RLS, which is the production
      // shape of this write: an artist discarding the draft they were about to
      // send.
      await writer.becomeArtist(owner.id);
      writerRole = await writer.currentUser();
      await writer.query(
        `update payment_requests
            set status = 'cancelled', cancelled_at = now(), updated_at = now()
          where id = $1`,
        [successor],
      );
      t.cancelled = Date.now();

      await sleep(MARGIN_MS);

      t.rpcIssued = Date.now();
      const rpcPromise = callSend(successor).then((res) => {
        t.rpcReturned = Date.now();
        return res;
      });

      await sleep(Math.floor(HOLD_MS / 2));
      blockedByWriter = await observer.countBlockedBy(writerPid);

      await sleep(HOLD_MS - Math.floor(HOLD_MS / 2));
      await writer.commit();
      t.committed = Date.now();

      const res = await rpcPromise;
      verdict = res.data;
      rpcError = res.error;
    } finally {
      await writer.rollbackIfOpen();
    }

    const blockedMs = (t.rpcReturned ?? 0) - (t.rpcIssued ?? 0);
    const timeline =
      `cancelled=+0ms rpcIssued=+${t.rpcIssued - t.cancelled}ms ` +
      `committed=+${t.committed - t.cancelled}ms ` +
      `rpcReturned=+${t.rpcReturned - t.cancelled}ms ` +
      `blockedFor=${blockedMs}ms blockedByWriter=${blockedByWriter} ` +
      `fn_md5=${fnFingerprint}`;

    expect(writerRole, "the held write must run under RLS as the artist").toBe(
      "authenticated",
    );
    expect(
      blockedByWriter,
      `no backend was blocked by the writer, so the two sessions never contended (${timeline})`,
    ).toBeGreaterThanOrEqual(1);
    expect(
      blockedMs,
      `the send returned without waiting for the writer, so there was no race (${timeline})`,
    ).toBeGreaterThanOrEqual(HOLD_MS / 2);
    expect(
      rpcError,
      `the send must reach a verdict, not fail (${rpcError?.code}: ${rpcError?.message})`,
    ).toBeNull();

    expect(
      verdict,
      `a draft cancelled while the send waited cannot be sent (${timeline})`,
    ).toBe("not_sendable");

    // THE POINT OF THIS TEST. Nothing was sent, so nothing may have been
    // cancelled on the artist's behalf.
    const pred = await stateOf(predecessor);
    expect(
      pred.status,
      `the outstanding request must survive a send that did not happen (${timeline})`,
    ).toBe("sent");
    expect(
      pred.cancelledAt,
      `a failed send must not cancel anything (${timeline})`,
    ).toBeNull();
  });

  it("POSITIVE CONTROL for the defect: the two-round-trip shape DESTROYS the outstanding request", async () => {
    // The implementation 0126 replaces, performed here in full so REGRESSION B
    // above is measured against something rather than asserted into existence.
    // Two PostgREST calls, two transactions, cancel first because the unique
    // index refuses the freeze while the predecessor is payable.
    //
    // This test PASSES by asserting the damage. It is not a target to fix: it
    // is the demonstration that the harness can produce the loss, which is what
    // makes the green above meaningful. If this ever stops destroying the
    // predecessor, the interleaving stopped working and REGRESSION B is
    // proving nothing.
    const bookingId = await freshBooking();
    const predecessor = await makeSentRequest(bookingId, 20_000);
    const successor = await makeDraft({
      bookingId,
      totalMinor: 25_000,
      revision: 2,
      supersedesId: predecessor,
    });

    let cancelledRows = -1;
    let sentRows = -1;
    let blockedByWriter = -1;
    let writerPid = -1;

    try {
      writerPid = await writer.backendPid();
      await writer.begin();
      await writer.becomeArtist(owner.id);
      await writer.query(
        `update payment_requests
            set status = 'cancelled', cancelled_at = now(), updated_at = now()
          where id = $1`,
        [successor],
      );

      // ROUND TRIP 1: cancel the predecessor. Its own transaction, so it
      // COMMITS on its own. Nothing later can take it back.
      const rt1 = await owner.client
        .from("payment_requests")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", predecessor)
        .eq("artist_id", owner.id)
        .in("status", ["draft", "ready", "sent", "viewed", "expired", "failed"])
        .select("id");
      expect(rt1.error, rt1.error?.message).toBeNull();
      cancelledRows = (rt1.data ?? []).length;

      // ROUND TRIP 2: freeze the successor. Blocks on the other tab's row lock.
      //
      // The trailing `.then()` is load-bearing, not style. A supabase-js
      // builder is a lazy thenable: without it the request is not ISSUED until
      // the `await` below, which lands after the writer has committed, and the
      // overlap guard reads zero. Found by that guard going red, which is what
      // it is for.
      const rt2Promise = owner.client
        .from("payment_requests")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          expires_at: FAR_FUTURE,
          fee_schedule_version: FEE_VERSION,
          updated_at: new Date().toISOString(),
        })
        .eq("id", successor)
        .eq("artist_id", owner.id)
        .is("sent_at", null)
        .in("status", ["draft", "ready"])
        .select("id")
        .then((res) => res);

      await sleep(Math.floor(HOLD_MS / 2));
      blockedByWriter = await observer.countBlockedBy(writerPid);
      await sleep(HOLD_MS - Math.floor(HOLD_MS / 2));
      await writer.commit();

      const rt2 = await rt2Promise;
      expect(rt2.error, rt2.error?.message).toBeNull();
      sentRows = (rt2.data ?? []).length;
    } finally {
      await writer.rollbackIfOpen();
    }

    expect(
      blockedByWriter,
      "the second round trip must have overlapped the other tab",
    ).toBeGreaterThanOrEqual(1);
    expect(
      cancelledRows,
      "round trip 1 must have cancelled the predecessor",
    ).toBe(1);
    expect(
      sentRows,
      "round trip 2 must have affected nothing: the draft was withdrawn",
    ).toBe(0);

    // THE DAMAGE. The artist asked to replace an outstanding request, was told
    // nothing was sent, and their outstanding request is gone anyway. The
    // client's link is dead and there is nothing to pay.
    const pred = await stateOf(predecessor);
    expect(
      pred.status,
      "the two-round-trip shape leaves the predecessor cancelled with no replacement",
    ).toBe("cancelled");
    expect((await stateOf(successor)).sentAt).toBeNull();
  });
});
