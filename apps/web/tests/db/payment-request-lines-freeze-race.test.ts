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
 * THE FREEZE AND THE LINES, UNDER CONCURRENCY (P9 slices A1/A2).
 *
 * THE INVARIANT, and it is one sentence: a SENT payment request is a
 * client-facing commitment, so its `total_minor` must equal the sum of its
 * `payment_request_lines`. Spec section 3 allows no unstructured "additional
 * amount", so a sent total that is not exactly the sum of its visible lines is
 * a delta the client cannot account for.
 *
 * WHY A CONCURRENCY FILE AND NOT A ROW IN THE RLS SUITE. The defect this pins
 * did not exist sequentially. `enforce_payment_request_lines_frozen` originally
 * read the parent's `sent_at` with no row lock and acted on that read in the
 * same breath; every SEQUENTIAL probe passed, and 19 of 20 CONCURRENT
 * iterations ended `status=sent total=10000 sum(lines)=8000` (recorded in
 * 0125's header, 2026-07-29). That is the AGENTS.md rule about behavioural
 * evidence: a claim whose truth depends on a SEQUENCE cannot be checked by a
 * test that never produces one.
 *
 * ONE OBJECT HOLDS THIS, AND THAT IS A DELIBERATE REVERSAL. This header
 * previously described TWO, and the second was removed on measurement:
 *
 *   WRITE SIDE, 0125: `enforce_payment_request_lines_frozen` takes FOR SHARE on
 *   the parent in its own statement, then re-reads `sent_at` in a LATER one.
 *   It covers all three verbs. It is the only thing that can cover a line
 *   INSERTED during a freeze, because a row that does not exist yet cannot be
 *   locked by a reader.
 *
 *   READ SIDE, 0126: REMOVED. It summed the lines FOR UPDATE so an UPDATE or
 *   DELETE of an existing line serialised against the freeze, which was real
 *   defense in depth. It also produced a deterministic 40P01 (measured 3/3,
 *   superuser and `authenticated`) whose victim was the ARTIST's ordinary line
 *   edit, because a line write locks LINE then PARENT while the freeze can only
 *   go PARENT then LINE. Removing it changed nothing measurable: 0/30 breaches
 *   on all three variants with 0125's lock kept. See the reversal note in 0126.
 *
 * So the guarantee now rests on a SINGLE object in another file, which 0124's
 * header warns about. That is answered here rather than by a second lock: the
 * catalog sentinel below fails if 0125's FOR SHARE disappears, and also fails if
 * 0126's FOR UPDATE comes BACK, so reintroducing the deadlock is a decision
 * rather than an accident. A test catches the regression the second lock was
 * meant to catch, without deadlocking anyone to do it.
 *
 * DETERMINISTIC, NOT TIMED. Every case here holds the freeze in an uncommitted
 * transaction on a dedicated connection and issues the competing write through
 * REAL PostgREST as the artist, so the window is seconds wide rather than
 * microseconds. `pg_blocking_pids` is asserted where a block is claimed:
 * elapsed time alone cannot tell "it waited on the lock" from "it was slow",
 * and a race test that cannot tell those apart can pass for the wrong reason.
 */

const MARGIN_MS = 2_000;

let admin: SupabaseClient;
let freezer: PgSession;
let observer: PgSession;
let owner: Actor;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function freshBooking(): Promise<string> {
  const { data, error } = await admin
    .from("booking_requests")
    .insert({ artist_id: owner.id })
    .select("id")
    .single();
  expect(error, error?.message).toBeNull();
  return data!.id;
}

/** A draft request with one line, both totalling `amountMinor`. Setup runs on
 *  the service role because it is FIXTURE, not the thing under test, and every
 *  write destructures `error`: a silently rejected setup write turns every
 *  assertion after it into a test of nothing. */
async function draftWithLine(
  amountMinor: number,
): Promise<{ requestId: string; lineId: string; bookingId: string }> {
  const bookingId = await freshBooking();
  const req = await admin
    .from("payment_requests")
    .insert({
      artist_id: owner.id,
      booking_id: bookingId,
      total_minor: amountMinor,
    })
    .select("id")
    .single();
  expect(req.error, req.error?.message).toBeNull();
  const line = await admin
    .from("payment_request_lines")
    .insert({
      request_id: req.data!.id,
      artist_id: owner.id,
      name: "Session",
      quantity: 1,
      unit_amount_minor: amountMinor,
      line_total_minor: amountMinor,
      classification: "tattoo_service",
    })
    .select("id")
    .single();
  expect(line.error, line.error?.message).toBeNull();
  return {
    requestId: req.data!.id,
    lineId: line.data!.id,
    bookingId,
  };
}

/** The freeze, held uncommitted on `freezer`.
 *
 *  A bare UPDATE rather than the `send_payment_request` RPC, and the reason is
 *  mechanical: the RPC is one round trip that commits before it returns, so
 *  there is no way to hold it open. This statement fires the SAME
 *  `payment_requests_immutability` trigger and takes the SAME two locks the RPC
 *  takes at its step 5 (exclusive on the request, and FOR UPDATE on the lines
 *  via the trigger). What it does not reproduce is the RPC's own step-1 lock,
 *  which is taken earlier and only widens the window this test already has. */
async function holdFreeze(requestId: string): Promise<void> {
  await freezer.begin();
  await freezer.query(
    `update payment_requests
        set status = 'sent', sent_at = now(), collects = 'balance',
            fee_schedule_version = 'v1', updated_at = now()
      where id = $1`,
    [requestId],
  );
}

async function stateOf(
  requestId: string,
): Promise<{ status: string; total: number; lineSum: number; lines: number }> {
  const rows = await observer.query<{
    status: string;
    total_minor: number;
    line_sum: string;
    line_count: string;
  }>(
    `select r.status, r.total_minor,
            coalesce((select sum(line_total_minor) from payment_request_lines
                       where request_id = r.id), 0)::text as line_sum,
            (select count(*) from payment_request_lines where request_id = r.id)::text as line_count
       from payment_requests r where r.id = $1`,
    [requestId],
  );
  expect(rows, "the request must still exist").toHaveLength(1);
  return {
    status: rows[0].status,
    total: rows[0].total_minor,
    lineSum: Number(rows[0].line_sum),
    lines: Number(rows[0].line_count),
  };
}

/**
 * Block until the competing write is OBSERVED waiting on `pid`, or fail.
 *
 * A FIXED SLEEP IS NOT ENOUGH, and this is not defensive coding: with
 * `await sleep(1000)` in its place, the deadlock case below failed exactly once
 * out of four runs, on the first run after `supabase db reset --local`. PostgREST
 * reloads its schema cache and reopens its pool on a cold start, so the DELETE
 * had not reached the trigger when the freeze was issued, there was no lock
 * cycle, and the test reported `["57014","ok"]`. A gate that depends on how warm
 * a connection pool is is not a gate.
 *
 * Polling `pg_blocking_pids` makes the ordering a FACT rather than a hope, and
 * it fails loudly instead of passing for the wrong reason.
 */
/**
 * The same wait, reporting instead of throwing.
 *
 * ORDER MATTERS IN A RACE TEST, and this exists because getting it wrong made
 * a red run lie. With the throwing version used inside the two data tests, the
 * write-side falsification run reported "never blocked on backend 1253" and
 * stopped there: a HARNESS complaint, standing in front of the defect it was
 * supposed to expose. The tests below therefore observe the block, finish the
 * scenario, assert the INVARIANT first, and only then assert that contention
 * really happened. A red then says "the request was left sent with a total its
 * lines do not add up to", which is the thing that matters, and the harness
 * assertion follows it as corroboration.
 */
async function observeBlockedBy(pid: number, ms: number): Promise<boolean> {
  const deadline = Date.now() + ms;
  for (;;) {
    if (await observer.countBlockedBy(pid)) return true;
    if (Date.now() > deadline) return false;
    await sleep(50);
  }
}

async function waitUntilBlockedBy(pid: number, what: string): Promise<void> {
  const deadline = Date.now() + 15_000;
  for (;;) {
    if (await observer.countBlockedBy(pid)) return;
    if (Date.now() > deadline) {
      throw new Error(
        `${what}: never blocked on backend ${pid} within 15s. The concurrent ` +
          `write either never started or was not contended, so anything ` +
          `asserted after this would be measuring an idle database.`,
      );
    }
    await sleep(50);
  }
}

/** THE INVARIANT, in one place so every test states it identically. A request
 *  that is not sent is out of scope: only the freeze makes the total a promise. */
function expectConsistentIfSent(
  s: { status: string; total: number; lineSum: number },
  where: string,
): void {
  if (s.status === "draft" || s.status === "ready") return;
  expect(
    s.lineSum,
    `${where}: a SENT request must have total_minor === sum(line_total_minor), ` +
      `got total=${s.total} sum=${s.lineSum}`,
  ).toBe(s.total);
}

beforeAll(async () => {
  admin = adminClient();
  freezer = PgSession.open("freezer");
  observer = PgSession.open("observer");
  owner = await makeActor(admin, "a2-freeze-race");

  // Two connections, or nothing below is concurrent at all.
  expect(await freezer.backendPid()).not.toBe(await observer.backendPid());
}, 60_000);

afterAll(async () => {
  // Sessions first: a freezer transaction left open would make every cleanup
  // DELETE block on its locks until the hook times out, and the failure would
  // read as a broken teardown rather than a test that threw mid-hold.
  await freezer.close();
  await observer.close();
  // Guarded: when `beforeAll` fails (a restarted Kong answering 502 for
  // `auth/v1` will do it), `owner` is undefined and an unguarded teardown
  // throws a second, unrelated error on top of the real one.
  if (!owner) return;
  // Requests before lines: the lines trigger refuses a direct delete of a
  // frozen request's lines and tolerates the parent's cascade. The request
  // delete itself goes through the BOOKING, because 0125's
  // `payment_requests_delete_frozen` refuses a direct delete of a sent request
  // for every role including this one.
  await admin.from("booking_requests").delete().eq("artist_id", owner.id);
  await destroyActor(admin, owner);
}, 60_000);

// ===========================================================================

describe("a sent request's total always equals the sum of its lines", () => {
  it("CONTROL: a line write on an UNSENT request still succeeds", async () => {
    // POSITIVE CONTROL FOR THE WHOLE FILE, and it is the assertion that matters
    // as much as the refusals. Without it, a trigger that refused EVERY line
    // write, or a lock that never released, would satisfy every other test here
    // exactly as well as the correct behaviour does.
    const { requestId } = await draftWithLine(10_000);

    const { data, error } = await owner.client
      .from("payment_request_lines")
      .insert({
        request_id: requestId,
        artist_id: owner.id,
        name: "Touch-up",
        quantity: 1,
        unit_amount_minor: 2_000,
        line_total_minor: 2_000,
        classification: "additional_service",
      })
      .select("id");
    expect(error, error?.message).toBeNull();
    expect(
      data,
      "the artist's own line insert must affect one row",
    ).toHaveLength(1);

    const after = await stateOf(requestId);
    expect(after.status).toBe("draft");
    expect(after.lines, "and it must be durable").toBe(2);
    expect(after.lineSum).toBe(12_000);
  });

  it("WRITE SIDE (0125): a line INSERTED while the freeze is uncommitted is refused", async () => {
    // THE CASE ONLY THE WRITE-SIDE LOCK COVERS. 0126 sums the lines FOR UPDATE,
    // which cannot lock a row that does not exist yet, so this insert is held
    // by `enforce_payment_request_lines_frozen`'s FOR SHARE on the parent and
    // by nothing else.
    //
    // FALSIFIES IF: the `for share` is removed from that function. Recorded RED
    // against exactly that edit, this test, this path: the insert returned
    // `error: null`, and the request committed `status=sent total=10000
    // sum(lines)=12000`. Both halves of the artist's path admit it on a stale
    // read (the RLS INSERT policy's `r.sent_at is null` subquery sees the same
    // uncommitted freeze the trigger does), so nothing else stops it.
    const { requestId } = await draftWithLine(10_000);
    const freezerPid = await freezer.backendPid();

    let insertError: { code?: string; message?: string } | null = null;
    let insertRows = -1;
    let blocked = -1;
    let elapsed = -1;
    try {
      await holdFreeze(requestId);

      const started = Date.now();
      const pending = owner.client
        .from("payment_request_lines")
        .insert({
          request_id: requestId,
          artist_id: owner.id,
          name: "Slipped in",
          quantity: 1,
          unit_amount_minor: 2_000,
          line_total_minor: 2_000,
          classification: "additional_service",
        })
        .select("id")
        //  is what ISSUES the request. supabase-js query builders are
        // lazy thenables, so a bare assignment sends nothing and every
        // "concurrent" assertion below would measure an idle database.
        // Executed: without this, `countBlockedBy` read 0 and the write landed
        // AFTER the commit, which passes the refusal assertions for the wrong
        // reason.
        .then((r) => r);

      // Ordering observed as a fact, then held wide open on top of it, so a
      // pass can be neither an accident of scheduling nor a cold pool.
      const contended = await observeBlockedBy(freezerPid, 15_000);
      await sleep(MARGIN_MS);
      blocked = contended ? await observer.countBlockedBy(freezerPid) : 0;

      await freezer.commit();
      const res = await pending;
      elapsed = Date.now() - started;
      insertError = res.error;
      insertRows = (res.data ?? []).length;
    } finally {
      await freezer.rollbackIfOpen();
    }

    // THE INVARIANT FIRST, so a regression reports the damage rather than the
    // harness. This is the assertion that went red against the unlocked body.
    const after = await stateOf(requestId);
    expect(after.status, "the freeze itself must have committed").toBe("sent");
    expectConsistentIfSent(after, "insert-during-freeze");
    expect(after.lines, "and the slipped-in line must not be there").toBe(1);

    // LOUD, not silent: the refusal comes from a trigger raising after the
    // re-read, not from a policy filtering the row out.
    expect(
      insertError?.code,
      "expected the frozen-lines trigger to raise after the re-read",
    ).toBe("23514");
    expect(String(insertError?.message)).toContain(
      "payment_request_lines_frozen",
    );
    expect(insertRows).toBe(0);

    // Corroboration, last: without it a pass could mean the write never raced
    // at all. `pg_blocking_pids` is the only thing that can tell "it waited on
    // the lock" from "it was slow".
    expect(
      blocked,
      "the insert must have WAITED on the freezer's lock; timing alone cannot prove it did",
    ).toBe(1);
    expect(
      elapsed,
      `and it must have waited for the whole hold (took ${elapsed}ms)`,
    ).toBeGreaterThanOrEqual(MARGIN_MS);
  });

  it("WRITE SIDE (0125): a line DELETED while the freeze is uncommitted is refused", async () => {
    // THIS COMMENT USED TO SAY "the case BOTH locks cover", which stopped being
    // true when 0126's read side was removed. Kept as a correction rather than
    // rewritten away, because the measurement behind it is still useful: with
    // only 0125's lock the delete blocks on the PARENT, with only 0126's it
    // blocked on the LINE, and with NEITHER it commits and leaves
    // `status=sent total=10000 sum(lines)=0`.
    //
    // Today 0125 carries it alone. That is the whole reason the catalog sentinel
    // below pins 0125's FOR SHARE: this case has no second lock behind it.
    const { requestId, lineId } = await draftWithLine(10_000);
    const freezerPid = await freezer.backendPid();

    let delRows = -1;
    let delError: { code?: string; message?: string } | null = null;
    let blocked = -1;
    try {
      await holdFreeze(requestId);

      const pending = owner.client
        .from("payment_request_lines")
        .delete()
        .eq("id", lineId)
        .select("id")
        .then((r) => r); // issues the request; see the insert case above

      const contended = await observeBlockedBy(freezerPid, 15_000);
      await sleep(MARGIN_MS);
      blocked = contended ? await observer.countBlockedBy(freezerPid) : 0;

      await freezer.commit();
      const res = await pending;
      delRows = (res.data ?? []).length;
      delError = res.error;
    } finally {
      await freezer.rollbackIfOpen();
    }

    const after = await stateOf(requestId);
    expect(after.status).toBe("sent");
    expectConsistentIfSent(after, "delete-during-freeze");
    expect(after.lines, "the line must survive the freeze").toBe(1);

    // The row count is asserted whatever the error is, because an RLS-filtered
    // DELETE returns `{ data: [], error: null }`: reading "no error" as success
    // is the exact mistake this suite exists to catch.
    expect(delRows, "the delete must affect zero rows").toBe(0);
    expect(blocked, "the delete must have WAITED on the freezer's lock").toBe(
      1,
    );
    // Recorded so a change of mechanism is visible rather than silent: this
    // refusal is LOUD (the trigger's re-read raises) rather than a silent
    // policy filter. If this flips to `undefined`, the refusal moved.
    expect(delError?.code).toBe("23514");
  });

  it("WRITE SIDE (0125): a line AMOUNT CHANGED while the freeze is uncommitted is refused", async () => {
    // THE VARIANT NOTHING COVERED. The suite pinned INSERT and DELETE and left
    // UPDATE to a scratchpad probe, which protects nothing once the session
    // ends. It matters more than the other two now that 0126's read side is
    // gone: an UPDATE of an EXISTING line was the case that lock was added for,
    // so this is precisely the case that lost its second object.
    //
    // It is also the most plausible real sequence: an artist correcting a price
    // in one tab while the send lands in another. The freeze reads the lines to
    // check total = sum(lines), and an edit admitted after that read leaves a
    // client-facing commitment whose visible lines no longer add up to it.
    const { requestId, lineId } = await draftWithLine(10_000);
    const freezerPid = await freezer.backendPid();

    let updRows = -1;
    let updError: { code?: string; message?: string } | null = null;
    let blocked = -1;
    try {
      await holdFreeze(requestId);

      // Halving the line, so a breach is unmistakable in the assertion below
      // rather than an off-by-a-rounding-step.
      const pending = owner.client
        .from("payment_request_lines")
        .update({ unit_amount_minor: 5_000, line_total_minor: 5_000 })
        .eq("id", lineId)
        .select("id")
        .then((r) => r);

      const contended = await observeBlockedBy(freezerPid, 15_000);
      await sleep(MARGIN_MS);
      blocked = contended ? await observer.countBlockedBy(freezerPid) : 0;

      await freezer.commit();
      const res = await pending;
      updRows = (res.data ?? []).length;
      updError = res.error;
    } finally {
      await freezer.rollbackIfOpen();
    }

    // The invariant first, so a red names the damage and not the harness.
    const after = await stateOf(requestId);
    expect(after.status).toBe("sent");
    expectConsistentIfSent(after, "update-during-freeze");
    expect(after.lineSum, "the line amount must be unchanged").toBe(10_000);

    // Asserted whatever the error is: an RLS-filtered UPDATE returns
    // `{ data: [], error: null }`, so "no error" is not success here either.
    expect(updRows, "the update must affect zero rows").toBe(0);
    expect(blocked, "the update must have WAITED on the freezer's lock").toBe(
      1,
    );
    expect(updError?.code).toBe("23514");
  });

  it("pins both lock objects by catalog read, because a body swap beats timing", async () => {
    // VERIFY THE OBJECT, NOT THE FILE (AGENTS.md). 0125 and 0126 both define
    // `enforce_payment_request_immutability`, so re-running 0125 alone silently
    // reverts the read-side lock while every constraint, policy and index still
    // looks correct. The behavioural tests above would go red on that too, but
    // only sometimes and only under contention; this one names the cause.
    // COMMENTS ARE STRIPPED BEFORE MATCHING, and that is the whole point of this
    // version. The previous one matched `prosrc like '%for update%'` raw, and
    // enforce_payment_request_immutability's own body comment contains the
    // literal string "for update". Proven vacuous: blanking the actual lock
    // while leaving the comment in place kept this test GREEN. A sentinel that
    // its own subject's prose can satisfy measures nothing.
    const rows = await observer.query<{ proname: string; code: string }>(
      `select proname, regexp_replace(prosrc, '--[^\\n]*', '', 'g') as code
         from pg_proc
        where proname in ('enforce_payment_request_lines_frozen',
                          'enforce_payment_request_immutability')
        order by proname`,
    );
    expect(rows.map((r) => r.proname)).toEqual([
      "enforce_payment_request_immutability",
      "enforce_payment_request_lines_frozen",
    ]);

    // 0125's write side MUST be present. It is the single object the whole
    // freeze guarantee now rests on, so this assertion is what replaces the
    // read-side lock that used to back it up. If it ever goes red, the
    // concurrent race above is open again.
    expect(
      /for\s+share/i.test(rows[1].code),
      "0125's write side is missing: a line write reads the parent without locking it",
    ).toBe(true);

    // 0126's read side must STAY ABSENT. This direction is deliberate and is a
    // recorded reversal, not an omission: locking the line rows here produced a
    // deterministic 40P01 (measured 3/3, superuser and authenticated) because a
    // line write locks LINE then PARENT while the freeze can only ever go PARENT
    // then LINE. Removing it costs nothing measurable (0/30 breaches on all
    // three variants with 0125's lock kept). Re-adding it should be a decision,
    // not an accident, so this fails loudly if someone puts it back.
    expect(
      /for\s+update/i.test(rows[0].code),
      "0126's freeze re-acquired a line lock: that reintroduces the artist-victim deadlock, see the reversal note in 0126",
    ).toBe(false);
  });
});

describe("a line write racing a freeze does NOT deadlock the artist", () => {
  it("the artist's line write waits and times out cleanly, and the invariant holds", async () => {
    // THIS TEST WAS INVERTED, and the inversion is the record of a decision.
    //
    // It used to assert that a deadlock DOES occur and argue that was acceptable
    // because both outcomes are data-safe. The deadlock was real: Postgres locks
    // an UPDATE/DELETE target tuple BEFORE firing its BEFORE ROW triggers, so a
    // line write's order is LINE then PARENT while the freeze's is PARENT then
    // LINE, and that cycle cannot be ordered away because the freeze IS an update
    // of the parent.
    //
    // What changed is the trade, not the mechanism. Independent measurement put
    // the ARTIST on the losing side 3 times out of 3 (superuser and
    // `authenticated` alike), not the freeze, and removing 0126's read-side line
    // lock costs nothing measurable: 0/30 breaches on all three variants with
    // 0125's write-side lock kept. So the deadlock bought no safety and killed an
    // ordinary artist edit. It is gone, and this test now pins its ABSENCE.
    //
    // A clean wait ending in 57014 is the correct behaviour: the artist's edit is
    // refused in a way the app can retry and explain, rather than aborted by a
    // lock cycle. What must never regress is the invariant asserted at the end,
    // which held under both designs.
    //
    // THE LINE WRITER IS A DIRECT CONNECTION HERE, AND THAT IS A STATED TRADE
    // rather than convenience. It still runs as `authenticated` under RLS, with
    // the same claims PostgREST sets, so the policies and triggers in the path
    // are the production ones. What it is not is the PostgREST path, and the
    // reason is that the PostgREST version could not be made deterministic:
    // measured over seven runs, the cycle formed only when the DELETE had been
    // parked for about a second, and neither `pg_blocking_pids` nor a
    // `for update nowait` probe of the line row (both of which report the lock
    // as already held) was a sufficient predicate for it. A test that is green
    // or red depending on an unexplained sub-second detail is worse than no
    // test, so the shape is reproduced where it is exact. The three tests above
    // cover the PostgREST path.
    const { requestId, lineId } = await draftWithLine(10_000);
    const writer = PgSession.open("deadlock-writer");

    let outcome: { deadlock: boolean; codes: string[] } = {
      deadlock: false,
      codes: [],
    };
    try {
      // The freezer takes `send_payment_request`'s STEP 1 lock and holds it.
      await freezer.begin();
      await freezer.query(
        "select 1 from payment_requests where id = $1 for update",
        [requestId],
      );

      // An ordinary artist line delete: locks the LINE, then blocks on the
      // parent inside `enforce_payment_request_lines_frozen`.
      await writer.begin();
      await writer.becomeArtist(owner.id);
      // PostgREST gives `authenticated` an 8s statement timeout; a direct
      // connection inherits none. Without this the RED case (0126's read-side
      // lock removed, so no cycle forms) HANGS until vitest's 30s timeout and
      // reports "Test timed out", which says nothing about the cause. With it,
      // the same red reads `got codes ["57014","ok"]`.
      await writer.query("set local statement_timeout = '8s'");
      const pendingDelete = writer
        .query("delete from payment_request_lines where id = $1", [lineId])
        .then(
          () => "ok",
          (e: { code?: string }) => e.code ?? "err",
        );
      await waitUntilBlockedBy(await freezer.backendPid(), "deadlock delete");

      // The freeze now wants the line the delete already holds.
      const pendingFreeze = freezer
        .query(
          `update payment_requests
              set status = 'sent', sent_at = now(), collects = 'balance',
                  fee_schedule_version = 'v1', updated_at = now()
            where id = $1`,
          [requestId],
        )
        .then(
          () => "ok",
          (e: { code?: string }) => e.code ?? "err",
        );

      const del = await pendingDelete;
      const frz = await pendingFreeze;
      outcome = {
        deadlock: del === "40P01" || frz === "40P01",
        codes: [del, frz],
      };
    } finally {
      await writer.close();
      await freezer.rollbackIfOpen();
    }

    expect(
      outcome.deadlock,
      `no side may be a deadlock victim: 0126's read-side line lock is removed, so re-adding it (or any lock that takes PARENT then LINE) reintroduces the cycle. Got codes ${JSON.stringify(outcome.codes)}`,
    ).toBe(false);

    // The freeze must SUCCEED. Asserting only "no deadlock" would pass on a
    // build where the freeze silently failed instead, which is the same class of
    // mistake as reading {data:[],error:null} as success.
    expect(
      outcome.codes[1],
      "the freeze must complete: it no longer waits on any line lock",
    ).toBe("ok");

    // The artist waits on the parent and is refused by the clock, not by a lock
    // cycle. 57014 is the statement timeout set above; a direct connection
    // inherits none, so this mirrors the 8s PostgREST gives `authenticated`.
    expect(
      outcome.codes[0],
      "the artist's line write must wait cleanly, not be killed by a cycle",
    ).toBe("57014");

    // The invariant, unchanged across both designs, and the reason either was
    // ever arguable.
    const after = await stateOf(requestId);
    expectConsistentIfSent(after, "no-deadlock");
    expect(
      after.lines,
      "the artist's refused delete must roll back WHOLE",
    ).toBe(1);
  });
});
