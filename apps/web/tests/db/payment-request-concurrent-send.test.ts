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
 * TWO SENDERS, ONE APPOINTMENT (Plus build P9, slice A2, migrations 0125/0126).
 *
 * Spec section 8 lists "duplicate requests" and "concurrent attempts" as
 * covered failure modes, and 0125's comment on the partial unique index states
 * the property directly: "two sends racing cannot both win, whatever the cores
 * do". Until this file, that claim was made by a SEQUENTIAL probe. A1's
 * `refuses a second SEND against the same appointment` inserts a second sent
 * row after the first one has committed, which is a different fact: it shows
 * the index refuses a row that is already visible, not that it arbitrates two
 * senders whose pre-checks both passed on their own snapshot.
 *
 * That distinction is the whole subject here. `send_payment_request` step 3
 * asks "is another request for this subject already payable?" and that question
 * IS A CHECK-THEN-WRITE: it runs on a snapshot, so a send committing after it
 * does not appear. Sequentially it is right every time. Concurrently it is
 * right only because something else holds, and this file is where that
 * something else is measured.
 *
 * ---------------------------------------------------------------------------
 * EXECUTED, RED FIRST, on the local stack (127.0.0.1:54322). Each mutation was
 * applied by hand to the database, run with the file EXCLUDED and then INCLUDED,
 * and reverted with a catalog check. Recorded verbatim, because a suite written
 * after the code is green by construction until something is broken in front of
 * it:
 *
 *  1. SHIPPED schema: GREEN, 5/5.
 *
 *  2. THE ARBITER DROPPED, leaving `send_payment_request`'s own step-3
 *     pre-check as the only defence. That pre-check is the naive
 *     check-then-write: it asks "is another request for this subject already
 *     payable?" on a snapshot.
 *
 *       drop index payment_requests_one_payable_per_booking_idx;
 *       drop index payment_requests_one_payable_per_project_idx;
 *
 *     THE SPLIT IS THE WHOLE POINT. The SEQUENTIAL tests that go through that
 *     pre-check stayed GREEN, including `payment-request-send-race.test.ts`'s
 *     `refuses a second payable request for the same appointment`. Of the 125
 *     tests that existed before this file, exactly ONE moved: A1's
 *     `refuses a second SEND against the same appointment`, which inserts an
 *     already-committed second row and therefore measures the index rather than
 *     the race. The concurrent property was measured by nothing.
 *
 *       × the objects this file measures are deployed, and the harness has two
 *         sessions
 *         → the arbiter this file measures is NOT deployed:
 *           expected [] to deeply equal [ …(2) ]
 *       × only ONE of two senders racing one appointment ends up payable
 *         → two senders racing ONE appointment must not both end up payable
 *           (#1="sent" #2="sent" parked=2 blockedByHolder=2
 *            payable=["c3359c65-…","cb042bb6-…"]): expected 2 to be 1
 *       × two revisions of one outstanding request cannot both replace it
 *         → one appointment must never carry two payable requests
 *           (#1="sent" #2="sent" parked=2 blockedByHolder=2): expected 2 to be 1
 *
 *     `parked=2` is what makes that a race and not two statements near each
 *     other in time. Both senders passed step 3 on their own snapshot and both
 *     froze: the client is left with two live links for one appointment and can
 *     pay both. THE CONTROL STAYED GREEN under the same mutation, which is what
 *     rules out "everything is broken" as the explanation, and rules out a fix
 *     that simply refuses under contention.
 *
 *  3. STEP 1's SUCCESSOR LOCK REMOVED (`perform 1 … for update` on the request
 *     being sent), everything else intact:
 *       × two tabs sending the SAME draft freeze it once, and the second is
 *         told so
 *         → the second tab must be told it was already sent
 *           (#1="sent" #2="gone" parked=2): expected 'gone' to be 'already_sent'
 *     Nothing was double-frozen (the freeze's own qual is re-evaluated after
 *     blocking), so the damage is a message rather than money: the artist is
 *     told their request disappeared when it was in fact already sent.
 *
 *  4. THE LOCK AND THE FREEZE'S FRESHNESS QUAL BOTH REMOVED:
 *       × two tabs sending the SAME draft …
 *         → a double send must be refused cleanly, not by an exception
 *           (#1="sent" #2=null err=23514 parked=2)
 *     The immutability trigger catches the second freeze, which is the backstop
 *     working. Worth knowing which line does what: removing the freshness qual
 *     ALONE changes nothing, because step 1's lock means the second tab has
 *     already returned `already_sent` before it can be reached. The lock is the
 *     arbiter; the qual is the net under it.
 *
 *  5. Re-applying the dropped objects returns the file to GREEN.
 *
 * NOTHING IN THIS FILE MODIFIES THE SCHEMA. Every mutation above was applied
 * from outside and reverted; a test that rewrites the thing it is testing is not
 * a gate.
 *
 * ---------------------------------------------------------------------------
 * HOW THE OVERLAP IS ARRANGED, and why it is not a sleep race. A third session
 * takes a row lock on the drafts and holds it. Both sends then block inside
 * step 1, which is where `send_payment_request` locks the request it is about
 * to freeze. The wait state is READ WHILE THEY ARE PARKED: if two sends are not
 * waiting at that instant, they were never in flight together and every verdict
 * below is meaningless, so that reading is asserted before any verdict is. When
 * the holder commits, both proceed from the same instant, each on its own
 * connection, each in its own transaction.
 *
 * A MARGIN OF SECONDS is deliberate. The window this needs is not
 * microseconds: it is "both senders are past their pre-check before either one
 * commits", and holding them for two seconds makes that the ordinary case
 * rather than a lucky one.
 */

/** Long enough that both senders are demonstrably parked together, and short
 *  enough to keep the file inside its 30s timeout. */
const HOLD_MS = 2_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const FEE_VERSION = "fees-v1-2026-07-04";
const FAR_FUTURE = new Date(Date.now() + 30 * 864e5).toISOString();

const PAYABLE = ["sent", "viewed", "payment_processing", "partially_paid"];

let admin: SupabaseClient;
let owner: Actor;
/** Holds the row locks that park both senders on the same instant. */
let holder: PgSession;
/** Reads through superuser, so RLS cannot hide the truth from an assertion. */
let observer: PgSession;

type SendOutcome = {
  verdict: unknown;
  errorCode: string | null;
  errorMessage: string | null;
};

async function freshBooking(): Promise<string> {
  const { data, error } = await admin
    .from("booking_requests")
    .insert({ artist_id: owner.id })
    .select("id")
    .single();
  expect(error, `booking setup failed: ${error?.message}`).toBeNull();
  return data!.id as string;
}

/** A sendable draft: a `ready` request plus ONE line summing to its total. Both
 *  halves are required, because the freeze trigger verifies the total against
 *  the sum of the lines and a request with no lines would refuse for a reason
 *  that has nothing to do with concurrency. */
async function makeDraft(args: {
  bookingId: string;
  totalMinor: number;
  revision?: number;
  supersedesId?: string | null;
}): Promise<string> {
  const { data, error } = await admin
    .from("payment_requests")
    .insert({
      artist_id: owner.id,
      booking_id: args.bookingId,
      status: "ready",
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

/** Built draft -> lines -> update, never inserted as `sent`: the lines trigger
 *  refuses an insert into an already-frozen parent. */
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

/** The real PostgREST path, as the real artist, so the policies under test are
 *  the ones production runs. The trailing `.then()` is load-bearing rather than
 *  style: a supabase-js builder is a LAZY thenable, so without it the request is
 *  not issued until the await, both calls land after the holder has committed,
 *  and the overlap guard reads zero. */
function issueSend(requestId: string): Promise<SendOutcome> {
  return Promise.resolve(
    owner.client
      .rpc("send_payment_request", {
        p_request_id: requestId,
        p_artist_id: owner.id,
        p_expires_at: FAR_FUTURE,
        p_fee_schedule_version: FEE_VERSION,
      })
      .then((res) => ({
        verdict: res.data as unknown,
        errorCode: res.error?.code ?? null,
        errorMessage: res.error?.message ?? null,
      })),
  );
}

async function stateOf(id: string): Promise<{
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

/** Every request for this appointment that a client could pay right now. THE
 *  invariant of this file: this list is never longer than one. */
async function payableFor(bookingId: string): Promise<string[]> {
  const rows = await observer.query<{ id: string }>(
    `select id::text as id from payment_requests
      where booking_id = $1 and status::text = any($2)
      order by id`,
    [bookingId, PAYABLE],
  );
  return rows.map((r) => r.id);
}

/**
 * How many `send_payment_request` calls are parked on a lock RIGHT NOW.
 *
 * This is the measurement that makes the file a race test rather than two
 * statements that happened to be near each other in time, and it is not
 * `countBlockedBy(holder)`, which was the first version and was wrong for the
 * same-draft case. PROBED DIRECTLY rather than reasoned about, after that guard
 * went red on a run whose verdicts were plainly correct:
 *
 *   holder pid 2685 holds the row lock
 *   pid 2688  blockers [2685]   <- first waiter, blocked by the holder
 *   pid 2696  blockers [2688]   <- second waiter, blocked by the FIRST WAITER
 *
 * Two backends waiting for the same row queue on a tuple lock, so the second
 * one reports the first as its blocker and the original holder does not appear
 * in its list at all. Counting "backends the holder blocks" therefore reads 1
 * when two senders are genuinely parked together, and a test that lowered the
 * threshold to 1 to make that pass would have stopped measuring the overlap.
 * Counting PARKED SENDERS is chain-shaped and answers the question asked.
 */
async function parkedSenders(): Promise<number> {
  const rows = await observer.query<{ n: string }>(
    `select count(*)::text as n
       from pg_stat_activity
      where cardinality(pg_blocking_pids(pid)) > 0
        and query ilike '%send_payment_request%'`,
  );
  return Number(rows[0].n);
}

/**
 * Park `ids` under a row lock, issue a send for each, prove they overlapped,
 * then release. Returns the outcomes in the order the ids were given.
 *
 * The lock is taken by a SUPERUSER session on purpose: it is scaffolding, not
 * the thing under test, and holding it through the artist's own client would
 * make the harness depend on the very policies the sends are exercising.
 */
async function raceSends(ids: string[]): Promise<{
  outcomes: SendOutcome[];
  parked: number;
  blockedByHolder: number;
}> {
  const holderPid = await holder.backendPid();
  let parked = -1;
  let blockedByHolder = -1;
  let pending: Promise<SendOutcome>[] = [];
  try {
    await holder.begin();
    await holder.query(
      "select 1 from payment_requests where id = any($1) for update",
      [ids],
    );

    pending = ids.map((id) => issueSend(id));

    await sleep(Math.floor(HOLD_MS / 2));
    // Both readings, because they answer different questions: `parked` says two
    // senders were in flight together, `blockedByHolder` says the thing they
    // were parked on is THIS test's lock and not some unrelated contention.
    parked = await parkedSenders();
    blockedByHolder = await observer.countBlockedBy(holderPid);
    await sleep(HOLD_MS - Math.floor(HOLD_MS / 2));

    await holder.commit();
  } finally {
    await holder.rollbackIfOpen();
  }
  const outcomes = await Promise.all(pending);
  return { outcomes, parked, blockedByHolder };
}

function describeOutcomes(o: SendOutcome[]): string {
  return o
    .map(
      (x, i) =>
        `#${i + 1}=${JSON.stringify(x.verdict)}${
          x.errorCode ? ` err=${x.errorCode}` : ""
        }`,
    )
    .join(" ");
}

beforeAll(async () => {
  admin = adminClient();
  holder = PgSession.open("race-holder");
  observer = PgSession.open("race-observer");
  owner = await makeActor(admin, "a2-race");
}, 60_000);

afterAll(async () => {
  // Sessions first: a holder transaction left open would make every cleanup
  // statement block on its locks until the hook times out, and the failure
  // would look like a broken teardown rather than a test that threw mid-hold.
  await holder.close();
  await observer.close();
  await admin.from("payment_allocations").delete().eq("artist_id", owner.id);
  // Requests BEFORE lines: the lines trigger refuses a direct delete of a
  // frozen request's lines for every role, and tolerates the parent's cascade.
  await admin.from("payment_requests").delete().eq("artist_id", owner.id);
  await admin.from("booking_requests").delete().eq("artist_id", owner.id);
  await destroyActor(admin, owner);
}, 60_000);

describe("two senders, one appointment", () => {
  it("the objects this file measures are deployed, and the harness has two sessions", async () => {
    // IN A TEST, NOT IN `beforeAll`, and that placement is a correction rather
    // than a preference. It started in the hook. The mutation run that drops
    // the two partial unique indexes then reported this file as
    // `4 skipped`, not as red: a throwing `beforeAll` takes the whole file with
    // it, so the one file written to catch that exact mutation could not catch
    // it, and the summary line for a skip reads almost like a pass. A
    // precondition belongs where it can go red on its own and name its own
    // cause.
    const fn = await observer.query<{ n: string }>(
      "select count(*)::text as n from pg_proc where proname = 'send_payment_request'",
    );
    expect(
      fn[0].n,
      "send_payment_request must exist, or nothing below is testing anything",
    ).toBe("1");

    const idx = await observer.query<{ indexname: string }>(
      `select indexname from pg_indexes
        where tablename = 'payment_requests' and indexname like '%one_payable%'
        order by indexname`,
    );
    expect(
      idx.map((r) => r.indexname),
      "the arbiter this file measures is NOT deployed",
    ).toEqual([
      "payment_requests_one_payable_per_booking_idx",
      "payment_requests_one_payable_per_project_idx",
    ]);

    // Two sessions, or the "hold a lock while someone else works" shape is a
    // fiction. Asserted rather than assumed, because `max: 1` doing its job is
    // what makes every timing reading below mean anything.
    expect(await holder.backendPid()).not.toBe(await observer.backendPid());
  });

  it("CONTROL: two sends that do NOT collide both succeed", async () => {
    // The control that a "refuse everything under contention" fix cannot pass,
    // and the proof that the harness can produce a `sent` at all. Identical
    // shape to the race below in every respect except the subject: same holder,
    // same parking, same release.
    const bookingA = await freshBooking();
    const bookingB = await freshBooking();
    const draftA = await makeDraft({ bookingId: bookingA, totalMinor: 12_000 });
    const draftB = await makeDraft({ bookingId: bookingB, totalMinor: 34_000 });

    const { outcomes, parked, blockedByHolder } = await raceSends([
      draftA,
      draftB,
    ]);
    const seen =
      `verdicts: ${describeOutcomes(outcomes)} parked=${parked} ` +
      `blockedByHolder=${blockedByHolder}`;

    expect(
      parked,
      `both sends must have been parked together, or they never raced (${seen})`,
    ).toBeGreaterThanOrEqual(2);
    expect(
      blockedByHolder,
      `the senders must be parked on THIS test's lock (${seen})`,
    ).toBeGreaterThanOrEqual(1);
    for (const outcome of outcomes) {
      expect(outcome.errorCode, `unexpected error (${seen})`).toBeNull();
      expect(outcome.verdict, `both must send (${seen})`).toBe("sent");
    }
    expect(await payableFor(bookingA)).toEqual([draftA]);
    expect(await payableFor(bookingB)).toEqual([draftB]);
  });

  it("only ONE of two senders racing one appointment ends up payable", async () => {
    // THE PROPERTY. Two drafts for one appointment, both sendable, both issued
    // while parked on the same lock. Neither pre-check can see the other: they
    // run on snapshots taken before either transaction commits, so the naive
    // half of this operation says yes to both.
    const bookingId = await freshBooking();
    const first = await makeDraft({ bookingId, totalMinor: 12_000 });
    const second = await makeDraft({ bookingId, totalMinor: 34_000 });
    expect(
      await payableFor(bookingId),
      "nothing may be payable before the race, or the race proves nothing",
    ).toEqual([]);

    const { outcomes, parked, blockedByHolder } = await raceSends([
      first,
      second,
    ]);
    const payable = await payableFor(bookingId);
    const seen =
      `${describeOutcomes(outcomes)} parked=${parked} ` +
      `blockedByHolder=${blockedByHolder} payable=${JSON.stringify(payable)}`;

    expect(
      parked,
      `both sends must have been parked together, or they never raced (${seen})`,
    ).toBeGreaterThanOrEqual(2);
    expect(
      blockedByHolder,
      `the senders must be parked on THIS test's lock (${seen})`,
    ).toBeGreaterThanOrEqual(1);

    // The damage, named as the thing being prevented: two live links for one
    // appointment, either of which a client can pay.
    expect(
      payable.length,
      `two senders racing ONE appointment must not both end up payable (${seen})`,
    ).toBe(1);

    // And exactly one of them was TOLD it sent. A run where both were refused
    // would also satisfy the line above and would be a different bug.
    const sent = outcomes.filter((o) => o.verdict === "sent");
    expect(sent.length, `exactly one sender must win (${seen})`).toBe(1);

    // The loser is refused, and HOW is recorded rather than pinned: with both
    // pre-checks passing, the unique index raises 23505 and the whole
    // transaction rolls back; if the winner committed early enough to be
    // visible, the pre-check answers `already_outstanding` instead. Both are
    // correct refusals, and the core maps both to the same answer.
    const loser = outcomes.find((o) => o.verdict !== "sent")!;
    const refusedProperly =
      loser.errorCode === "23505" || loser.verdict === "already_outstanding";
    expect(
      refusedProperly,
      `the loser must be refused for a same-appointment reason (${seen})`,
    ).toBe(true);

    // The loser's own row is untouched: not frozen, and not quietly cancelled.
    const loserId = payable[0] === first ? second : first;
    const loserState = await stateOf(loserId);
    expect(
      loserState.sentAt,
      `the loser must not be frozen (${seen})`,
    ).toBeNull();
    expect(loserState.status, `the loser must stay sendable (${seen})`).toBe(
      "ready",
    );
    expect(
      loserState.cancelledAt,
      `a losing send must not cancel anything (${seen})`,
    ).toBeNull();

    // RECOVERABLE, which is what makes the refusal a refusal rather than data
    // loss: once the winner is withdrawn, the loser sends normally.
    const cancelWinner = await owner.client
      .from("payment_requests")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("id", payable[0])
      .eq("artist_id", owner.id)
      .select("id");
    expect(cancelWinner.error, cancelWinner.error?.message).toBeNull();
    expect(cancelWinner.data ?? []).toHaveLength(1);

    const retry = await issueSend(loserId);
    expect(retry.errorCode, retry.errorMessage ?? undefined).toBeNull();
    expect(
      retry.verdict,
      "the refused sender must still be sendable afterwards",
    ).toBe("sent");
    expect(await payableFor(bookingId)).toEqual([loserId]);
  });

  it("two tabs sending the SAME draft freeze it once, and the second is told so", async () => {
    // The other two-sender shape, and the one that pins step 1's lock. The
    // successor lock is what makes the second tab READ the first tab's result
    // rather than race it to the freeze: without it the second one's own
    // statement qual still saves the row, but it answers `gone`, which reads to
    // an artist as "your request disappeared" when what happened is that it was
    // already sent.
    const bookingId = await freshBooking();
    const draft = await makeDraft({ bookingId, totalMinor: 20_000 });

    const { outcomes, parked, blockedByHolder } = await raceSends([
      draft,
      draft,
    ]);
    const payable = await payableFor(bookingId);
    const seen =
      `${describeOutcomes(outcomes)} parked=${parked} ` +
      `blockedByHolder=${blockedByHolder} payable=${JSON.stringify(payable)}`;

    // Both waiters are on ONE row here, so they chain: only the first reports
    // the holder as its blocker. See `parkedSenders`.
    expect(
      parked,
      `both tabs must have been parked together (${seen})`,
    ).toBeGreaterThanOrEqual(2);
    expect(
      blockedByHolder,
      `the tabs must be parked on THIS test's lock (${seen})`,
    ).toBeGreaterThanOrEqual(1);
    for (const outcome of outcomes) {
      expect(
        outcome.errorCode,
        `a double send must be refused cleanly, not by an exception (${seen})`,
      ).toBeNull();
    }
    expect(
      outcomes.filter((o) => o.verdict === "sent").length,
      `exactly one tab may freeze the draft (${seen})`,
    ).toBe(1);
    expect(
      outcomes.find((o) => o.verdict !== "sent")!.verdict,
      `the second tab must be told it was already sent (${seen})`,
    ).toBe("already_sent");
    expect(payable, `one appointment, one payable request (${seen})`).toEqual([
      draft,
    ]);
  });

  it("two revisions of one outstanding request cannot both replace it", async () => {
    // The full product shape of the race: an artist with two tabs open, each
    // holding a revision of the same outstanding request. Both would cancel the
    // predecessor and freeze themselves, and both cancelling is harmless only
    // as long as exactly one freeze survives.
    const bookingId = await freshBooking();
    const predecessor = await makeSentRequest(bookingId, 20_000);
    const revisionA = await makeDraft({
      bookingId,
      totalMinor: 25_000,
      revision: 2,
      supersedesId: predecessor,
    });
    const revisionB = await makeDraft({
      bookingId,
      totalMinor: 27_000,
      revision: 2,
      supersedesId: predecessor,
    });
    expect(await payableFor(bookingId)).toEqual([predecessor]);

    const { outcomes, parked, blockedByHolder } = await raceSends([
      revisionA,
      revisionB,
    ]);
    const payable = await payableFor(bookingId);
    const seen =
      `${describeOutcomes(outcomes)} parked=${parked} ` +
      `blockedByHolder=${blockedByHolder} payable=${JSON.stringify(payable)}`;

    expect(
      parked,
      `both sends must have been parked together (${seen})`,
    ).toBeGreaterThanOrEqual(2);
    expect(
      blockedByHolder,
      `the senders must be parked on THIS test's lock (${seen})`,
    ).toBeGreaterThanOrEqual(1);
    expect(
      payable.length,
      `one appointment must never carry two payable requests (${seen})`,
    ).toBe(1);
    expect(
      payable[0],
      `the replaced request must not still be payable (${seen})`,
    ).not.toBe(predecessor);
    expect(
      outcomes.filter((o) => o.verdict === "sent").length,
      `exactly one revision may become payable (${seen})`,
    ).toBe(1);

    // The predecessor is cancelled BECAUSE a replacement is live, which is the
    // only reason cancelling it is acceptable at all.
    const pred = await stateOf(predecessor);
    expect(
      pred.status,
      `the replaced request must be cancelled (${seen})`,
    ).toBe("cancelled");
    expect(pred.cancelledAt).not.toBeNull();

    // And the losing revision is still a revision: not frozen, not cancelled,
    // still the artist's to send or discard.
    const loserId = payable[0] === revisionA ? revisionB : revisionA;
    const loser = await stateOf(loserId);
    expect(
      loser.sentAt,
      `the losing revision must not be frozen (${seen})`,
    ).toBeNull();
    expect(
      loser.cancelledAt,
      `the losing revision must not be destroyed (${seen})`,
    ).toBeNull();
  });
});
