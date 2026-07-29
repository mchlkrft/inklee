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
 * WHAT A REQUEST COLLECTS, AND WHAT HAPPENS TO IT AFTERWARDS
 * (Plus build P9, slice A2, migration 0126).
 *
 * Three things land here that no other suite can see.
 *
 * 1. `payment_requests.collects` AND ITS PLACE IN THE FROZEN SET. 0126 added
 *    the column, two check constraints, and a REPLACEMENT body for
 *    `enforce_payment_request_immutability()` that adds `collects` to the money
 *    columns a sent request may not change. A1's suite predates all of it and
 *    is green without it. The column is not decoration: it selects both the
 *    entitlement the send was gated on and the allocation component A4 will
 *    settle under, so a sent request whose `collects` can still be edited is a
 *    request that can be re-gated and re-allocated after the client agreed to
 *    it.
 *
 *    0126's own header names the hazard that makes this worth a test rather
 *    than a comment: 0125 still contains the OLD body, so re-running 0125 alone
 *    silently drops `collects` back out of the frozen set while every
 *    constraint, policy and index still looks correct. That is the AGENTS.md
 *    rule ("a migration that re-runs without erroring has not necessarily
 *    converged") applied to a function, and the only way to catch it is to
 *    verify the deployed object.
 *
 * 2. THE SILENT HALF OF THE CANCEL FLOOR. A1 proves an artist cannot WRITE a
 *    money status: that refusal lives in WITH CHECK and is loud (42501). The
 *    other half is invisible to it: an artist TARGETING a row that is already
 *    collecting is refused by the USING clause, which returns zero rows and no
 *    error. A core that reads "no error" as "it worked" reports a cancelled
 *    payment request to an artist whose client is being charged right now.
 *
 * 3. SPEC SECTION 12's "payment after replacement" and "payment after
 *    cancellation". Both describe money arriving for a request that is no
 *    longer live, and both are about what must STILL be possible: the money is
 *    real and A4 has to be able to record it. A schema that made a cancelled
 *    request unattachable would lose it.
 *
 * Every write that is not the thing under test is made on the SERVICE ROLE and
 * has its error destructured and asserted. A silently rejected setup write
 * turns a later assertion into a test of nothing, which is how eight tests in
 * the P5d suite came to be unable to fail.
 *
 * ---------------------------------------------------------------------------
 * EXECUTED, RED FIRST, on the local stack. One object at a time, INSERT
 * policies never touched, each mutation run with this file EXCLUDED and then
 * INCLUDED, then reverted with a catalog check:
 *
 *   0125's older immutability body re-deployed (which is exactly what re-running
 *   0125 alone does): pre-existing db suite 125/125 GREEN, this file red on
 *   `the DEPLOYED immutability function knows about collects` (naming the cause
 *   from `prosrc`) and on both `cannot change what a sent request collects`.
 *   That combination is the finding: the frozen set can lose a money column with
 *   every constraint, policy and index still reading correct, and nothing that
 *   existed before this file notices.
 *
 *   `payment_requests_collects_sent_check` dropped: 125/125 GREEN before,
 *   `a request cannot be SENT without saying what it collects` red.
 *   `payment_requests_collects_check` dropped: 125/125 GREEN before,
 *   `only the three modelled purposes are storable` red.
 *
 *   THE UPDATE POLICY'S STATUS FLOOR REMOVED FROM `USING` ONLY (its WITH CHECK,
 *   and the INSERT / SELECT / DELETE policies, left exactly as 0125 wrote them):
 *   125/125 GREEN before. A1's money-floor tests stay green because they
 *   exercise WITH CHECK, which is LOUD. Four tests here go red, all silent-shape:
 *   the three `even when the caller forgets the status filter` cancels and
 *   `a cancelled request cannot be brought back by its artist`.
 *
 *   THAT RUN IS ALSO WHY THOSE THREE TESTS EXIST. The first version of this file
 *   only cancelled WITH the status filter the core sends, and all three stayed
 *   GREEN under that mutation: the client-side `.in(...)` alone matched no rows,
 *   so they were pinning the core and not the database. A test that passes for a
 *   reason other than the one it names is the failure mode this whole file is
 *   about.
 */

const FEE_VERSION = "fees-v1-2026-07-04";
const FAR_FUTURE = new Date(Date.now() + 30 * 864e5).toISOString();
const LONG_PAST = new Date(Date.now() - 30 * 864e5).toISOString();

/** The exact status set `expirePaymentRequestsCore` moves out of. Restated here
 *  on purpose: this file is the gate on the DATABASE behaving as the core
 *  assumes, so importing the constant would make both sides of the comparison
 *  the same object. */
const EXPIRABLE = ["sent", "viewed", "failed"];

let admin: SupabaseClient;
let owner: Actor;
/** Superuser, read-only here: PostgREST cannot show a function's body, and the
 *  deployed body is the object this file has to verify. */
let catalog: PgSession;

async function freshBooking(): Promise<string> {
  const { data, error } = await admin
    .from("booking_requests")
    .insert({ artist_id: owner.id })
    .select("id")
    .single();
  expect(error, `booking setup failed: ${error?.message}`).toBeNull();
  return data!.id as string;
}

async function makeDraft(args: {
  bookingId: string;
  totalMinor: number;
  collects?: string | null;
  status?: "draft" | "ready";
  supersedesId?: string | null;
  revision?: number;
}): Promise<string> {
  const { data, error } = await admin
    .from("payment_requests")
    .insert({
      artist_id: owner.id,
      booking_id: args.bookingId,
      status: args.status ?? "ready",
      currency: "eur",
      collects: args.collects === undefined ? "balance" : args.collects,
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

/** Draft -> lines -> update, never inserted as `sent`: the lines trigger
 *  refuses an insert into an already-frozen parent. */
async function makeSentRequest(args: {
  bookingId: string;
  totalMinor: number;
  collects?: string;
  expiresAt?: string;
}): Promise<string> {
  const id = await makeDraft({
    bookingId: args.bookingId,
    totalMinor: args.totalMinor,
    collects: args.collects ?? "balance",
  });
  const { data, error } = await admin
    .from("payment_requests")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      expires_at: args.expiresAt ?? FAR_FUTURE,
      fee_schedule_version: FEE_VERSION,
    })
    .eq("id", id)
    .select("id, status")
    .single();
  expect(error, `send setup failed: ${error?.message}`).toBeNull();
  expect(data!.status, "the fixture must actually be sent").toBe("sent");
  return id;
}

/** Move a sent request onward as A4's webhook would: the service role, which is
 *  the only role that may write a money status. */
async function settleAs(id: string, status: string): Promise<void> {
  const { data, error } = await admin
    .from("payment_requests")
    .update({ status })
    .eq("id", id)
    .select("id, status")
    .single();
  expect(error, `settlement setup failed: ${error?.message}`).toBeNull();
  expect(data!.status, `the fixture must actually be ${status}`).toBe(status);
}

async function statusOf(id: string): Promise<string> {
  const { data, error } = await admin
    .from("payment_requests")
    .select("status")
    .eq("id", id)
    .single();
  expect(error, `read back failed: ${error?.message}`).toBeNull();
  return data!.status as string;
}

/** The artist's own expire statement, exactly as `expirePaymentRequestsCore`
 *  issues it. `client` decides whether RLS is in the picture: as the artist it
 *  is, as the service role it is not, and the second case is the one that
 *  proves the status filter is doing the work rather than the policy. */
async function runExpiry(
  client: SupabaseClient,
  cutoff: string,
): Promise<string[]> {
  const { data, error } = await client
    .from("payment_requests")
    .update({ status: "expired", updated_at: cutoff })
    .eq("artist_id", owner.id)
    .in("status", EXPIRABLE)
    .not("expires_at", "is", null)
    .lte("expires_at", cutoff)
    .select("id");
  expect(error, `expiry failed: ${error?.message}`).toBeNull();
  return (data ?? []).map((r) => r.id as string);
}

beforeAll(async () => {
  admin = adminClient();
  catalog = PgSession.open("collects-catalog");
  owner = await makeActor(admin, "a2-collects");
}, 60_000);

afterAll(async () => {
  await catalog.close();
  // Allocations first: `payment_allocations_request_fk` is NO ACTION on
  // purpose, so a request cannot be deleted out from under a record that money
  // moved. Requests before lines, because the lines trigger refuses a direct
  // delete of a frozen request's lines and tolerates the parent's cascade.
  await admin.from("payment_allocations").delete().eq("artist_id", owner.id);
  await admin.from("payment_requests").delete().eq("artist_id", owner.id);
  await admin.from("booking_requests").delete().eq("artist_id", owner.id);
  await destroyActor(admin, owner);
}, 60_000);

// ===========================================================================

describe("`collects` is part of what a sent request freezes", () => {
  it("the DEPLOYED immutability function knows about `collects`", async () => {
    // Verify the object, not the file (AGENTS.md). 0125 and 0126 both define
    // `enforce_payment_request_immutability`, and only 0126's body freezes
    // `collects`. Re-running 0125 alone reverts it silently.
    //
    // The behavioural tests below would also go red on that, and this one is
    // kept anyway because it names the CAUSE. A red here says "the wrong body
    // is deployed"; a red there says "a sent request accepted an edit", and
    // whoever reads it next has to work out why.
    const rows = await catalog.query<{ freezes_collects: boolean }>(
      `select prosrc like '%collects%' as freezes_collects
         from pg_proc where proname = 'enforce_payment_request_immutability'`,
    );
    expect(rows, "the freeze trigger's function must exist").toHaveLength(1);
    expect(
      rows[0].freezes_collects,
      "0125's older body is deployed: `collects` is NOT in the frozen set",
    ).toBe(true);

    // The two constraints 0126 adds, read the same way and for the same reason.
    const constraints = await catalog.query<{ conname: string }>(
      `select conname from pg_constraint
        where conrelid = 'payment_requests'::regclass
          and conname like '%collects%'
        order by conname`,
    );
    expect(constraints.map((r) => r.conname)).toEqual([
      "payment_requests_collects_check",
      "payment_requests_collects_sent_check",
    ]);
  });

  it("an ARTIST cannot change what a sent request collects", async () => {
    const bookingId = await freshBooking();
    const id = await makeSentRequest({ bookingId, totalMinor: 20_000 });

    const { error } = await owner.client
      .from("payment_requests")
      .update({ collects: "full_price" })
      .eq("id", id)
      .eq("artist_id", owner.id)
      .select("id");

    // LOUD, because a trigger raises rather than a policy filtering: the row is
    // targetable (`sent` is in the UPDATE policy's USING list) and the refusal
    // comes from the freeze.
    expect(
      error?.code,
      "expected the freeze trigger to raise, not a silent no-op",
    ).toBe("23514");
    expect(String(error?.message)).toContain("payment_request_frozen");
    expect(await statusOf(id)).toBe("sent");
    const { data: after } = await admin
      .from("payment_requests")
      .select("collects")
      .eq("id", id)
      .single();
    expect(after?.collects, "the purpose must be untouched").toBe("balance");
  });

  it("the SERVICE ROLE cannot change what a sent request collects either", async () => {
    // The freeze is a property of the row, not a permission. A4's webhook runs
    // on the service role, and `collects` selects the allocation component it
    // settles under, so the role that records money is exactly the role that
    // must not be able to move the lane afterwards.
    const bookingId = await freshBooking();
    const id = await makeSentRequest({ bookingId, totalMinor: 20_000 });

    const { error } = await admin
      .from("payment_requests")
      .update({ collects: "deposit" })
      .eq("id", id)
      .select("id");
    expect(error?.code).toBe("23514");
    expect(String(error?.message)).toContain("payment_request_frozen");
  });

  it("a DRAFT can still change what it collects", async () => {
    // POSITIVE CONTROL. Without it, a column that were simply un-writable by
    // anyone would satisfy both tests above, and composing a request would be
    // impossible.
    const bookingId = await freshBooking();
    const id = await makeDraft({ bookingId, totalMinor: 20_000 });
    const { data, error } = await owner.client
      .from("payment_requests")
      .update({ collects: "deposit" })
      .eq("id", id)
      .eq("artist_id", owner.id)
      .select("id, collects");
    expect(error, error?.message).toBeNull();
    expect(data?.[0]?.collects).toBe("deposit");
  });

  it("a request cannot be SENT without saying what it collects", async () => {
    // `payment_requests_collects_sent_check`. Nullable on a draft, required at
    // the freeze, the same shape `fee_schedule_version` already uses: there is
    // no honest default, and guessing `deposit` for a row that was collecting a
    // full price would mis-gate it and mis-allocate it.
    const bookingId = await freshBooking();
    const id = await makeDraft({
      bookingId,
      totalMinor: 20_000,
      collects: null,
    });
    const { error } = await admin
      .from("payment_requests")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        expires_at: FAR_FUTURE,
        fee_schedule_version: FEE_VERSION,
      })
      .eq("id", id)
      .select("id");
    expect(error?.code, "expected a check violation").toBe("23514");
    expect(String(error?.message)).toContain(
      "payment_requests_collects_sent_check",
    );
    expect(await statusOf(id)).toBe("ready");
  });

  it("only the three modelled purposes are storable", async () => {
    const bookingId = await freshBooking();
    const { error } = await admin.from("payment_requests").insert({
      artist_id: owner.id,
      booking_id: bookingId,
      status: "draft",
      currency: "eur",
      collects: "tip",
      total_minor: 100,
    });
    expect(error?.code, "expected the collects check to refuse this").toBe(
      "23514",
    );
    expect(String(error?.message)).toContain("payment_requests_collects_check");

    // And the three that ARE modelled all fit, so the refusal above is about
    // the value rather than about the column being unusable.
    for (const collects of ["deposit", "balance", "full_price"]) {
      const ok = await admin
        .from("payment_requests")
        .insert({
          artist_id: owner.id,
          booking_id: await freshBooking(),
          status: "draft",
          currency: "eur",
          collects,
          total_minor: 100,
        })
        .select("id")
        .single();
      expect(
        ok.error,
        `${collects} was refused: ${ok.error?.message}`,
      ).toBeNull();
    }
  });
});

// ===========================================================================

describe("cancelling is refused once money is moving, and refused SILENTLY", () => {
  it.each(["payment_processing", "partially_paid", "paid"])(
    "an artist cancelling a %s request affects nothing and is told nothing",
    async (status) => {
      const bookingId = await freshBooking();
      const id = await makeSentRequest({ bookingId, totalMinor: 20_000 });
      if (status === "paid") {
        await settleAs(id, "payment_processing");
      }
      await settleAs(id, status);

      const { data, error } = await owner.client
        .from("payment_requests")
        .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
        .eq("id", id)
        .eq("artist_id", owner.id)
        .in("status", ["draft", "ready", "sent", "viewed", "expired", "failed"])
        .select("id");

      // THE SHAPE A CORE MISTAKES FOR SUCCESS. The USING clause excludes the
      // row, so PostgREST answers {data: [], error: null}: no exception, no
      // rows, nothing to notice unless the count is checked.
      expect(
        error,
        `expected a SILENT refusal, got ${error?.code}: ${error?.message}`,
      ).toBeNull();
      expect(data ?? [], "no row may have been cancelled").toHaveLength(0);
      expect(
        await statusOf(id),
        "the collecting request must be untouched",
      ).toBe(status);
    },
  );

  it.each(["payment_processing", "partially_paid", "paid"])(
    "the DATABASE refuses a %s cancel even when the caller forgets the status filter",
    async (status) => {
      // The three tests above send the status floor with the statement, which is
      // what `cancelPaymentRequestCore` does. MEASURED, and it changed this
      // file: with the UPDATE policy's USING floor removed, those three stay
      // GREEN, because the `.in(...)` filter alone is enough to match no rows.
      // They pin the core, not the database.
      //
      // This is the one that pins the DATABASE. Same write, no client-side
      // status filter, which is the shape of any future caller that forgets it
      // (or of a hand-rolled request from a mobile route). The floor has to hold
      // underneath the core, or it is not a floor.
      const bookingId = await freshBooking();
      const id = await makeSentRequest({ bookingId, totalMinor: 20_000 });
      if (status === "paid") await settleAs(id, "payment_processing");
      await settleAs(id, status);

      const { data, error } = await owner.client
        .from("payment_requests")
        .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
        .eq("id", id)
        .eq("artist_id", owner.id)
        .select("id");

      expect(
        error,
        `expected a SILENT refusal from the policy, got ${error?.code}: ${error?.message}`,
      ).toBeNull();
      expect(
        data ?? [],
        "the UPDATE policy must not let an artist cancel a request that is collecting",
      ).toHaveLength(0);
      expect(await statusOf(id)).toBe(status);
    },
  );

  it("CONTROL: the same statement DOES cancel a sent request", async () => {
    // Without this, an UPDATE that were broken for every row would satisfy all
    // three tests above.
    const bookingId = await freshBooking();
    const id = await makeSentRequest({ bookingId, totalMinor: 20_000 });
    const { data, error } = await owner.client
      .from("payment_requests")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("id", id)
      .eq("artist_id", owner.id)
      .in("status", ["draft", "ready", "sent", "viewed", "expired", "failed"])
      .select("id");
    expect(error, error?.message).toBeNull();
    expect(data ?? []).toHaveLength(1);
    expect(await statusOf(id)).toBe("cancelled");
  });

  it("a cancelled request cannot be brought back by its artist", async () => {
    // `cancelled` is terminal in the model and absent from the UPDATE policy's
    // USING list, so the artist cannot target it at all. Silent again: the row
    // is simply not there as far as the statement is concerned.
    const bookingId = await freshBooking();
    const id = await makeSentRequest({ bookingId, totalMinor: 20_000 });
    await settleAs(id, "cancelled");

    const { data, error } = await owner.client
      .from("payment_requests")
      .update({ status: "sent" })
      .eq("id", id)
      .eq("artist_id", owner.id)
      .select("id");
    expect(error).toBeNull();
    expect(data ?? [], "a cancelled request must stay cancelled").toHaveLength(
      0,
    );
    expect(await statusOf(id)).toBe("cancelled");
  });
});

// ===========================================================================

describe("expiry never resurrects and never overwrites an outcome", () => {
  it("expires an overdue link, then does nothing on a second run", async () => {
    const bookingId = await freshBooking();
    const id = await makeSentRequest({
      bookingId,
      totalMinor: 20_000,
      expiresAt: LONG_PAST,
    });

    const cutoff = new Date().toISOString();
    const first = await runExpiry(owner.client, cutoff);
    expect(first, "the overdue link must expire").toEqual([id]);
    expect(await statusOf(id)).toBe("expired");

    // IDEMPOTENT because `expired` is not in the set expiry moves out of, not
    // because anything remembers having run.
    const second = await runExpiry(owner.client, new Date().toISOString());
    expect(second, "a second sweep must match nothing").toEqual([]);
    expect(await statusOf(id)).toBe("expired");
  });

  it("leaves a live link alone until it is actually overdue", async () => {
    const bookingId = await freshBooking();
    const id = await makeSentRequest({ bookingId, totalMinor: 20_000 });
    expect(await runExpiry(owner.client, new Date().toISOString())).toEqual([]);
    expect(await statusOf(id)).toBe("sent");
  });

  it.each(["paid", "cancelled"])(
    "cannot touch an overdue %s request, even on the SERVICE ROLE",
    async (status) => {
      // The service-role variant is the one that matters. As the artist, the
      // UPDATE policy would refuse a paid row anyway, so a green there could be
      // RLS doing the work; a sweep runs without RLS, and then the status
      // filter is the only thing standing between an expiry job and overwriting
      // a settled outcome.
      const bookingId = await freshBooking();
      const id = await makeSentRequest({
        bookingId,
        totalMinor: 20_000,
        expiresAt: LONG_PAST,
      });
      if (status === "paid") await settleAs(id, "payment_processing");
      await settleAs(id, status);

      const swept = await runExpiry(admin, new Date().toISOString());
      expect(
        swept,
        `an overdue ${status} request must not be swept`,
      ).not.toContain(id);
      expect(await statusOf(id)).toBe(status);
    },
  );

  it("CONTROL: the service-role sweep DOES expire an overdue sent request", async () => {
    const bookingId = await freshBooking();
    const id = await makeSentRequest({
      bookingId,
      totalMinor: 20_000,
      expiresAt: LONG_PAST,
    });
    const swept = await runExpiry(admin, new Date().toISOString());
    expect(swept).toContain(id);
    expect(await statusOf(id)).toBe("expired");
  });
});

// ===========================================================================

describe("spec section 12: payment after replacement, payment after cancellation", () => {
  /** One collection, recorded the way A4's webhook will: service role, integer
   *  minor units, one component rather than an unclassified total. */
  async function recordPayment(args: {
    bookingId: string;
    requestId: string;
    amountMinor: number;
    intentId: string;
  }) {
    return admin
      .from("payment_allocations")
      .insert({
        artist_id: owner.id,
        booking_id: args.bookingId,
        request_id: args.requestId,
        payment_intent_id: args.intentId,
        component: "tattoo_service_balance",
        amount_minor: args.amountMinor,
        collected_total_minor: args.amountMinor,
        currency: "eur",
        status: "succeeded",
        settled_at: new Date().toISOString(),
      })
      .select("id")
      .single();
  }

  it("money arriving for a REPLACED request is still recordable", async () => {
    // The client paid the old link a moment before the artist's revision went
    // out. `send_payment_request` cancelled the predecessor as part of sending
    // the replacement, and the payment is real: A4 must be able to attach it.
    const bookingId = await freshBooking();
    const predecessor = await makeSentRequest({
      bookingId,
      totalMinor: 20_000,
    });
    const successor = await makeDraft({
      bookingId,
      totalMinor: 25_000,
      revision: 2,
      supersedesId: predecessor,
    });

    const { data: verdict, error: rpcError } = await owner.client.rpc(
      "send_payment_request",
      {
        p_request_id: successor,
        p_artist_id: owner.id,
        p_expires_at: FAR_FUTURE,
        p_fee_schedule_version: FEE_VERSION,
      },
    );
    expect(rpcError, rpcError?.message).toBeNull();
    expect(verdict).toBe("sent");
    expect(await statusOf(predecessor)).toBe("cancelled");

    const payment = await recordPayment({
      bookingId,
      requestId: predecessor,
      amountMinor: 20_000,
      intentId: `pi_replaced_${Date.now()}`,
    });
    expect(
      payment.error,
      `a real payment for a replaced request must still be recordable: ${payment.error?.message}`,
    ).toBeNull();

    // And the replaced request stays replaced. The client's old link is not
    // payable again just because money arrived against it.
    expect(await statusOf(predecessor)).toBe("cancelled");
    expect(await statusOf(successor)).toBe("sent");
  });

  it("money arriving for a CANCELLED request is still recordable", async () => {
    const bookingId = await freshBooking();
    const id = await makeSentRequest({ bookingId, totalMinor: 20_000 });
    const cancel = await owner.client
      .from("payment_requests")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("id", id)
      .eq("artist_id", owner.id)
      .select("id");
    expect(cancel.error, cancel.error?.message).toBeNull();
    expect(cancel.data ?? []).toHaveLength(1);

    const payment = await recordPayment({
      bookingId,
      requestId: id,
      amountMinor: 20_000,
      intentId: `pi_cancelled_${Date.now()}`,
    });
    expect(
      payment.error,
      `a payment that landed after a withdrawal must not be lost: ${payment.error?.message}`,
    ).toBeNull();
  });

  it("the artist still cannot declare that the money arrived", async () => {
    // The other side of the two tests above, and the reason they are safe: the
    // ability to attach a payment to a dead request belongs to A4 on the
    // service role. An artist writing `paid` is refused loudly by WITH CHECK,
    // and an artist cannot write an allocation at all.
    const bookingId = await freshBooking();
    const id = await makeSentRequest({ bookingId, totalMinor: 20_000 });

    const flip = await owner.client
      .from("payment_requests")
      .update({ status: "paid" })
      .eq("id", id)
      .eq("artist_id", owner.id)
      .select("id");
    expect(flip.error?.code, "expected a loud WITH CHECK rejection").toBe(
      "42501",
    );

    const forge = await owner.client.from("payment_allocations").insert({
      artist_id: owner.id,
      booking_id: bookingId,
      request_id: id,
      payment_intent_id: `pi_forged_${Date.now()}`,
      component: "tattoo_service_balance",
      amount_minor: 20_000,
      collected_total_minor: 20_000,
      currency: "eur",
      status: "succeeded",
    });
    expect(
      forge.error,
      "an artist must not be able to write an allocation",
    ).not.toBeNull();
    expect(await statusOf(id)).toBe("sent");
  });
});
