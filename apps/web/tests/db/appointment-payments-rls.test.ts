import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient, makeActor, type Actor } from "./helpers/actor";
import { PgSession } from "./helpers/pg-session";

/**
 * Authenticated database regression tests for migration 0125 (P9 slice A1):
 * `payment_requests`, `payment_request_lines`, `payment_allocations`.
 *
 * WHY THIS FILE EXISTS AT ALL, stated so nobody deletes it as ceremony. Two
 * tables in this repo shipped with RLS enabled, a SELECT-only policy and a
 * user-scoped write client: `product_collections` (0120) and `discount_codes`
 * (0118, on the revenue path). Both were 100% broken features, and every
 * pure-function test stayed green through both. A pure test cannot see a
 * missing policy. Only a real anon-key client holding a real JWT can.
 *
 * These tables are the money path, so the file covers four properties that
 * nothing else can:
 *
 *   1. the artist's own client can actually WRITE what it is supposed to
 *      write, and cannot write anything else (the 0120/0118 defect, and its
 *      mirror image: the money floor);
 *   2. cross-account isolation, asserting the SPECIFIC code rather than "an
 *      error", each with a positive control proving the same operation
 *      succeeds for the rightful owner;
 *   3. cross-owner rows are unrepresentable for EVERY role including the
 *      service role, which RLS never constrains and which is what runs A4's
 *      webhook;
 *   4. a sent request's amount and lines are frozen, and the artist's path to
 *      editing them fails SILENTLY, which is the shape a core will mistake for
 *      success.
 *
 * TWO GOTCHAS THAT MAKE ASSERTIONS VACUOUS HERE, both executed rather than
 * recited:
 *
 *   - Whether an RLS refusal is silent depends on WHICH HALF refused, not on
 *     the verb. USING excluding the row gives `{ data: [], error: null }`;
 *     WITH CHECK rejecting the result raises 42501. So `expect(error).toBeNull()`
 *     is a NO-OP for a USING-filtered UPDATE or DELETE. Every such test below
 *     asserts the affected row count AND reads the state back.
 *   - A BEFORE ROW trigger fires ahead of the RLS WITH CHECK. On
 *     `payment_request_lines` that changes the observable code for a
 *     cross-account insert from 42501 to 23514, and the tests say so where it
 *     happens rather than asserting a code that was never produced.
 */

const ADMIN_LABEL = "a1";

let admin: SupabaseClient;
let owner: Actor;
let other: Actor;

/** Everything a payment request can be attached to, per actor. */
type Fixtures = {
  bookingId: string;
  bookingId2: string;
  projectId: string;
  productId: string;
};

const fixtures = new Map<string, Fixtures>();

async function makeFixtures(actor: Actor): Promise<Fixtures> {
  // Setup writes run on the service role because they are FIXTURES, not the
  // thing under test. Every one destructures `error` and asserts it: a silently
  // rejected setup write turns a later assertion into a test of nothing, which
  // is how eight tests in the P5d suite came to be unable to fail.
  const b1 = await admin
    .from("booking_requests")
    .insert({ artist_id: actor.id })
    .select("id")
    .single();
  expect(b1.error, b1.error?.message).toBeNull();
  const b2 = await admin
    .from("booking_requests")
    .insert({ artist_id: actor.id })
    .select("id")
    .single();
  expect(b2.error, b2.error?.message).toBeNull();
  const p = await admin
    .from("projects")
    .insert({
      artist_id: actor.id,
      customer_email: `client-${actor.id.slice(0, 8)}@example.com`,
      title: "A1 project",
      description: "A1 project",
      scale: "sleeve",
    })
    .select("id")
    .single();
  expect(p.error, p.error?.message).toBeNull();
  const prod = await admin
    .from("products")
    .insert({
      artist_id: actor.id,
      title: "A1 product",
      price_amount: 40,
      currency: "eur",
    })
    .select("id")
    .single();
  expect(prod.error, prod.error?.message).toBeNull();

  return {
    bookingId: b1.data!.id,
    bookingId2: b2.data!.id,
    projectId: p.data!.id,
    productId: prod.data!.id,
  };
}

function fx(actor: Actor): Fixtures {
  const f = fixtures.get(actor.id);
  if (!f) throw new Error("fixtures missing");
  return f;
}

/** A fresh appointment, so each test gets a subject nothing else has claimed.
 *  The one-payable-per-subject index makes shared subjects interfere. */
async function freshBooking(actor: Actor): Promise<string> {
  const { data, error } = await admin
    .from("booking_requests")
    .insert({ artist_id: actor.id })
    .select("id")
    .single();
  expect(error, error?.message).toBeNull();
  return data!.id;
}

/** A draft request on a fresh appointment, written by the service role. */
async function draftRequest(
  actor: Actor,
  totalMinor = 0,
): Promise<{ id: string; bookingId: string }> {
  const bookingId = await freshBooking(actor);
  const { data, error } = await admin
    .from("payment_requests")
    .insert({
      artist_id: actor.id,
      booking_id: bookingId,
      total_minor: totalMinor,
    })
    .select("id")
    .single();
  expect(error, error?.message).toBeNull();
  return { id: data!.id, bookingId };
}

async function addLine(
  actor: Actor,
  requestId: string,
  amountMinor: number,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const { data, error } = await admin
    .from("payment_request_lines")
    .insert({
      request_id: requestId,
      artist_id: actor.id,
      name: "Session",
      quantity: 1,
      unit_amount_minor: amountMinor,
      line_total_minor: amountMinor,
      classification: "tattoo_service",
      ...extra,
    })
    .select("id")
    .single();
  expect(error, error?.message).toBeNull();
  return data!.id;
}

/** Freeze a request: one UPDATE setting status, sent_at, `collects` and the fee
 *  schedule version together.
 *
 *  `collects` was added by migration 0126 (slice A2) and is required at the
 *  freeze by `payment_requests_collects_sent_check`, for the same reason
 *  `fee_schedule_version` is: a sent request is a client-facing commitment and
 *  both facts are unrecoverable afterwards. A2 performs this transition through
 *  the `send_payment_request` RPC rather than a bare UPDATE, because it also
 *  has to cancel the request being replaced in the same transaction; the column
 *  set written here is the same one. */
async function send(requestId: string, totalMinor: number): Promise<void> {
  const { error } = await admin
    .from("payment_requests")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      total_minor: totalMinor,
      collects: "balance",
      fee_schedule_version: "v1",
    })
    .eq("id", requestId);
  expect(error, error?.message).toBeNull();
}

/** A sent request with one matching line, which is the state most freeze tests
 *  need. */
async function sentRequest(
  actor: Actor,
  amountMinor = 5000,
): Promise<{ id: string; bookingId: string; lineId: string }> {
  const { id, bookingId } = await draftRequest(actor);
  const lineId = await addLine(actor, id, amountMinor);
  await send(id, amountMinor);
  return { id, bookingId, lineId };
}

async function addAllocation(
  actor: Actor,
  args: {
    bookingId?: string;
    projectId?: string;
    requestId?: string;
    lineId?: string;
    intent: string;
    component?: string;
    amountMinor?: number;
    status?: string;
  },
): Promise<string> {
  const { data, error } = await admin
    .from("payment_allocations")
    .insert({
      artist_id: actor.id,
      booking_id: args.bookingId ?? null,
      project_id: args.projectId ?? null,
      request_id: args.requestId ?? null,
      line_id: args.lineId ?? null,
      payment_intent_id: args.intent,
      component: args.component ?? "deposit",
      amount_minor: args.amountMinor ?? 5000,
      collected_total_minor: args.amountMinor ?? 5000,
      status: args.status ?? "succeeded",
    })
    .select("id")
    .single();
  expect(error, error?.message).toBeNull();
  return data!.id;
}

/** Cleanup runs before `destroyActor`. The cascade from `profiles` would take
 *  all of it anyway (proven by the account-deletion test below), but doing it
 *  explicitly keeps a failure in one table from looking like a failure in
 *  another. */
async function purge(actor: Actor | undefined): Promise<void> {
  if (!actor) return;
  await admin.from("payment_allocations").delete().eq("artist_id", actor.id);
  await admin.from("payment_request_lines").delete().eq("artist_id", actor.id);
  await admin.from("payment_requests").delete().eq("artist_id", actor.id);
  await admin.from("projects").delete().eq("artist_id", actor.id);
  await admin.from("booking_requests").delete().eq("artist_id", actor.id);
}

beforeAll(async () => {
  admin = adminClient();
  owner = await makeActor(admin, `${ADMIN_LABEL}-owner`);
  other = await makeActor(admin, `${ADMIN_LABEL}-other`);
  fixtures.set(owner.id, await makeFixtures(owner));
  fixtures.set(other.id, await makeFixtures(other));
}, 60_000);

afterAll(async () => {
  await purge(owner);
  await purge(other);
  await admin.from("products").delete().eq("artist_id", owner.id);
  await admin.from("products").delete().eq("artist_id", other.id);
  await admin.from("profiles").delete().eq("id", owner.id);
  await admin.from("profiles").delete().eq("id", other.id);
  await admin.auth.admin.deleteUser(owner.id);
  await admin.auth.admin.deleteUser(other.id);
}, 60_000);

// ===========================================================================

describe("payment_requests: the artist's own client can write", () => {
  // FALSIFICATION for this whole block: drop ONE policy at a time and the
  // matching test goes red while the others stay green. That per-verb
  // separation is the point. Dropping all four at once kills every test in the
  // file at fixture construction, which is exactly how vacuous tests hide.

  it("owner INSERTs their own draft payment request", async () => {
    // Goes red if `artist inserts own payment requests` is dropped. This is
    // the literal 0120/0118 defect: table with RLS on, no INSERT policy, writes
    // on the user-scoped client.
    const bookingId = await freshBooking(owner);
    const { data, error } = await owner.client
      .from("payment_requests")
      .insert({
        artist_id: owner.id,
        booking_id: bookingId,
        total_minor: 12000,
      })
      .select("id, status")
      .single();
    expect(error, error?.message).toBeNull();
    expect(data?.id).toBeTruthy();
    expect(data?.status).toBe("draft");
  });

  it("owner UPDATEs their own draft request and the change is durable", async () => {
    // Goes red if `artist updates own payment requests` is dropped.
    // Asserts the affected row count, because a USING-filtered UPDATE returns
    // `{ data: [], error: null }` and would otherwise pass with nothing written.
    const { id } = await draftRequest(owner, 1000);
    const { data, error } = await owner.client
      .from("payment_requests")
      .update({ total_minor: 7500 })
      .eq("id", id)
      .select("id, total_minor");
    expect(error, error?.message).toBeNull();
    expect(data, "the update must affect exactly one row").toHaveLength(1);

    const { data: after } = await owner.client
      .from("payment_requests")
      .select("total_minor")
      .eq("id", id)
      .single();
    expect(after?.total_minor, "the new total must be durable").toBe(7500);
  });

  it("owner DELETEs their own draft request", async () => {
    // Goes red if `artist deletes own payment requests` is dropped.
    const { id } = await draftRequest(owner);
    const { data, error } = await owner.client
      .from("payment_requests")
      .delete()
      .eq("id", id)
      .select("id");
    expect(error, error?.message).toBeNull();
    expect(data, "the delete must affect exactly one row").toHaveLength(1);

    const { data: after } = await admin
      .from("payment_requests")
      .select("id")
      .eq("id", id);
    expect(after ?? [], "and it must really be gone").toHaveLength(0);
  });

  it("owner SELECTs their own request", async () => {
    // Goes red if `artist reads own payment requests` is dropped.
    const { id } = await draftRequest(owner, 4200);
    const { data, error } = await owner.client
      .from("payment_requests")
      .select("id, total_minor")
      .eq("id", id);
    expect(error, error?.message).toBeNull();
    expect(data ?? []).toHaveLength(1);
    expect(data?.[0].total_minor).toBe(4200);
  });
});

describe("payment_requests: cross-account isolation", () => {
  it("refuses an INSERT that names another artist as the owner", async () => {
    // POSITIVE CONTROL FIRST, and it is the assertion that matters as much as
    // the refusal. Without it, "every insert is blocked" satisfies this test
    // exactly as well as "cross-account inserts are blocked", which is how the
    // one cross-account test in the P5d suite passed against a table with no
    // write policies at all.
    const ownBooking = await freshBooking(other);
    const control = await other.client
      .from("payment_requests")
      .insert({
        artist_id: other.id,
        booking_id: ownBooking,
        total_minor: 100,
      })
      .select("id")
      .single();
    expect(control.error, control.error?.message).toBeNull();

    const { error } = await other.client
      .from("payment_requests")
      .insert({
        artist_id: owner.id,
        booking_id: fx(owner).bookingId,
        total_minor: 100,
      })
      .select("id")
      .single();
    // Goes red if the INSERT policy's `artist_id = auth.uid()` is removed.
    expect(error?.code, "expected an RLS rejection, not another error").toBe(
      "42501",
    );
  });

  it("refuses an INSERT for another artist's appointment", async () => {
    // The subtler half: the artist_id is honest, the SUBJECT is stolen. The
    // foreign key alone proves the appointment exists, never who owns it, so
    // this is refused by the policy's `exists (... b.artist_id = auth.uid())`.
    const ownBooking = await freshBooking(other);
    const control = await other.client
      .from("payment_requests")
      .insert({
        artist_id: other.id,
        booking_id: ownBooking,
        total_minor: 100,
      })
      .select("id")
      .single();
    expect(control.error, control.error?.message).toBeNull();

    const { error } = await other.client
      .from("payment_requests")
      .insert({
        artist_id: other.id,
        booking_id: fx(owner).bookingId,
        total_minor: 100,
      })
      .select("id")
      .single();
    // Goes red if the booking `exists` clause is removed from the INSERT
    // policy. The composite FK would still refuse it (see the service-role
    // block), but with a different code, so this assertion distinguishes them.
    expect(error?.code, "expected an RLS rejection, not another error").toBe(
      "42501",
    );
  });

  it("refuses an INSERT for another artist's project", async () => {
    const control = await other.client
      .from("payment_requests")
      .insert({
        artist_id: other.id,
        project_id: fx(other).projectId,
        total_minor: 100,
      })
      .select("id")
      .single();
    expect(control.error, control.error?.message).toBeNull();
    // Clean up immediately: the project fixture is shared and the payable index
    // is not what this test is about.
    await admin.from("payment_requests").delete().eq("id", control.data!.id);

    const { error } = await other.client
      .from("payment_requests")
      .insert({
        artist_id: other.id,
        project_id: fx(owner).projectId,
        total_minor: 100,
      })
      .select("id")
      .single();
    expect(error?.code, "expected an RLS rejection, not another error").toBe(
      "42501",
    );
  });

  it("cannot SELECT another artist's request", async () => {
    const { id } = await draftRequest(owner, 9000);
    // Positive control: the row is genuinely there and the owner can see it,
    // so "zero rows" below is about visibility rather than about the row not
    // existing.
    const visible = await owner.client
      .from("payment_requests")
      .select("id")
      .eq("id", id);
    expect(visible.data ?? []).toHaveLength(1);

    const { data, error } = await other.client
      .from("payment_requests")
      .select("id")
      .eq("id", id);
    expect(error, error?.message).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("cannot UPDATE another artist's request", async () => {
    const { id } = await draftRequest(owner, 9000);

    // SILENT REFUSAL. RLS filters the row out of the UPDATE's WHERE clause, so
    // PostgREST returns `{ data: [], error: null }`. Asserting `error` is null
    // here proves nothing, which is why the row count and the read-back are
    // the actual assertions.
    const { data } = await other.client
      .from("payment_requests")
      .update({ total_minor: 1 })
      .eq("id", id)
      .select("id");
    expect(data ?? [], "the write must affect zero rows").toHaveLength(0);

    const { data: after } = await admin
      .from("payment_requests")
      .select("total_minor")
      .eq("id", id)
      .single();
    expect(after?.total_minor, "and the amount must be untouched").toBe(9000);

    // POSITIVE CONTROL: the same statement from the rightful owner lands. What
    // this proves and what it does not: the isolation demonstrated above comes
    // from the SELECT policy deciding which rows the WHERE clause can see, so
    // widening UPDATE alone would leave it green. Widen SELECT too and it goes
    // red. That caveat was executed on the sibling `product_collections` suite
    // and holds identically here.
    const control = await owner.client
      .from("payment_requests")
      .update({ total_minor: 9500 })
      .eq("id", id)
      .select("id");
    expect(control.data ?? []).toHaveLength(1);
  });

  it("cannot DELETE another artist's draft request", async () => {
    const { id } = await draftRequest(owner);
    const { data } = await other.client
      .from("payment_requests")
      .delete()
      .eq("id", id)
      .select("id");
    expect(data ?? [], "the delete must affect zero rows").toHaveLength(0);

    const { data: still } = await admin
      .from("payment_requests")
      .select("id")
      .eq("id", id);
    expect(still ?? [], "the request must survive").toHaveLength(1);

    // Positive control on the same row.
    const control = await owner.client
      .from("payment_requests")
      .delete()
      .eq("id", id)
      .select("id");
    expect(control.data ?? []).toHaveLength(1);
  });

  it("cannot hand its own request to another artist", async () => {
    const { id } = await draftRequest(owner, 3000);
    const { error } = await owner.client
      .from("payment_requests")
      .update({ artist_id: other.id })
      .eq("id", id)
      .select("id");
    expect(error?.code, "expected an RLS rejection, not another error").toBe(
      "42501",
    );

    const { data: after } = await admin
      .from("payment_requests")
      .select("artist_id")
      .eq("id", id)
      .single();
    expect(after?.artist_id).toBe(owner.id);
  });
});

describe("payment_requests: the money floor", () => {
  // THE POINT OF THIS BLOCK. An artist's own client must never be able to
  // assert that money arrived. Combined with the SELECT-only allocations
  // table, there is then no path by which an artist can manufacture a
  // settlement. Every status here is one A4 writes from the Stripe webhook on
  // the service role.
  const FORBIDDEN = [
    "paid",
    "partially_paid",
    "partially_refunded",
    "refunded",
    "disputed",
    "payment_processing",
    "failed",
  ] as const;

  // BOTH SUBJECTS, AND THE SENT ONE IS THE POINT. This block used to run only
  // against a DRAFT, and a draft cannot reach any of these seven states for a
  // reason that has nothing to do with the policy: `payment_requests_sent_latch_check`
  // requires a non-null `sent_at` for every status outside draft / ready /
  // cancelled, so the CHECK CONSTRAINT refused all seven first and the test was
  // measuring the constraint.
  //
  // The difference is visible the moment the thing under test actually breaks.
  // Executed, with `paid` added to the UPDATE policy's WITH CHECK list:
  //   draft subject -> 23514 (`payment_requests_sent_latch_check`), so the test
  //     still fails, but on the wrong code and for the wrong reason;
  //   sent subject  -> the write SUCCEEDS and the artist's own client has just
  //     asserted that money arrived.
  // The state that matters is the one where the constraint has nothing to say,
  // which is exactly a SENT request. So both are parameterised, and the sent
  // case is the money floor's real gate.
  const SUBJECTS = ["draft", "sent"] as const;
  const FLOOR_CASES = SUBJECTS.flatMap((subject) =>
    FORBIDDEN.map((status) => [subject, status] as const),
  );

  it.each(FLOOR_CASES)(
    "an artist cannot move their own %s request to %s",
    async (subject, status) => {
      // One test per (subject, status) on purpose: a single combined test tells
      // you the floor broke but not which state leaked through, or from where.
      const id =
        subject === "draft"
          ? (await draftRequest(owner, 1000)).id
          : (await sentRequest(owner, 5000)).id;

      const { error } = await owner.client
        .from("payment_requests")
        .update({ status })
        .eq("id", id)
        .select("id");
      // Goes red if that status is added to the UPDATE policy's WITH CHECK
      // list. LOUD rather than silent because WITH CHECK is what rejects it,
      // and the row itself was targetable: every `subject` here is inside the
      // policy's USING list, so a silent zero-row result would mean the USING
      // list changed instead.
      expect(error?.code, `expected 42501 for ${subject} -> ${status}`).toBe(
        "42501",
      );

      const { data: after } = await admin
        .from("payment_requests")
        .select("status")
        .eq("id", id)
        .single();
      expect(after?.status, "the status must be untouched").toBe(subject);
    },
  );

  it("an artist CAN move their own request to ready and to cancelled", async () => {
    // POSITIVE CONTROL for the whole block. Without it, an UPDATE policy that
    // refuses everything satisfies all seven tests above.
    const { id } = await draftRequest(owner, 1000);
    const ready = await owner.client
      .from("payment_requests")
      .update({ status: "ready" })
      .eq("id", id)
      .select("id, status");
    expect(ready.error, ready.error?.message).toBeNull();
    expect(ready.data ?? []).toHaveLength(1);
    expect(ready.data?.[0].status).toBe("ready");

    const cancelled = await owner.client
      .from("payment_requests")
      .update({ status: "cancelled" })
      .eq("id", id)
      .select("id, status");
    expect(cancelled.error, cancelled.error?.message).toBeNull();
    expect(cancelled.data?.[0].status).toBe("cancelled");
  });

  it("an artist cannot insert a request that is already sent and paid", async () => {
    // The other half of the floor. Without `sent_at is null and status in
    // ('draft','ready')` on the INSERT policy, an artist could create a row
    // that is indistinguishable from a real settlement and that never passed
    // through the freeze at all.
    const bookingId = await freshBooking(owner);
    const control = await owner.client
      .from("payment_requests")
      .insert({ artist_id: owner.id, booking_id: bookingId, total_minor: 100 })
      .select("id")
      .single();
    expect(control.error, control.error?.message).toBeNull();
    await admin.from("payment_requests").delete().eq("id", control.data!.id);

    const { error } = await owner.client
      .from("payment_requests")
      .insert({
        artist_id: owner.id,
        booking_id: bookingId,
        status: "paid",
        sent_at: new Date().toISOString(),
        total_minor: 50000,
        collects: "balance",
        fee_schedule_version: "v1",
      })
      .select("id")
      .single();
    expect(error?.code, "expected an RLS rejection, not another error").toBe(
      "42501",
    );
  });
});

// ===========================================================================

describe("payment_request_lines: the artist's own client can write", () => {
  it("owner INSERTs a line into their own draft request", async () => {
    // Goes red if `artist inserts own payment request lines` is dropped.
    const { id } = await draftRequest(owner);
    const { data, error } = await owner.client
      .from("payment_request_lines")
      .insert({
        request_id: id,
        artist_id: owner.id,
        name: "Full day session",
        quantity: 1,
        unit_amount_minor: 30000,
        line_total_minor: 30000,
        classification: "tattoo_service",
      })
      .select("id")
      .single();
    expect(error, error?.message).toBeNull();
    expect(data?.id).toBeTruthy();
  });

  it("owner UPDATEs a line on their own draft request", async () => {
    // Goes red if `artist updates own payment request lines` is dropped.
    const { id } = await draftRequest(owner);
    const lineId = await addLine(owner, id, 10000);
    const { data, error } = await owner.client
      .from("payment_request_lines")
      .update({ unit_amount_minor: 12000, line_total_minor: 12000 })
      .eq("id", lineId)
      .select("id, line_total_minor");
    expect(error, error?.message).toBeNull();
    expect(data, "the update must affect exactly one row").toHaveLength(1);
    expect(data?.[0].line_total_minor).toBe(12000);
  });

  it("owner DELETEs a line on their own draft request", async () => {
    // Goes red if `artist deletes own payment request lines` is dropped.
    const { id } = await draftRequest(owner);
    const lineId = await addLine(owner, id, 10000);
    const { data, error } = await owner.client
      .from("payment_request_lines")
      .delete()
      .eq("id", lineId)
      .select("id");
    expect(error, error?.message).toBeNull();
    expect(data, "the delete must affect exactly one row").toHaveLength(1);
  });

  it("owner SELECTs their own lines", async () => {
    // Goes red if `artist reads own payment request lines` is dropped.
    const { id } = await draftRequest(owner);
    await addLine(owner, id, 2500);
    const { data, error } = await owner.client
      .from("payment_request_lines")
      .select("id, line_total_minor")
      .eq("request_id", id);
    expect(error, error?.message).toBeNull();
    expect(data ?? []).toHaveLength(1);
    expect(data?.[0].line_total_minor).toBe(2500);
  });
});

describe("payment_request_lines: cross-account isolation", () => {
  it("cannot file a line into another artist's request", async () => {
    const ownRequest = await draftRequest(other);
    const control = await other.client
      .from("payment_request_lines")
      .insert({
        request_id: ownRequest.id,
        artist_id: other.id,
        name: "Control",
        quantity: 1,
        unit_amount_minor: 100,
        line_total_minor: 100,
        classification: "tip",
      })
      .select("id")
      .single();
    expect(control.error, control.error?.message).toBeNull();

    const victim = await draftRequest(owner);
    const { error } = await other.client
      .from("payment_request_lines")
      .insert({
        request_id: victim.id,
        artist_id: other.id,
        name: "Smuggled",
        quantity: 1,
        unit_amount_minor: 100,
        line_total_minor: 100,
        classification: "tip",
      })
      .select("id")
      .single();

    // 23514, NOT 42501, and the difference is worth pinning rather than
    // papering over. The BEFORE ROW trigger runs ahead of the RLS WITH CHECK,
    // and it is SECURITY INVOKER, so its lookup of the parent request is itself
    // filtered by RLS: another artist's request is invisible, which reads as
    // "no parent" and fails closed. Executed against this schema; asserting
    // 42501 here would fail for the right reason at the wrong layer.
    expect(error?.code, "expected the fail-closed parent check").toBe("23514");
    expect(error?.message).toContain("payment_request_lines_no_parent");
  });

  it("cannot link another artist's product to its own line", async () => {
    const { id } = await draftRequest(owner);
    const control = await owner.client
      .from("payment_request_lines")
      .insert({
        request_id: id,
        artist_id: owner.id,
        name: "Own product",
        quantity: 1,
        unit_amount_minor: 4000,
        line_total_minor: 4000,
        classification: "physical_goods",
        product_id: fx(owner).productId,
      })
      .select("id")
      .single();
    expect(control.error, control.error?.message).toBeNull();

    const { error } = await owner.client
      .from("payment_request_lines")
      .insert({
        request_id: id,
        artist_id: owner.id,
        name: "Their product",
        quantity: 1,
        unit_amount_minor: 4000,
        line_total_minor: 4000,
        classification: "physical_goods",
        product_id: fx(other).productId,
      })
      .select("id")
      .single();
    // Goes red if the product `exists` clause is dropped from the INSERT
    // policy. Here RLS DOES win: the parent request is the artist's own, so the
    // trigger passes and WITH CHECK is what refuses.
    expect(error?.code, "expected an RLS rejection, not another error").toBe(
      "42501",
    );
  });

  it("cannot SELECT another artist's lines", async () => {
    const { id } = await draftRequest(owner);
    const lineId = await addLine(owner, id, 3300);
    const visible = await owner.client
      .from("payment_request_lines")
      .select("id")
      .eq("id", lineId);
    expect(visible.data ?? [], "positive control").toHaveLength(1);

    const { data } = await other.client
      .from("payment_request_lines")
      .select("id")
      .eq("id", lineId);
    expect(data ?? []).toHaveLength(0);
  });

  it("cannot UPDATE another artist's line", async () => {
    const { id } = await draftRequest(owner);
    const lineId = await addLine(owner, id, 3300);

    const { data } = await other.client
      .from("payment_request_lines")
      .update({ line_total_minor: 1, unit_amount_minor: 1 })
      .eq("id", lineId)
      .select("id");
    expect(data ?? [], "the write must affect zero rows").toHaveLength(0);

    const { data: after } = await admin
      .from("payment_request_lines")
      .select("line_total_minor")
      .eq("id", lineId)
      .single();
    expect(after?.line_total_minor, "the amount must be untouched").toBe(3300);

    const control = await owner.client
      .from("payment_request_lines")
      .update({ line_total_minor: 3400, unit_amount_minor: 3400 })
      .eq("id", lineId)
      .select("id");
    expect(control.data ?? [], "positive control").toHaveLength(1);
  });

  it("cannot DELETE another artist's line", async () => {
    const { id } = await draftRequest(owner);
    const lineId = await addLine(owner, id, 3300);

    const { data } = await other.client
      .from("payment_request_lines")
      .delete()
      .eq("id", lineId)
      .select("id");
    expect(data ?? [], "the delete must affect zero rows").toHaveLength(0);

    const { data: still } = await admin
      .from("payment_request_lines")
      .select("id")
      .eq("id", lineId);
    expect(still ?? []).toHaveLength(1);

    const control = await owner.client
      .from("payment_request_lines")
      .delete()
      .eq("id", lineId)
      .select("id");
    expect(control.data ?? [], "positive control").toHaveLength(1);
  });
});

// ===========================================================================

describe("payment_allocations: an artist cannot forge one", () => {
  // An allocation is the record of money Stripe actually moved. An artist who
  // could write one could inflate their collected total, make an unpaid balance
  // read as settled, and manufacture dispute evidence. This table is SELECT
  // only, and the absence of the other three verbs is the design.

  it("an artist CAN read their own allocations", async () => {
    // POSITIVE CONTROL for the whole block, and it has to come first: without
    // it, "this client cannot reach the table at all" would satisfy every
    // refusal below.
    const { id, bookingId } = await sentRequest(owner, 6000);
    await addAllocation(owner, {
      bookingId,
      requestId: id,
      intent: `pi_read_${Date.now()}`,
      amountMinor: 6000,
    });
    const { data, error } = await owner.client
      .from("payment_allocations")
      .select("id, amount_minor")
      .eq("request_id", id);
    expect(error, error?.message).toBeNull();
    expect(data ?? []).toHaveLength(1);
    expect(data?.[0].amount_minor).toBe(6000);
  });

  it("an artist cannot INSERT an allocation", async () => {
    const { id, bookingId } = await sentRequest(owner, 6000);
    const { error } = await owner.client.from("payment_allocations").insert({
      artist_id: owner.id,
      booking_id: bookingId,
      request_id: id,
      payment_intent_id: `pi_forged_${Date.now()}`,
      component: "deposit",
      amount_minor: 6000,
      collected_total_minor: 6000,
      status: "succeeded",
    });
    expect(error?.code, "expected a permission rejection").toBe("42501");
    // TWO LAYERS, and the message distinguishes them. "permission denied for
    // table" is the REVOKE; "violates row-level security policy" is RLS with no
    // permissive policy. Both are 42501, so only the message can tell you which
    // one is actually holding. Asserted so that losing the revoke is visible
    // here rather than silently leaving RLS as the only layer.
    expect(error?.message).toContain("permission denied");
  });

  it("an artist cannot UPDATE an allocation to make an unpaid balance read as settled", async () => {
    const { id, bookingId } = await sentRequest(owner, 6000);
    const allocId = await addAllocation(owner, {
      bookingId,
      requestId: id,
      intent: `pi_upd_${Date.now()}`,
      amountMinor: 6000,
      status: "failed",
    });

    const { error } = await owner.client
      .from("payment_allocations")
      .update({ status: "succeeded", amount_minor: 99999 })
      .eq("id", allocId);
    expect(error?.code, "expected a permission rejection").toBe("42501");

    // Read the state back. A revoked UPDATE raises, but if the revoke were lost
    // and only RLS remained, this verb would refuse SILENTLY instead, and the
    // error assertion above would be the only thing standing between an artist
    // and a self-declared settlement.
    const { data: after } = await admin
      .from("payment_allocations")
      .select("status, amount_minor")
      .eq("id", allocId)
      .single();
    expect(after?.status).toBe("failed");
    expect(after?.amount_minor).toBe(6000);
  });

  it("an artist cannot DELETE an allocation", async () => {
    const { id, bookingId } = await sentRequest(owner, 6000);
    const allocId = await addAllocation(owner, {
      bookingId,
      requestId: id,
      intent: `pi_del_${Date.now()}`,
      amountMinor: 6000,
    });

    const { error } = await owner.client
      .from("payment_allocations")
      .delete()
      .eq("id", allocId);
    expect(error?.code, "expected a permission rejection").toBe("42501");

    const { data: still } = await admin
      .from("payment_allocations")
      .select("id")
      .eq("id", allocId);
    expect(still ?? [], "the allocation must survive").toHaveLength(1);
  });

  it("an artist cannot TRUNCATE the allocations table", async () => {
    // TRUNCATE IGNORES RLS ENTIRELY, so this is the one verb the policy layer
    // cannot refuse: it is held off only by the REVOKE in 0125. PostgREST
    // exposes no truncate verb, so this goes through a raw session that adopts
    // the `authenticated` role with real JWT claims.
    //
    // FOUND BY EXECUTING THIS, and it is the reason the test exists: on a
    // freshly reset local stack the revoke was NOT in effect, because
    // supabase/seed.sql re-grants ALL on every public table after migrations
    // run, and 0125's revoke had not been mirrored there. `truncate
    // payment_allocations` as `authenticated` SUCCEEDED. Mirroring it into
    // seed.sql is what makes this assertion meaningful locally; on production
    // seed.sql never runs, so the migration alone holds.
    const { id, bookingId } = await sentRequest(owner, 6000);
    await addAllocation(owner, {
      bookingId,
      requestId: id,
      intent: `pi_trunc_${Date.now()}`,
      amountMinor: 6000,
    });

    const session = PgSession.open("a1-truncate");
    try {
      await session.begin();
      await session.becomeArtist(owner.id);
      expect(
        await session.currentUser(),
        "the session must really be the authenticated role",
      ).toBe("authenticated");

      let code: string | undefined;
      try {
        await session.query("truncate payment_allocations");
      } catch (e) {
        code = (e as { code?: string }).code;
      }
      expect(code, "TRUNCATE must be refused by the grant").toBe("42501");
      await session.rollbackIfOpen();
    } finally {
      await session.close();
    }

    const { count } = await admin
      .from("payment_allocations")
      .select("id", { count: "exact", head: true })
      .eq("artist_id", owner.id);
    expect(count ?? 0, "the artist's allocations must survive").toBeGreaterThan(
      0,
    );
  });

  it("cannot SELECT another artist's allocations", async () => {
    const { id, bookingId } = await sentRequest(owner, 6000);
    const allocId = await addAllocation(owner, {
      bookingId,
      requestId: id,
      intent: `pi_priv_${Date.now()}`,
      amountMinor: 6000,
    });

    const visible = await owner.client
      .from("payment_allocations")
      .select("id")
      .eq("id", allocId);
    expect(visible.data ?? [], "positive control").toHaveLength(1);

    const { data } = await other.client
      .from("payment_allocations")
      .select("id")
      .eq("id", allocId);
    expect(data ?? []).toHaveLength(0);
  });
});

// ===========================================================================

describe("cross-owner rows are unrepresentable, even for the service role", () => {
  // THE PROPERTY RLS CANNOT GIVE YOU. Policies constrain client roles only. A4's
  // webhook, A8's reconciliation, every backfill and every admin path run as
  // the service role, which bypasses RLS entirely. If ownership lived only in
  // the WITH CHECK, all of those could write a cross-owner financial record.
  // The composite foreign keys are what make the state unstorable.
  //
  // FALSIFICATION for this whole block: drop the named constraint and the
  // matching test goes red with the row landing successfully. That is the
  // reverse test AGENTS.md asks for after the 0122 finding, and it is why each
  // test names its constraint.

  it("refuses a request for another artist's appointment (payment_requests_booking_fk)", async () => {
    const { error } = await admin.from("payment_requests").insert({
      artist_id: owner.id,
      booking_id: fx(other).bookingId,
      total_minor: 100,
    });
    expect(error?.code, "expected a foreign-key violation").toBe("23503");
  });

  it("refuses a request for another artist's project (payment_requests_project_fk)", async () => {
    const { error } = await admin.from("payment_requests").insert({
      artist_id: owner.id,
      project_id: fx(other).projectId,
      total_minor: 100,
    });
    expect(error?.code, "expected a foreign-key violation").toBe("23503");
  });

  it("refuses a line whose owner disagrees with its request (payment_request_lines_request_fk)", async () => {
    const { id } = await draftRequest(owner);
    const { error } = await admin.from("payment_request_lines").insert({
      request_id: id,
      artist_id: other.id,
      name: "Mismatched owner",
      quantity: 1,
      unit_amount_minor: 100,
      line_total_minor: 100,
      classification: "tip",
    });
    expect(error?.code, "expected a foreign-key violation").toBe("23503");
  });

  it("refuses a line denominated differently from its request (payment_request_lines_request_fk)", async () => {
    // The same three-column FK carries the currency, so a mixed-currency
    // request is unrepresentable rather than merely discouraged. Silently
    // adding 100 usd into a eur total is a money bug no application care
    // prevents once the row exists.
    const { id } = await draftRequest(owner);
    const { error } = await admin.from("payment_request_lines").insert({
      request_id: id,
      artist_id: owner.id,
      name: "Dollars",
      quantity: 1,
      unit_amount_minor: 100,
      line_total_minor: 100,
      currency: "usd",
      classification: "tip",
    });
    expect(error?.code, "expected a foreign-key violation").toBe("23503");
  });

  it("refuses a line linking another artist's product (payment_request_lines_product_fk)", async () => {
    const { id } = await draftRequest(owner);
    const { error } = await admin.from("payment_request_lines").insert({
      request_id: id,
      artist_id: owner.id,
      name: "Their product",
      quantity: 1,
      unit_amount_minor: 100,
      line_total_minor: 100,
      classification: "physical_goods",
      product_id: fx(other).productId,
    });
    expect(error?.code, "expected a foreign-key violation").toBe("23503");
  });

  it("refuses an allocation against another artist's appointment (payment_allocations_booking_fk)", async () => {
    const { error } = await admin.from("payment_allocations").insert({
      artist_id: owner.id,
      booking_id: fx(other).bookingId,
      payment_intent_id: `pi_xowner_${Date.now()}`,
      component: "deposit",
      amount_minor: 100,
      collected_total_minor: 100,
    });
    expect(error?.code, "expected a foreign-key violation").toBe("23503");
  });

  it("refuses cross-appointment deposit application (payment_allocations_request_booking_fk)", async () => {
    // Spec section 8's named failure mode. The allocation is the artist's own
    // and both appointments are theirs, so ownership alone would allow it: what
    // refuses it is that the request and the subject must be the SAME pair.
    const { id } = await draftRequest(owner);
    const otherBooking = await freshBooking(owner);
    const { error } = await admin.from("payment_allocations").insert({
      artist_id: owner.id,
      booking_id: otherBooking,
      request_id: id,
      payment_intent_id: `pi_xappt_${Date.now()}`,
      component: "deposit",
      amount_minor: 100,
      collected_total_minor: 100,
    });
    expect(error?.code, "expected a foreign-key violation").toBe("23503");
  });

  it("refuses an allocation naming an appointment-scoped request with a project subject", async () => {
    // The asymmetric case, which falls out of the same pair of FKs: no
    // payment_requests row has that (id, project_id) pair.
    const { id } = await draftRequest(owner);
    const { error } = await admin.from("payment_allocations").insert({
      artist_id: owner.id,
      project_id: fx(owner).projectId,
      request_id: id,
      payment_intent_id: `pi_xsub_${Date.now()}`,
      component: "deposit",
      amount_minor: 100,
      collected_total_minor: 100,
    });
    expect(error?.code, "expected a foreign-key violation").toBe("23503");
  });

  it("refuses an allocation denominated differently from its request (payment_allocations_request_fk)", async () => {
    const { id, bookingId } = await draftRequest(owner);
    const { error } = await admin.from("payment_allocations").insert({
      artist_id: owner.id,
      booking_id: bookingId,
      request_id: id,
      currency: "usd",
      payment_intent_id: `pi_xcur_${Date.now()}`,
      component: "deposit",
      amount_minor: 100,
      collected_total_minor: 100,
    });
    expect(error?.code, "expected a foreign-key violation").toBe("23503");
  });

  it("refuses an allocation attributing a line from a different request (payment_allocations_line_fk)", async () => {
    // What makes single-line refunds safe: a refund cannot be attributed to a
    // line that belongs to some other request.
    const a = await draftRequest(owner);
    const b = await draftRequest(owner);
    const foreignLine = await addLine(owner, b.id, 2000);
    const { error } = await admin.from("payment_allocations").insert({
      artist_id: owner.id,
      booking_id: a.bookingId,
      request_id: a.id,
      line_id: foreignLine,
      payment_intent_id: `pi_xline_${Date.now()}`,
      component: "refund_adjustment",
      amount_minor: -100,
      collected_total_minor: 100,
    });
    expect(error?.code, "expected a foreign-key violation").toBe("23503");
  });

  it("still accepts a correct request, line and allocation as the service role", async () => {
    // POSITIVE CONTROL for the whole block. Every rejection above is about
    // ownership, currency or subject, not about the service role being unable
    // to write these tables at all. Without this, a table the service role
    // could not write would satisfy all ten.
    const { id, bookingId } = await draftRequest(owner);
    const lineId = await addLine(owner, id, 4000, {
      classification: "physical_goods",
      product_id: fx(owner).productId,
    });
    await send(id, 4000);
    const { error } = await admin.from("payment_allocations").insert({
      artist_id: owner.id,
      booking_id: bookingId,
      request_id: id,
      line_id: lineId,
      payment_intent_id: `pi_good_${Date.now()}`,
      component: "physical_goods",
      amount_minor: 4000,
      collected_total_minor: 4000,
      status: "succeeded",
    });
    expect(error, error?.message).toBeNull();
  });

  it("refuses one payment_intent spanning TWO ARTISTS (payment_allocations_collection_booking_fk)", async () => {
    // WHY THIS IS A MONEY DEFECT AND NOT A TIDINESS ONE. Every per-intent sum
    // in A4, A5 and A8 (refund convergence, `collected_total_minor`,
    // reconciliation) groups by `payment_intent_id`. Before `payment_collections`
    // existed this executed as the SERVICE ROLE:
    //   ins1=201 ins2=201 rows=2 distinctArtists=2 distinctBookings=2
    // Two artists' money under one intent, so every one of those sums was a
    // cross-artist figure and the AGENTS.md rule that a refund "computes the
    // total that should have been applied" would compute it across owners.
    //
    // A PARENT TABLE RATHER THAN A COMPARISON TRIGGER, and the reason is the
    // 0124 rule: a trigger's check and its write are two statements under READ
    // COMMITTED, so two concurrent FIRST inserts would each find no group and
    // each pass. A composite FK is checked by the FK machinery and binds for
    // EVERY role, which is what matters here because RLS never constrains the
    // service role.
    const intent = `pi_span_${Date.now()}_${Math.random().toString(16).slice(2)}`;

    const first = await admin
      .from("payment_allocations")
      .insert({
        artist_id: owner.id,
        booking_id: fx(owner).bookingId,
        payment_intent_id: intent,
        component: "deposit",
        amount_minor: 5000,
        collected_total_minor: 5000,
        status: "succeeded",
      })
      .select("id");
    expect(first.error, first.error?.message).toBeNull();

    const second = await admin
      .from("payment_allocations")
      .insert({
        artist_id: other.id,
        booking_id: fx(other).bookingId,
        payment_intent_id: intent,
        // A DIFFERENT component on purpose. With `deposit` on both rows the
        // insert is refused by `payment_allocations_unique`
        // (NULLS NOT DISTINCT on (payment_intent_id, component, line_id)) and
        // returns 23505 before the collection FK is ever consulted, so the test
        // would pass while proving nothing about ownership. Measured: that is
        // exactly what the first draft of this test did.
        component: "tip",
        amount_minor: 5000,
        collected_total_minor: 5000,
        status: "succeeded",
      })
      .select("id");
    // 23503, not 42501: this is a foreign key, and the service role is a role
    // RLS would never have stopped.
    expect(
      second.error?.code,
      "expected a collection FK to refuse a second owner on one intent",
    ).toBe("23503");
    // A COLLECTION KEY, not a named one, and that is measured rather than lazy.
    // Two artists necessarily bring two different appointments, so BOTH
    // `payment_allocations_collection_fk` and
    // `payment_allocations_collection_booking_fk` are violated, and which one
    // reports depends on trigger creation order: executed, the same insert
    // reported the booking key on one build of the schema and the artist key on
    // another (after a drop-and-recreate reordered the FK triggers). Pinning
    // either name here would make this test go red for a reason that is not a
    // defect. The three keys are separated one per test below, where exactly one
    // of them can be violated and the name IS asserted.
    expect(String(second.error?.message)).toMatch(
      /payment_allocations_collection(_booking|_project)?_fk/,
    );

    const { data: rows } = await admin
      .from("payment_allocations")
      .select("artist_id")
      .eq("payment_intent_id", intent);
    expect(rows ?? [], "only the first owner's row may exist").toHaveLength(1);
    expect(rows?.[0].artist_id).toBe(owner.id);
  });

  it("refuses one payment_intent spanning TWO SUBJECTS of the same artist", async () => {
    // The subtler half, and the one an ownership check alone would miss: same
    // artist, same currency, two different appointments. `payment_collections`
    // carries the subject, so `payment_allocations_collection_booking_fk` binds
    // it.
    const intent = `pi_span2_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const first = await admin
      .from("payment_allocations")
      .insert({
        artist_id: owner.id,
        booking_id: fx(owner).bookingId,
        payment_intent_id: intent,
        component: "deposit",
        amount_minor: 5000,
        collected_total_minor: 5000,
        status: "succeeded",
      })
      .select("id");
    expect(first.error, first.error?.message).toBeNull();

    const second = await admin
      .from("payment_allocations")
      .insert({
        artist_id: owner.id,
        booking_id: fx(owner).bookingId2,
        payment_intent_id: intent,
        component: "tip",
        amount_minor: 1000,
        collected_total_minor: 6000,
        status: "succeeded",
      })
      .select("id");
    expect(
      second.error?.code,
      "expected the collection subject FK to refuse a second appointment on one intent",
    ).toBe("23503");
    expect(String(second.error?.message)).toContain(
      "payment_allocations_collection_booking_fk",
    );
  });

  it("refuses one payment_intent spanning TWO CURRENCIES (payment_allocations_collection_fk)", async () => {
    // THIS is what isolates the artist-and-currency key: same artist, same
    // appointment, so both subject keys match the existing collection and only
    // `(payment_intent_id, artist_id, currency)` can disagree. A single intent
    // carrying two currencies would make `collected_total_minor` a sum of two
    // units, which is the same class of defect as summing across artists.
    const intent = `pi_cur_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const first = await admin
      .from("payment_allocations")
      .insert({
        artist_id: owner.id,
        booking_id: fx(owner).bookingId,
        payment_intent_id: intent,
        component: "deposit",
        amount_minor: 5000,
        collected_total_minor: 5000,
        status: "succeeded",
      })
      .select("id");
    expect(first.error, first.error?.message).toBeNull();

    const second = await admin
      .from("payment_allocations")
      .insert({
        artist_id: owner.id,
        booking_id: fx(owner).bookingId,
        payment_intent_id: intent,
        component: "tip",
        amount_minor: 1000,
        collected_total_minor: 6000,
        status: "succeeded",
        currency: "usd",
      })
      .select("id");
    expect(second.error?.code).toBe("23503");
    expect(String(second.error?.message)).toContain(
      "payment_allocations_collection_fk",
    );
  });

  it("refuses one payment_intent spanning an appointment AND a project (payment_allocations_collection_project_fk)", async () => {
    // The third key, isolated the same way. The first row is appointment-scoped
    // so the collection carries a null `project_id`; a project-scoped second
    // row matches `(intent, artist, currency)` and matches `(intent, booking)`
    // vacuously (MATCH SIMPLE is satisfied the moment a column is null), so
    // only the project key can refuse it.
    const intent = `pi_proj_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const first = await admin
      .from("payment_allocations")
      .insert({
        artist_id: owner.id,
        booking_id: fx(owner).bookingId,
        payment_intent_id: intent,
        component: "deposit",
        amount_minor: 5000,
        collected_total_minor: 5000,
        status: "succeeded",
      })
      .select("id");
    expect(first.error, first.error?.message).toBeNull();

    const second = await admin
      .from("payment_allocations")
      .insert({
        artist_id: owner.id,
        project_id: fx(owner).projectId,
        payment_intent_id: intent,
        component: "tip",
        amount_minor: 1000,
        collected_total_minor: 6000,
        status: "succeeded",
      })
      .select("id");
    expect(second.error?.code).toBe("23503");
    expect(String(second.error?.message)).toContain(
      "payment_allocations_collection_project_fk",
    );
  });

  it("STILL ACCEPTS several components on ONE intent, which is the normal case", async () => {
    // POSITIVE CONTROL, and it is load-bearing: a deposit and a tip collected
    // by one PaymentIntent is exactly what A4 writes, so a parent table that
    // refused every second row would break settlement while passing both tests
    // above. Same artist, same appointment, same currency, two components.
    const intent = `pi_multi_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const a = await admin
      .from("payment_allocations")
      .insert({
        artist_id: owner.id,
        booking_id: fx(owner).bookingId,
        payment_intent_id: intent,
        component: "deposit",
        amount_minor: 5000,
        collected_total_minor: 6000,
        status: "succeeded",
      })
      .select("id");
    expect(a.error, a.error?.message).toBeNull();

    const b = await admin
      .from("payment_allocations")
      .insert({
        artist_id: owner.id,
        booking_id: fx(owner).bookingId,
        payment_intent_id: intent,
        component: "tip",
        amount_minor: 1000,
        collected_total_minor: 6000,
        status: "succeeded",
      })
      .select("id");
    expect(b.error, b.error?.message).toBeNull();

    const { data: rows } = await admin
      .from("payment_allocations")
      .select("id")
      .eq("payment_intent_id", intent);
    expect(rows ?? [], "both components must be storable").toHaveLength(2);

    // And exactly ONE collection row was auto-created for them, by the
    // `payment_allocations_ensure_collection` trigger rather than by A4.
    const { data: collections } = await admin
      .from("payment_collections")
      .select("payment_intent_id, artist_id, booking_id")
      .eq("payment_intent_id", intent);
    expect(collections ?? [], "one intent, one collection row").toHaveLength(1);
    expect(collections?.[0].artist_id).toBe(owner.id);
    expect(collections?.[0].booking_id).toBe(fx(owner).bookingId);
  });

  it("an artist cannot create a collection to make a spanning intent representable", async () => {
    // The escape hatch, closed. If `payment_collections` were artist-writable,
    // an artist could pre-create the parent row that makes a foreign allocation
    // storable. 0125 revokes INSERT / UPDATE / DELETE from `authenticated` and
    // leaves a SELECT-only policy, which is the same shape as
    // `payment_allocations`.
    const { error } = await owner.client
      .from("payment_collections")
      .insert({
        payment_intent_id: `pi_forged_${Date.now()}`,
        artist_id: owner.id,
        booking_id: fx(owner).bookingId,
        currency: "eur",
      })
      .select("payment_intent_id");
    expect(
      error?.code,
      "expected a grant-level refusal, not a policy one",
    ).toBe("42501");
  });

  it("refuses a second refund_adjustment row for the same line (payment_allocations_unique)", async () => {
    // The AGENTS.md webhook rule made structural: `charge.refunded` carries a
    // CUMULATIVE amount and Stripe redelivers events, so a handler that adds a
    // delta would double-count. A second delta row is not storable, which
    // leaves converging the existing row as the only implementable handler.
    const { id, bookingId } = await draftRequest(owner);
    const lineId = await addLine(owner, id, 4000);
    await send(id, 4000);
    const intent = `pi_refund_${Date.now()}`;
    await addAllocation(owner, {
      bookingId,
      requestId: id,
      lineId,
      intent,
      component: "tattoo_service_balance",
      amountMinor: 4000,
    });

    const first = await admin.from("payment_allocations").insert({
      artist_id: owner.id,
      booking_id: bookingId,
      request_id: id,
      line_id: lineId,
      payment_intent_id: intent,
      component: "refund_adjustment",
      amount_minor: -1000,
      collected_total_minor: 4000,
      status: "succeeded",
    });
    expect(first.error, first.error?.message).toBeNull();

    const second = await admin.from("payment_allocations").insert({
      artist_id: owner.id,
      booking_id: bookingId,
      request_id: id,
      line_id: lineId,
      payment_intent_id: intent,
      component: "refund_adjustment",
      amount_minor: -500,
      collected_total_minor: 4000,
      status: "succeeded",
    });
    expect(second.error?.code, "a delta row must not be storable").toBe(
      "23505",
    );

    // Converging the existing row to the cumulative total IS allowed, which is
    // the handler shape the constraint forces.
    const converge = await admin
      .from("payment_allocations")
      .update({ amount_minor: -1500 })
      .eq("payment_intent_id", intent)
      .eq("component", "refund_adjustment")
      .select("amount_minor");
    expect(converge.error, converge.error?.message).toBeNull();
    expect(converge.data?.[0].amount_minor).toBe(-1500);
  });
});

// ===========================================================================

describe("a sent request is frozen, for every role", () => {
  // "The amount someone agreed to and the amount charged must be the same
  // object" is a rule about the ROW, not about the artist's client, so it is
  // enforced by triggers rather than policies. Every test in this block runs as
  // the SERVICE role except where it says otherwise.
  //
  // FALSIFICATION: drop the `payment_requests_immutability` or
  // `payment_request_lines_frozen` trigger and the matching tests go red with
  // the edit landing.

  it("the service role cannot change the total of a sent request", async () => {
    const { id } = await sentRequest(owner, 5000);
    const { error } = await admin
      .from("payment_requests")
      .update({ total_minor: 1 })
      .eq("id", id);
    expect(error?.code, "expected a check violation").toBe("23514");
    expect(error?.message).toContain("payment_request_frozen");

    const { data: after } = await admin
      .from("payment_requests")
      .select("total_minor")
      .eq("id", id)
      .single();
    expect(after?.total_minor).toBe(5000);
  });

  it("the service role CAN change the total of a draft request", async () => {
    // POSITIVE CONTROL: the freeze is about being sent, not about the column
    // being read-only. Without this, a trigger that refused every update would
    // satisfy the whole block.
    const { id } = await draftRequest(owner, 1000);
    const { error } = await admin
      .from("payment_requests")
      .update({ total_minor: 2000 })
      .eq("id", id);
    expect(error, error?.message).toBeNull();
    const { data: after } = await admin
      .from("payment_requests")
      .select("total_minor")
      .eq("id", id)
      .single();
    expect(after?.total_minor).toBe(2000);
  });

  it("the freeze latch cannot be released", async () => {
    const { id } = await sentRequest(owner, 5000);
    const { error } = await admin
      .from("payment_requests")
      .update({ sent_at: null })
      .eq("id", id);
    expect(error?.code).toBe("23514");
    expect(error?.message).toContain("payment_request_frozen");
  });

  it("a sent request cannot walk back into draft", async () => {
    // Without this rule the freeze is bypassable in two statements rather than
    // one: return to draft, then edit the total.
    const { id } = await sentRequest(owner, 5000);
    const { error } = await admin
      .from("payment_requests")
      .update({ status: "draft" })
      .eq("id", id);
    expect(error?.code).toBe("23514");
    expect(error?.message).toContain("payment_request_frozen");
  });

  it("a sent request CAN still change status forward", async () => {
    // POSITIVE CONTROL: the freeze closes the money columns, not the lifecycle.
    const { id } = await sentRequest(owner, 5000);
    const { error } = await admin
      .from("payment_requests")
      .update({ status: "viewed", viewed_at: new Date().toISOString() })
      .eq("id", id);
    expect(error, error?.message).toBeNull();
  });

  it("the service role cannot add a line to a sent request", async () => {
    const { id } = await sentRequest(owner, 5000);
    const { error } = await admin.from("payment_request_lines").insert({
      request_id: id,
      artist_id: owner.id,
      name: "Sneaked in",
      quantity: 1,
      unit_amount_minor: 100,
      line_total_minor: 100,
      classification: "tip",
    });
    expect(error?.code).toBe("23514");
    expect(error?.message).toContain("payment_request_lines_frozen");
  });

  it("the service role cannot edit a line of a sent request", async () => {
    const { id, lineId } = await sentRequest(owner, 5000);
    const { error } = await admin
      .from("payment_request_lines")
      .update({ unit_amount_minor: 1, line_total_minor: 1 })
      .eq("id", lineId);
    expect(error?.code).toBe("23514");
    expect(error?.message).toContain("payment_request_lines_frozen");

    const { data: after } = await admin
      .from("payment_request_lines")
      .select("line_total_minor")
      .eq("id", lineId)
      .single();
    expect(after?.line_total_minor).toBe(5000);
    expect(id).toBeTruthy();
  });

  it("the service role cannot delete a line of a sent request", async () => {
    const { lineId } = await sentRequest(owner, 5000);
    const { error } = await admin
      .from("payment_request_lines")
      .delete()
      .eq("id", lineId);
    expect(error?.code).toBe("23514");
    expect(error?.message).toContain("payment_request_lines_frozen");
  });

  it("the artist's own attempt to edit a frozen amount is refused LOUDLY", async () => {
    // A `sent` row IS targetable by the UPDATE policy's USING clause, so the
    // artist reaches the trigger and gets a real error. Distinguishing this
    // from the silent cases below is what A2 has to branch on.
    const { id } = await sentRequest(owner, 5000);
    const { error } = await owner.client
      .from("payment_requests")
      .update({ total_minor: 1 })
      .eq("id", id)
      .select("id");
    expect(error?.code).toBe("23514");
    expect(error?.message).toContain("payment_request_frozen");
  });

  it("the artist's attempt to edit a frozen LINE is refused SILENTLY", async () => {
    // THE DANGEROUS ONE. The line UPDATE policy requires an unfrozen parent, so
    // the row is filtered out by USING and PostgREST returns
    // `{ data: [], error: null }`. A core that reads "no error" as "it worked"
    // reports a successful edit that never happened. Only the row count and the
    // read-back can see this.
    const { lineId } = await sentRequest(owner, 5000);
    const { data, error } = await owner.client
      .from("payment_request_lines")
      .update({ unit_amount_minor: 1, line_total_minor: 1 })
      .eq("id", lineId)
      .select("id");
    expect(error, "this refusal carries NO error, which is the hazard").toBe(
      null,
    );
    expect(data ?? [], "the write must affect zero rows").toHaveLength(0);

    const { data: after } = await admin
      .from("payment_request_lines")
      .select("unit_amount_minor, line_total_minor")
      .eq("id", lineId)
      .single();
    expect(after?.line_total_minor, "the line must be byte-identical").toBe(
      5000,
    );
    expect(after?.unit_amount_minor).toBe(5000);
  });

  it("the artist's attempt to delete a frozen LINE is refused SILENTLY", async () => {
    const { lineId } = await sentRequest(owner, 5000);
    const { data, error } = await owner.client
      .from("payment_request_lines")
      .delete()
      .eq("id", lineId)
      .select("id");
    expect(error).toBe(null);
    expect(data ?? []).toHaveLength(0);

    const { data: still } = await admin
      .from("payment_request_lines")
      .select("id")
      .eq("id", lineId);
    expect(still ?? [], "the line must survive").toHaveLength(1);
  });

  it("the artist's attempt to delete a SENT request is refused SILENTLY", async () => {
    // A sent request is a client-facing financial record: the client may hold a
    // copy of the amount, and A5's refunds and A8's reconciliation both read
    // backwards through it.
    const { id } = await sentRequest(owner, 5000);
    const { data, error } = await owner.client
      .from("payment_requests")
      .delete()
      .eq("id", id)
      .select("id");
    expect(error).toBe(null);
    expect(data ?? []).toHaveLength(0);

    const { data: still } = await admin
      .from("payment_requests")
      .select("id")
      .eq("id", id);
    expect(still ?? []).toHaveLength(1);
  });

  it("the SERVICE ROLE cannot delete a sent request, and cannot re-create it", async () => {
    // THE HOLE THE ARTIST TEST ABOVE DOES NOT COVER. The artist's DELETE is
    // refused by an RLS policy, and RLS never constrains the service role,
    // which is exactly the role A4's webhook and every admin script run as.
    // Before `payment_requests_delete_frozen` existed, this executed:
    //   del=1 delHttp=200 reins=201 after=[{"total_minor":999999,"status":"sent"}]
    // The row kept the id every receipt and every Stripe metadata field points
    // at, and stated a different amount. The freeze is meant to be a property
    // of the ROW, not a permission, so it has to hold here too.
    const { id } = await sentRequest(owner, 5000);

    const del = await admin
      .from("payment_requests")
      .delete()
      .eq("id", id)
      .select("id");
    // LOUD: a trigger raises, unlike the artist's silent policy filter.
    expect(
      del.error?.code,
      "expected the frozen-delete trigger to raise for the service role too",
    ).toBe("23514");
    expect(String(del.error?.message)).toContain("payment_request_frozen");
    expect(del.data ?? [], "the delete must affect zero rows").toHaveLength(0);

    // The second half, and the reason a delete alone is not the whole defect:
    // re-inserting the SAME id would let a different amount inherit every
    // reference to the original.
    const reins = await admin
      .from("payment_requests")
      .insert({
        id,
        artist_id: owner.id,
        booking_id: await freshBooking(owner),
        total_minor: 999_999,
        status: "sent",
        sent_at: new Date().toISOString(),
        collects: "balance",
        fee_schedule_version: "v1",
      })
      .select("id");
    expect(reins.error?.code, "the id must still be taken").toBe("23505");

    const { data: after } = await admin
      .from("payment_requests")
      .select("total_minor, status")
      .eq("id", id)
      .single();
    expect(after?.total_minor, "the original amount must survive").toBe(5000);
    expect(after?.status).toBe("sent");
  });

  it("the service role CAN delete a DRAFT request, so the refusal is about the freeze", async () => {
    // POSITIVE CONTROL for the trigger above. Without it, a trigger that
    // refused EVERY delete would satisfy the test above exactly as well, and
    // would break account deletion, fixtures and every teardown in this file.
    const { id } = await draftRequest(owner, 1000);
    const { data, error } = await admin
      .from("payment_requests")
      .delete()
      .eq("id", id)
      .select("id");
    expect(error, error?.message).toBeNull();
    expect(data ?? []).toHaveLength(1);
  });

  it("a CASCADE still removes a sent request, so the trigger has not broken deletion", async () => {
    // The carve-out, tested rather than trusted. `enforce_payment_request_delete_frozen`
    // admits every delete at `pg_trigger_depth() > 1`, which is how the account
    // and subject cascades keep working. If that carve-out were dropped, this
    // test and the account-deletion test at the bottom of the file would go red
    // together and GDPR erasure would be broken; if the trigger were dropped
    // instead, only the two tests above go red. The pair says which.
    const { id, bookingId } = await sentRequest(owner, 5000);
    const { error } = await admin
      .from("booking_requests")
      .delete()
      .eq("id", bookingId);
    expect(error, error?.message).toBeNull();

    const { data: gone } = await admin
      .from("payment_requests")
      .select("id")
      .eq("id", id);
    expect(
      gone ?? [],
      "the cascade must take the sent request with it",
    ).toHaveLength(0);
  });

  it("the artist CAN cancel their own sent request", async () => {
    // POSITIVE CONTROL for the three silent refusals above: the artist is not
    // simply locked out of a sent request, they are locked out of editing its
    // money and its lines. Cancel-and-replace has to remain reachable, because
    // it is how a frozen request is superseded.
    const { id } = await sentRequest(owner, 5000);
    const { data, error } = await owner.client
      .from("payment_requests")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("id", id)
      .select("id, status");
    expect(error, error?.message).toBeNull();
    expect(data ?? []).toHaveLength(1);
    expect(data?.[0].status).toBe("cancelled");
  });

  it("sending a request whose total is not the sum of its lines is refused", async () => {
    // Spec section 3 allows no unstructured "additional amount", so a sent
    // total that is not exactly the sum of the visible lines is a delta the
    // client cannot account for. Verified at the freeze point, for every role.
    const { id } = await draftRequest(owner);
    await addLine(owner, id, 30000);
    const { error } = await admin
      .from("payment_requests")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        total_minor: 99999,
        collects: "balance",
        fee_schedule_version: "v1",
      })
      .eq("id", id);
    expect(error?.code).toBe("23514");
    expect(error?.message).toContain("payment_request_total_mismatch");

    const { data: after } = await admin
      .from("payment_requests")
      .select("status, sent_at")
      .eq("id", id)
      .single();
    expect(after?.status, "the request must stay unsent").toBe("draft");
    expect(after?.sent_at).toBeNull();
  });

  it("sending a request whose total matches its lines succeeds", async () => {
    // POSITIVE CONTROL: without it, a trigger that refused every send would
    // satisfy the test above.
    const { id } = await draftRequest(owner);
    await addLine(owner, id, 30000);
    await addLine(owner, id, 2500, { classification: "tip", name: "Tip" });
    const { error } = await admin
      .from("payment_requests")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        total_minor: 32500,
        collects: "balance",
        fee_schedule_version: "v1",
      })
      .eq("id", id);
    expect(error, error?.message).toBeNull();
  });

  it("deleting a linked product releases the link and leaves the frozen line intact", async () => {
    // The one narrow exception the lines trigger permits: an ON DELETE SET NULL
    // referential action nulls `product_id` on a frozen line. It releases a link
    // and changes nothing the client saw, so the financial record survives. If
    // the trigger refused it, deleting a product that ever appeared on a sent
    // request would fail with a confusing constraint error.
    const { data: prod, error: prodErr } = await admin
      .from("products")
      .insert({
        artist_id: owner.id,
        title: "Doomed product",
        price_amount: 40,
        currency: "eur",
      })
      .select("id")
      .single();
    expect(prodErr, prodErr?.message).toBeNull();

    const { id } = await draftRequest(owner);
    const lineId = await addLine(owner, id, 4000, {
      classification: "physical_goods",
      product_id: prod!.id,
      name: "Goods line",
    });
    await send(id, 4000);

    const { error } = await admin.from("products").delete().eq("id", prod!.id);
    expect(error, error?.message).toBeNull();

    const { data: after } = await admin
      .from("payment_request_lines")
      .select("product_id, line_total_minor, name")
      .eq("id", lineId)
      .single();
    expect(after?.product_id).toBeNull();
    expect(after?.line_total_minor, "the amount must survive").toBe(4000);
    expect(after?.name).toBe("Goods line");
  });
});

// ===========================================================================

describe("at most one payable request per appointment", () => {
  it("refuses a second SEND against the same appointment", async () => {
    // Spec section 8's "duplicate requests" and "concurrent attempts", covered
    // at the only layer that holds under concurrency: two sends racing cannot
    // both win, whatever the cores do.
    const { bookingId } = await sentRequest(owner, 5000);
    const { error } = await admin.from("payment_requests").insert({
      artist_id: owner.id,
      booking_id: bookingId,
      status: "sent",
      sent_at: new Date().toISOString(),
      total_minor: 100,
      collects: "balance",
      fee_schedule_version: "v1",
    });
    expect(error?.code, "expected a unique violation").toBe("23505");
  });

  it("allows a DRAFT replacement alongside an outstanding request", async () => {
    // POSITIVE CONTROL, and a deliberate product decision rather than an
    // accident: the artist can prepare a replacement while one is outstanding,
    // and the collision lands at SEND, which is exactly when they must have
    // decided whether the old one is cancelled.
    const { bookingId } = await sentRequest(owner, 5000);
    const { error } = await admin.from("payment_requests").insert({
      artist_id: owner.id,
      booking_id: bookingId,
      status: "draft",
      total_minor: 100,
    });
    expect(error, error?.message).toBeNull();
  });
});

describe("account deletion cascades the whole chain", () => {
  it("deletes a sent request, its lines and its allocations with the profile", async () => {
    // The supersession FK and the allocation-to-request FK are both NO ACTION,
    // which refuses a lone delete of a still-referenced revision. NO ACTION is
    // checked at end of statement, so an account deletion taking the whole
    // chain at once passes. This test exists because getting that wrong makes
    // account deletion fail in production and nowhere else.
    const victim = await makeActor(admin, `${ADMIN_LABEL}-victim`);
    const bookingId = await freshBooking(victim);
    const { data: req, error: reqErr } = await admin
      .from("payment_requests")
      .insert({ artist_id: victim.id, booking_id: bookingId, total_minor: 0 })
      .select("id")
      .single();
    expect(reqErr, reqErr?.message).toBeNull();
    await addLine(victim, req!.id, 5000);
    await send(req!.id, 5000);
    await addAllocation(victim, {
      bookingId,
      requestId: req!.id,
      intent: `pi_victim_${Date.now()}`,
      amountMinor: 5000,
    });

    const { error } = await admin.from("profiles").delete().eq("id", victim.id);
    expect(error, error?.message).toBeNull();

    for (const table of [
      "payment_requests",
      "payment_request_lines",
      "payment_allocations",
    ]) {
      const { count } = await admin
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("artist_id", victim.id);
      expect(count ?? 0, `${table} must be empty`).toBe(0);
    }

    await admin.auth.admin.deleteUser(victim.id);
  });
});

// ---------------------------------------------------------------------------
// PAY-RLS-005 regression (migration 0133): the ANON role must see NOTHING.
//
// 0128 shipped anon SELECT policies whose USING clause was
// `customer_token_hash is not null` — i.e. "any row ever sent", never a token
// match — so the anon key could read EVERY sent payment request through
// PostgREST. 0133 dropped both policies (nothing needs them: the pay page reads
// through the service client). This pins that the drop happened AND stays
// dropped: with no anon policy, an anon SELECT is USING-filtered to nothing,
// which per the gotcha at the top of this file is a SILENT empty result
// (`{ data: [], error: null }`), so the assertion is on the row count with the
// error also asserted null — an error here would mean something else changed.
describe("anon role reads nothing (PAY-RLS-005 / 0133)", () => {
  it("a SENT request with a token hash is invisible to the anon key", async () => {
    const { anonClient } = await import("./helpers/actor");

    // Fixture via the service role: a sent request with a token hash — exactly
    // the row 0128's policy would have exposed.
    const fx = fixtures.get(owner.id)!;
    const made = await admin
      .from("payment_requests")
      .insert({
        artist_id: owner.id,
        booking_id: fx.bookingId,
        status: "sent",
        currency: "eur",
        collects: "deposit",
        total_minor: 5000,
        revision: 1,
        sent_at: new Date().toISOString(),
        customer_token_hash: "a1-regression-hash",
      })
      .select("id")
      .single();
    expect(made.error, made.error?.message).toBeNull();
    const requestId = made.data!.id as string;

    const line = await admin.from("payment_request_lines").insert({
      request_id: requestId,
      artist_id: owner.id,
      name: "Deposit",
      quantity: 1,
      unit_amount_minor: 5000,
      line_total_minor: 5000,
      currency: "eur",
      classification: "tattoo_service",
    });
    expect(line.error, line.error?.message).toBeNull();

    // POSITIVE CONTROL first: the row exists and the OWNER's client sees it,
    // so the anon emptiness below is about the ROLE, not a missing row.
    const ownerRead = await owner.client
      .from("payment_requests")
      .select("id")
      .eq("id", requestId);
    expect(ownerRead.error, ownerRead.error?.message).toBeNull();
    expect(ownerRead.data).toHaveLength(1);

    const anon = anonClient();
    const reqRead = await anon
      .from("payment_requests")
      .select("id, total_minor")
      .eq("id", requestId);
    expect(reqRead.error, reqRead.error?.message).toBeNull();
    expect(
      reqRead.data,
      "anon must not see any payment request (0133 dropped the 0128 policy)",
    ).toHaveLength(0);

    const lineRead = await anon
      .from("payment_request_lines")
      .select("id")
      .eq("request_id", requestId);
    expect(lineRead.error, lineRead.error?.message).toBeNull();
    expect(
      lineRead.data,
      "anon must not see any payment request lines",
    ).toHaveLength(0);

    // Cleanup so the frozen-request tests elsewhere never meet this fixture.
    await admin.from("payment_requests").delete().eq("id", requestId);
  });
});
