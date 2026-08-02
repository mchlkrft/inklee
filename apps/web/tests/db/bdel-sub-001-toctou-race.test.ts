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
 * BDEL-SUB-001, VERIFIER TARGET (1): the TOCTOU window the fix's own author
 * named and declined to certify.
 *
 * THE CLAIM UNDER TEST, quoted from the implementer of c39b6a0e:
 *
 *   "profileExists() is a read, then later guardedUpsert writes - not one
 *    atomic statement. If the artist deletes their account in the gap between
 *    those two calls, the write still hits the same 23503 as before my fix,
 *    the error still throws, and the webhook still returns 500. My claim is
 *    that this is self-healing, not a regression: Stripe redelivers, and on
 *    redelivery profileExists correctly observes the now-gone profile and
 *    takes the safe branch - so the failure mode degrades from 'permanently
 *    stuck / wrong data' to 'one extra retry'. I have NOT proven this with two
 *    real concurrent connections."
 *
 * WHY A SEQUENTIAL PROBE CANNOT SETTLE IT. Every existing artifact for this
 * finding (`billing-reconcile-deleted-profile.test.ts`, the unit suite) deletes
 * the profile and COMMITS before calling reconcile. In that ordering
 * profileExists always observes the absence and the safe branch always runs, so
 * the gap between the check and the write is never open. The property here is
 * an ordering between two connections; it is unreachable from one.
 *
 * WHAT IS REAL HERE: the database, the FK shapes (billing_subscriptions SET
 * NULL, account_overrides CASCADE), the service-role client reconcile is
 * handed in production, and reconcile itself. Gallery relocation is doubled
 * (it runs AFTER both writes and cannot affect the write ordering) so no test
 * reaches object storage. No Stripe key is reachable: every fake subscription
 * carries metadata.artist_id, so resolveArtistId returns without a Stripe call.
 *
 * THE FOUR INTERLEAVINGS, and what each is for:
 *
 *   I   delete commits BEFORE reconcile        -> safe branch (the sequential
 *                                                 control; already covered)
 *   II  delete in flight BEFORE write 1        -> write 1 23503s, NOTHING lands
 *   III delete starts AFTER write 1 committed  -> write 1 LANDS, write 2 23503s
 *   IV  delete starts AFTER write 2 committed  -> both land, no throw
 *
 * II is the interleaving the author's claim describes. III is the one it does
 * not, and it is the reason this file exists.
 */

const MARGIN_MS = 1200; // the holder's write lands -> reconcile is called
const HOLD_MS = 2500; // reconcile is called -> the holder commits
// The PostgREST login role carries lock_timeout=8s, so a hold must stay well
// under it or the blocked statement aborts with 55P03 and the run proves
// nothing about the FK.

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));
vi.mock("@/lib/server/gallery-relocation", () => ({
  galleryCurrentlyEntitled: () => true,
  relocateArtistGallery: vi.fn(),
  restoreArtistGallery: vi.fn(),
}));

import * as Sentry from "@sentry/nextjs";
import { reconcileFromStripeSubscription } from "@/lib/server/billing/reconcile";

let admin: SupabaseClient;
let writer: PgSession;
let observer: PgSession;

const actors: Actor[] = [];
/** billing_subscriptions survives the profile delete (SET NULL), so every id
 *  this file creates has to be tracked and removed by hand. */
const subIds: string[] = [];

async function freshActor(label: string): Promise<Actor> {
  const actor = await makeActor(admin, label);
  actors.push(actor);
  return actor;
}

function makeSub(o: {
  subId: string;
  status: string;
  customer: string;
  artistId: string;
}): Stripe.Subscription {
  const periodEnd = Math.floor(Date.now() / 1000) + 3600;
  return {
    id: o.subId,
    status: o.status,
    livemode: false,
    customer: o.customer,
    cancel_at_period_end: false,
    current_period_end: periodEnd,
    metadata: { artist_id: o.artistId, contract_customer_type: "business" },
    items: {
      data: [{ price: { id: "price_plus" }, current_period_end: periodEnd }],
    },
  } as unknown as Stripe.Subscription;
}

/** Reads through the superuser session, so RLS and PostgREST caching cannot
 *  hide what actually landed. */
async function subRow(subId: string): Promise<{
  artist_id: string | null;
  status: string;
  last_event_created: string | null;
} | null> {
  const rows = await observer.query<{
    artist_id: string | null;
    status: string;
    last_event_created: string | null;
  }>(
    `select artist_id, status, last_event_created::text as last_event_created
       from billing_subscriptions where stripe_subscription_id = $1`,
    [subId],
  );
  return rows[0] ?? null;
}

async function overrideRow(
  artistId: string,
): Promise<{ plan_tier: string; subscription_status: string | null } | null> {
  const rows = await observer.query<{
    plan_tier: string;
    subscription_status: string | null;
  }>(
    `select plan_tier, subscription_status from account_overrides where artist_id = $1`,
    [artistId],
  );
  return rows[0] ?? null;
}

async function profileCount(artistId: string): Promise<number> {
  const rows = await observer.query<{ n: string }>(
    "select count(*)::text as n from profiles where id = $1",
    [artistId],
  );
  return Number(rows[0].n);
}

/** Evidence goes to stdout, not only into a failure message: a green run of a
 *  concurrency test has to be able to show WHAT it observed. */
function report(label: string, trace: string): void {
  console.log(`[bdel-sub-001] ${label}: ${trace}`);
}

function deletedProfileAlerts(): unknown[][] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const calls = (Sentry.captureMessage as any).mock.calls as unknown[][];
  return calls.filter(
    (c) =>
      (c[1] as { tags?: { action?: string } })?.tags?.action ===
      "billing_reconcile_deleted_profile",
  );
}

beforeAll(async () => {
  admin = adminClient();
  writer = PgSession.open("bdtoc-writer");
  observer = PgSession.open("bdtoc-observer");

  // Two backends, asserted rather than assumed: a pooled client silently
  // sharing one would turn "hold a transaction open" into two autocommitted
  // statements and every race below would pass while racing nothing.
  const wp = await writer.backendPid();
  const op = await observer.backendPid();
  expect(wp).not.toBe(op);

  // The whole analysis below depends on these two FK actions. If either moves,
  // the interleavings change shape and the comments in reconcile.ts are wrong.
  const fks = await observer.query<{ conrel: string; confdeltype: string }>(
    `select conrelid::regclass::text as conrel, confdeltype
       from pg_constraint
      where confrelid = 'profiles'::regclass
        and conrelid::regclass::text in ('billing_subscriptions','account_overrides')
      order by conrel`,
  );
  expect(
    fks.map((f) => `${f.conrel}:${f.confdeltype}`),
    "FK shapes moved; re-derive the interleavings before trusting this file",
  ).toEqual(["account_overrides:c", "billing_subscriptions:n"]);
}, 60_000);

afterAll(async () => {
  await writer.close();
  await observer.close();
  for (const s of subIds) {
    await admin
      .from("billing_subscriptions")
      .delete()
      .eq("stripe_subscription_id", s);
  }
  for (const a of actors) {
    await admin.from("account_overrides").delete().eq("artist_id", a.id);
    await destroyActor(admin, a);
  }
}, 60_000);

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(async () => {
  // A transaction left open by a test that threw mid-hold would make every
  // statement in the NEXT test block on its locks, and the failure would look
  // like a race rather than like leaked state.
  await writer.rollbackIfOpen();
});

// ===========================================================================
// Mechanism probe. Everything about interleaving III rests on ONE Postgres
// behaviour, so it is measured rather than asserted from the manual.
// ===========================================================================

describe("the mechanism interleaving III depends on", () => {
  it("an UPDATE that leaves artist_id UNCHANGED skips the FK check; NULL -> id does not", async () => {
    // RI_FKey_fk_upd_check_required short-circuits when the FK columns are
    // unchanged, so a reconcile UPDATE on an already-attributed row never
    // touches profiles and therefore cannot 23503 and cannot block on a
    // concurrent deleter. That is precisely what lets write 1 land while the
    // account is being deleted, which is what makes a PARTIAL possible.
    const actor = await freshActor("bdtoc-probe");
    const subId = `sub_bdtoc_probe_${actor.id.slice(0, 8)}`;
    subIds.push(subId);
    const seed = await admin
      .from("billing_subscriptions")
      .insert({
        artist_id: actor.id,
        stripe_customer_id: `cus_${subId}`,
        stripe_subscription_id: subId,
        stripe_price_id: "price_plus",
        status: "active",
        contract_customer_type: "business",
        mode: "test",
      })
      .select("id")
      .single();
    expect(seed.error, seed.error?.message).toBeNull();

    // Lock the profile row against any FK check that wants FOR KEY SHARE.
    await writer.begin();
    await writer.query("select 1 from profiles where id = $1 for update", [
      actor.id,
    ]);

    const unchangedStart = Date.now();
    const unchanged = await admin
      .from("billing_subscriptions")
      .update({ artist_id: actor.id, status: "past_due" })
      .eq("stripe_subscription_id", subId)
      .select("id");
    const unchangedMs = Date.now() - unchangedStart;
    expect(unchanged.error, unchanged.error?.message).toBeNull();
    expect(unchanged.data).toHaveLength(1);
    expect(
      unchangedMs,
      `an unchanged-key UPDATE must not have waited on the profile lock (${unchangedMs}ms)`,
    ).toBeLessThan(1000);

    // The contrast: same statement, but the stored value differs, so the check
    // is required and the statement parks on the lock until lock_timeout.
    await admin
      .from("billing_subscriptions")
      .update({ artist_id: null })
      .eq("stripe_subscription_id", subId);
    const changedStart = Date.now();
    const changed = await admin
      .from("billing_subscriptions")
      .update({ artist_id: actor.id })
      .eq("stripe_subscription_id", subId)
      .select("id");
    const changedMs = Date.now() - changedStart;
    // 55P03 lock_timeout or 57014 statement_timeout: the login role carries
    // both at 8s, so which one wins the tie is not the property under test.
    // The property is that it waited at all.
    expect(
      changed.error?.code,
      `a changed-key UPDATE must have blocked on the FK (${changedMs}ms, err=${changed.error?.code})`,
    ).toBeOneOf(["55P03", "57014"]);
    expect(
      changedMs,
      `and must have waited seconds, not returned (${changedMs}ms)`,
    ).toBeGreaterThan(3000);

    await writer.rollbackIfOpen();
  }, 30_000);
});

// ===========================================================================

describe("BDEL-SUB-001 TOCTOU: two connections, overlapping in time", () => {
  it("CONTROL (harness): a live profile reconciles, writing BOTH tables", async () => {
    // Proves the harness can produce a SUCCESS at all. Without it, a throw in
    // any contended test below could be an artefact of the fixtures rather
    // than a property of the code.
    const actor = await freshActor("bdtoc-control");
    const subId = `sub_bdtoc_ctl_${actor.id.slice(0, 8)}`;
    subIds.push(subId);

    const r = await reconcileFromStripeSubscription(
      makeSub({
        subId,
        status: "active",
        customer: `cus_${subId}`,
        artistId: actor.id,
      }),
      Math.floor(Date.now() / 1000),
    );
    expect(r.deletedProfile).toBe(false);
    expect(r.orphaned).toBe(false);
    expect(r.planTier).toBe("plus");
    expect((await subRow(subId))?.artist_id).toBe(actor.id);
    expect((await overrideRow(actor.id))?.plan_tier).toBe("plus");
  }, 30_000);

  it("II: the delete is IN FLIGHT before write 1 -> 23503, and NOTHING lands", async () => {
    // The interleaving the author's claim describes, with the REAL
    // single-statement `delete from profiles` held uncommitted.
    const actor = await freshActor("bdtoc-ii");
    const subId = `sub_bdtoc_ii_${actor.id.slice(0, 8)}`;
    subIds.push(subId);

    const writerPid = await writer.backendPid();
    await writer.begin();
    await writer.query("delete from profiles where id = $1", [actor.id]);

    // Still committed-visible to everyone else, which is the entire premise:
    // profileExists is about to read TRUE for a profile that is already gone
    // in another session's uncommitted work.
    expect(
      await profileCount(actor.id),
      "the delete must still be UNCOMMITTED when reconcile is called",
    ).toBe(1);
    await sleep(MARGIN_MS);

    const startedAt = Date.now();
    const pending = reconcileFromStripeSubscription(
      makeSub({
        subId,
        status: "active",
        customer: `cus_${subId}`,
        artistId: actor.id,
      }),
      Math.floor(Date.now() / 1000),
    ).then(
      (v) => ({ ok: true as const, v }),
      (e: Error) => ({ ok: false as const, e }),
    );

    await sleep(Math.floor(HOLD_MS / 2));
    // THE BEHAVIOURAL PROOF OF CONTENTION. Timing alone cannot distinguish
    // "the insert parked on the deleter's row lock" from "the call was slow".
    const blocked = await observer.countBlockedBy(writerPid);
    await sleep(HOLD_MS - Math.floor(HOLD_MS / 2));
    await writer.commit();

    const outcome = await pending;
    const elapsed = Date.now() - startedAt;
    const trace =
      `blocked=${blocked} elapsed=${elapsed}ms ` +
      `outcome=${outcome.ok ? "resolved" : `threw(${outcome.e.message.slice(0, 120)})`}`;
    report("II", trace);

    expect(
      blocked,
      `no backend waited on the deleter, so the two sessions never contended (${trace})`,
    ).toBeGreaterThanOrEqual(1);
    expect(
      elapsed,
      `reconcile returned without waiting for the delete (${trace})`,
    ).toBeGreaterThanOrEqual(HOLD_MS);

    expect(
      outcome.ok,
      `expected the documented 23503, got a resolved result (${trace})`,
    ).toBe(false);
    if (!outcome.ok) {
      expect(outcome.e.message, trace).toMatch(/billing_subscriptions/);
      expect(outcome.e.message, trace).toMatch(/23503|foreign key/i);
    }

    // The author's claim, measured: nothing landed.
    expect(
      await subRow(subId),
      `nothing may have landed (${trace})`,
    ).toBeNull();
    expect(await overrideRow(actor.id), trace).toBeNull();
    expect(await profileCount(actor.id)).toBe(0);

    // ...and the redelivery heals it.
    vi.clearAllMocks();
    const retry = await reconcileFromStripeSubscription(
      makeSub({
        subId,
        status: "active",
        customer: `cus_${subId}`,
        artistId: actor.id,
      }),
      Math.floor(Date.now() / 1000),
    );
    expect(retry.deletedProfile, `the retry must take the safe branch`).toBe(
      true,
    );
    expect(await subRow(subId)).toBeNull();
    expect(await overrideRow(actor.id)).toBeNull();
    expect(
      deletedProfileAlerts(),
      "a LIVE status against a deleted profile must page a human on the retry",
    ).toHaveLength(1);
  }, 30_000);

  it("II-b: same, for an ALREADY-RECONCILED subscriber -> write 1 still 23503s, nothing changes", async () => {
    // The steady state of every paying artist, under the same in-flight
    // delete. Write 1 is an UPDATE whose FK key is unchanged, so the probe
    // above says it should skip the FK check -- but the cascade's SET NULL has
    // already claimed that row, so the UPDATE parks on it, and when it wakes
    // Postgres re-evaluates against the UPDATED row version (EvalPlanQual),
    // where artist_id is now NULL. NULL -> id IS a change, so the check is
    // required after all and 23503s. Worth executing rather than reasoning:
    // "the FK check is skipped" and "the row was concurrently nulled" point in
    // opposite directions, and only one of them wins.
    const actor = await freshActor("bdtoc-iib");
    const subId = `sub_bdtoc_iib_${actor.id.slice(0, 8)}`;
    subIds.push(subId);

    const seed = await admin.from("billing_subscriptions").insert({
      artist_id: actor.id,
      stripe_customer_id: `cus_${subId}`,
      stripe_subscription_id: subId,
      stripe_price_id: "price_plus",
      status: "trialing",
      contract_customer_type: "business",
      mode: "test",
    });
    expect(seed.error, seed.error?.message).toBeNull();
    const seedOv = await admin.from("account_overrides").insert({
      artist_id: actor.id,
      plan_tier: "plus",
      plan_source: "paid",
      subscription_status: "trialing",
    });
    expect(seedOv.error, seedOv.error?.message).toBeNull();

    const writerPid = await writer.backendPid();
    await writer.begin();
    await writer.query("delete from profiles where id = $1", [actor.id]);
    await sleep(MARGIN_MS);

    const startedAt = Date.now();
    const pending = reconcileFromStripeSubscription(
      makeSub({
        subId,
        status: "active",
        customer: `cus_${subId}`,
        artistId: actor.id,
      }),
      Math.floor(Date.now() / 1000),
    ).then(
      (v) => ({ ok: true as const, v }),
      (e: Error) => ({ ok: false as const, e }),
    );

    await sleep(Math.floor(HOLD_MS / 2));
    const blocked = await observer.countBlockedBy(writerPid);
    await sleep(HOLD_MS - Math.floor(HOLD_MS / 2));
    await writer.commit();

    const outcome = await pending;
    const after = await subRow(subId);
    const trace =
      `blocked=${blocked} elapsed=${Date.now() - startedAt}ms ` +
      `outcome=${outcome.ok ? "resolved" : `threw(${outcome.e.message.slice(0, 90)})`} ` +
      `subStatus=${after?.status}`;
    report("II-b", trace);

    expect(blocked, trace).toBeGreaterThanOrEqual(1);
    expect(outcome.ok, `expected a 23503 on write 1 (${trace})`).toBe(false);
    if (!outcome.ok) {
      expect(outcome.e.message, trace).toMatch(/billing_subscriptions/);
    }
    // The retained record is UNTOUCHED: still the pre-deletion status, not the
    // racing event's. This is the property `billing-reconcile-deleted-profile.
    // test.ts` asserts for the sequential case, holding under contention too.
    expect(
      after?.status,
      `the retained record must not carry the racing event (${trace})`,
    ).toBe("trialing");
    expect(after?.artist_id).toBeNull();
    expect(await overrideRow(actor.id)).toBeNull();
  }, 30_000);

  it("III: the delete starts AFTER write 1 committed -> write 1 LANDS and write 2 23503s", async () => {
    // The interleaving the claim does not cover.
    //
    // CONSTRUCTION. In production the profile delete is ONE statement whose
    // cascade locks the account_overrides row and the profiles row together.
    // Reproducing that here would need the delete to start inside the ~10ms
    // gap between write 1 committing and write 2 issuing, which is a timing
    // margin, not evidence. So the writer takes the SAME TWO LOCKS the cascade
    // takes, in one transaction, and takes the account_overrides one first.
    // Write 1 never touches either (unchanged FK key, proven by the probe
    // above) and write 2 parks on the account_overrides row exactly as it
    // would against the real cascade. The lock state write 2 observes is
    // identical; only the instant the profiles row is locked differs, and no
    // statement in this window reads it.
    const actor = await freshActor("bdtoc-iii");
    const subId = `sub_bdtoc_iii_${actor.id.slice(0, 8)}`;
    subIds.push(subId);

    // An already-reconciled Plus subscriber: both rows present, attributed.
    // This is the steady state of every paying artist, not a contrived one.
    const seed = await admin.from("billing_subscriptions").insert({
      artist_id: actor.id,
      stripe_customer_id: `cus_${subId}`,
      stripe_subscription_id: subId,
      stripe_price_id: "price_plus",
      status: "trialing",
      contract_customer_type: "business",
      mode: "test",
    });
    expect(seed.error, seed.error?.message).toBeNull();
    const seedOv = await admin.from("account_overrides").insert({
      artist_id: actor.id,
      plan_tier: "plus",
      plan_source: "paid",
      subscription_status: "trialing",
      stripe_subscription_id: subId,
    });
    expect(seedOv.error, seedOv.error?.message).toBeNull();

    const writerPid = await writer.backendPid();
    await writer.begin();
    await writer.query("delete from account_overrides where artist_id = $1", [
      actor.id,
    ]);
    expect(
      await profileCount(actor.id),
      "the profile must still be present and uncontended at this point",
    ).toBe(1);
    await sleep(MARGIN_MS);

    const eventTs = Math.floor(Date.now() / 1000);
    const startedAt = Date.now();
    const pending = reconcileFromStripeSubscription(
      makeSub({
        subId,
        status: "active",
        customer: `cus_${subId}`,
        artistId: actor.id,
      }),
      eventTs,
    ).then(
      (v) => ({ ok: true as const, v }),
      (e: Error) => ({ ok: false as const, e }),
    );

    await sleep(Math.floor(HOLD_MS / 2));
    const blocked = await observer.countBlockedBy(writerPid);
    // Measured WHILE the call is still parked: write 1 has already committed.
    // This is the partial, observed in flight rather than inferred afterwards.
    const midFlight = await subRow(subId);
    await sleep(HOLD_MS - Math.floor(HOLD_MS / 2));

    await writer.query("delete from profiles where id = $1", [actor.id]);
    await writer.commit();

    const outcome = await pending;
    const elapsed = Date.now() - startedAt;
    const trace =
      `blocked=${blocked} elapsed=${elapsed}ms ` +
      `midFlight={status:${midFlight?.status},artist_id:${midFlight?.artist_id ? "set" : "null"}} ` +
      `outcome=${outcome.ok ? "resolved" : `threw(${outcome.e.message.slice(0, 120)})`}`;
    report("III", trace);

    expect(
      blocked,
      `no backend waited on the holder, so this run was not a race (${trace})`,
    ).toBeGreaterThanOrEqual(1);
    expect(elapsed, trace).toBeGreaterThanOrEqual(HOLD_MS);

    // --- write 1 landed, mid-flight, before anything failed ----------------
    expect(
      midFlight?.status,
      `write 1 must have committed while write 2 was still parked (${trace})`,
    ).toBe("active");
    expect(midFlight?.artist_id, trace).toBe(actor.id);

    // --- and write 2 then 23503'd -----------------------------------------
    expect(outcome.ok, `expected account_overrides to 23503 (${trace})`).toBe(
      false,
    );
    if (!outcome.ok) {
      expect(outcome.e.message, trace).toMatch(/account_overrides/);
      expect(outcome.e.message, trace).toMatch(/23503|foreign key/i);
    }

    // --- the resulting pair is SPLIT --------------------------------------
    const after = await subRow(subId);
    expect(
      after,
      `the row must survive (SET NULL, not CASCADE) (${trace})`,
    ).not.toBeNull();
    // FALSIFICATION, EXECUTED. This line previously asserted the author's
    // claim ("one extra retry", so the retained record still holds its
    // pre-deletion 'trialing') and went RED with `expected 'active' to be
    // 'trialing'`. The racing event's status is what is stored, and no
    // redelivery removes it.
    expect(
      after?.status,
      `billing_subscriptions carries the racing event's status (${trace})`,
    ).toBe("active");
    expect(after?.artist_id, "nulled by the cascade").toBeNull();
    expect(
      after?.last_event_created,
      "the ordering guard was advanced by the half-applied event",
    ).toBe(String(eventTs));
    expect(await overrideRow(actor.id), "the other half is gone").toBeNull();
    expect(await profileCount(actor.id)).toBe(0);

    // --- REDELIVERY: does the safe branch repair it? -----------------------
    vi.clearAllMocks();
    const retry = await reconcileFromStripeSubscription(
      makeSub({
        subId,
        status: "active",
        customer: `cus_${subId}`,
        artistId: actor.id,
      }),
      Math.floor(Date.now() / 1000),
    );
    expect(retry.deletedProfile).toBe(true);
    const healed = await subRow(subId);
    report(
      "III/redelivery",
      `deletedProfile=${retry.deletedProfile} subStatus=${healed?.status} ` +
        `subArtistId=${healed?.artist_id ? "set" : "null"} ` +
        `lastEventCreated=${healed?.last_event_created} ` +
        `override=${(await overrideRow(actor.id)) ? "present" : "none"} ` +
        `alerts=${deletedProfileAlerts().length}`,
    );
    expect(
      healed?.status,
      "the safe branch writes nothing, so the half-applied event stands",
    ).toBe("active");
    expect(await overrideRow(actor.id)).toBeNull();
    expect(
      deletedProfileAlerts(),
      "the retry still pages a human for the live status",
    ).toHaveLength(1);
  }, 30_000);

  it("IV: the delete starts AFTER write 2 committed -> both land, no throw, NO alert", async () => {
    // The benign end of the same window, recorded because it is the one that
    // returns 200 and therefore is never retried. If the racing event carried
    // a LIVE status, this is the path on which the deleted-profile alert is
    // never fired for that event at all.
    const actor = await freshActor("bdtoc-iv");
    const subId = `sub_bdtoc_iv_${actor.id.slice(0, 8)}`;
    subIds.push(subId);

    const r = await reconcileFromStripeSubscription(
      makeSub({
        subId,
        status: "active",
        customer: `cus_${subId}`,
        artistId: actor.id,
      }),
      Math.floor(Date.now() / 1000),
    );
    expect(r.deletedProfile).toBe(false);
    expect(deletedProfileAlerts()).toHaveLength(0);

    // The account is deleted a moment later; the cascade does the rest.
    const { error } = await admin.from("profiles").delete().eq("id", actor.id);
    expect(error, error?.message).toBeNull();
    expect((await subRow(subId))?.artist_id).toBeNull();
    expect((await subRow(subId))?.status).toBe("active");
    expect(await overrideRow(actor.id)).toBeNull();
  }, 30_000);
});

// ===========================================================================
// The ordering guard, which is what makes "one extra retry" a repair rather
// than a no-op.
// ===========================================================================

describe("last_event_created after a half-applied event", () => {
  it("a redelivery carrying the SAME created timestamp re-applies write 1 and REACHES write 2", async () => {
    // The load-bearing asymmetry in guardedUpsert: the guarded UPDATE applies
    // on `last_event_created <= ts` (so an equal timestamp still applies),
    // while `stale` is only declared from the SELECT branch that is reached
    // when the UPDATE matched nothing. An equal timestamp therefore can never
    // be classified stale. If it could, interleaving III's redelivery would
    // return early at write 1 and the missing account_overrides write would
    // never be retried on ANY path, deleted profile or not.
    const actor = await freshActor("bdtoc-order");
    const subId = `sub_bdtoc_order_${actor.id.slice(0, 8)}`;
    subIds.push(subId);
    const ts = Math.floor(Date.now() / 1000);

    // Exactly the state a half-applied event leaves behind, minus the
    // deletion: write 1 landed and stamped the guard, write 2 never ran.
    const seed = await admin.from("billing_subscriptions").insert({
      artist_id: actor.id,
      stripe_customer_id: `cus_${subId}`,
      stripe_subscription_id: subId,
      stripe_price_id: "price_plus",
      status: "active",
      contract_customer_type: "business",
      mode: "test",
      last_event_created: ts,
    });
    expect(seed.error, seed.error?.message).toBeNull();
    expect(await overrideRow(actor.id)).toBeNull();

    const r = await reconcileFromStripeSubscription(
      makeSub({
        subId,
        status: "active",
        customer: `cus_${subId}`,
        artistId: actor.id,
      }),
      ts,
    );
    report(
      "guard/equal-ts",
      `stale=${r.stale} override=${(await overrideRow(actor.id)) ? "present" : "none"}`,
    );
    expect(
      r.stale,
      "an equal timestamp must NOT be read as stale, or the retry repairs nothing",
    ).toBe(false);
    expect(
      (await overrideRow(actor.id))?.plan_tier,
      "write 2 must be reached and applied on the redelivery",
    ).toBe("plus");
  }, 30_000);
});

// ===========================================================================
// What the surviving row does to the 4h backstop. This is the concrete
// mechanism behind any claim about how much the split costs.
// ===========================================================================

describe("the orphaned row and the stale-subscription backstop", () => {
  it("the safe branch never advances last_reconciled_at, so the row stays permanently stale", async () => {
    // reconcileStaleSubscriptions (subscription-reconciliation.ts:76-80)
    // selects `billing_subscriptions` on `last_reconciled_at < now-4h` with NO
    // artist_id filter and NO status filter, `.limit(20)`. Anything that stays
    // below that cutoff is re-picked every 4 hours forever. The safe branch
    // returns before any write, so it cannot advance the column that would
    // remove the row from the scan. Measured, because "it writes nothing" and
    // "it stays in the scan" are the same fact stated from two ends and only
    // one of them is obvious.
    const actor = await freshActor("bdtoc-stale");
    const subId = `sub_bdtoc_stale_${actor.id.slice(0, 8)}`;
    subIds.push(subId);

    const old = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    const seed = await admin.from("billing_subscriptions").insert({
      artist_id: actor.id,
      stripe_customer_id: `cus_${subId}`,
      stripe_subscription_id: subId,
      stripe_price_id: "price_plus",
      status: "active",
      contract_customer_type: "business",
      mode: "test",
      last_reconciled_at: old,
    });
    expect(seed.error, seed.error?.message).toBeNull();

    const { error: delErr } = await admin
      .from("profiles")
      .delete()
      .eq("id", actor.id);
    expect(delErr, delErr?.message).toBeNull();

    const r = await reconcileFromStripeSubscription(
      makeSub({
        subId,
        status: "active",
        customer: `cus_${subId}`,
        artistId: actor.id,
      }),
      Math.floor(Date.now() / 1000),
    );
    expect(r.deletedProfile).toBe(true);

    // The exact predicate the cron uses, run against the real row.
    const cutoff = new Date(Date.now() - 4 * 3600 * 1000).toISOString();
    const rows = await observer.query<{
      last_reconciled_at: string;
      still_stale: boolean;
    }>(
      `select last_reconciled_at::text as last_reconciled_at,
              (last_reconciled_at < $2::timestamptz) as still_stale
         from billing_subscriptions where stripe_subscription_id = $1`,
      [subId, cutoff],
    );
    report(
      "backstop",
      `lastReconciledAt=${rows[0].last_reconciled_at} stillStale=${rows[0].still_stale}`,
    );
    expect(
      rows[0].still_stale,
      "the row is re-selected by the 4h backstop on every run, forever",
    ).toBe(true);
  }, 30_000);
});

// ===========================================================================
// Interleaving III with the PRODUCTION delete shape, un-widened.
// ===========================================================================

describe("III with the real single-statement cascade", () => {
  it("is reachable: the delete fired the instant write 1 lands splits the pair", async () => {
    // III above widens the window with a pre-placed lock. This one does not:
    // it issues the REAL `delete from profiles` (one statement, both cascade
    // actions) from a poller that watches for write 1 committing, then holds
    // the transaction open so write 2 parks on the cascade's own lock. The
    // poller has to win the ~10ms gap between the two writes, so it is
    // attempted repeatedly; ONE hit is proof of reachability, and the attempt
    // count is reported either way.
    const ATTEMPTS = 8;
    const results: string[] = [];
    let hit = false;

    for (let i = 0; i < ATTEMPTS && !hit; i++) {
      const actor = await freshActor(`bdtoc-real${i}`);
      const subId = `sub_bdtoc_real${i}_${actor.id.slice(0, 8)}`;
      subIds.push(subId);

      await admin.from("billing_subscriptions").insert({
        artist_id: actor.id,
        stripe_customer_id: `cus_${subId}`,
        stripe_subscription_id: subId,
        stripe_price_id: "price_plus",
        status: "trialing",
        contract_customer_type: "business",
        mode: "test",
      });
      await admin.from("account_overrides").insert({
        artist_id: actor.id,
        plan_tier: "plus",
        plan_source: "paid",
        subscription_status: "trialing",
      });

      const pending = reconcileFromStripeSubscription(
        makeSub({
          subId,
          status: "active",
          customer: `cus_${subId}`,
          artistId: actor.id,
        }),
        Math.floor(Date.now() / 1000),
      ).then(
        (v) => ({ ok: true as const, v }),
        (e: Error) => ({ ok: false as const, e }),
      );

      // Poll for write 1. `status` moving off the seeded value is the signal.
      let fired = false;
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline) {
        const row = await subRow(subId);
        if (row && row.status === "active") {
          await writer.begin();
          await writer.query("delete from profiles where id = $1", [actor.id]);
          fired = true;
          break;
        }
      }
      if (!fired) {
        results.push(`${i}:never-saw-write1`);
        await pending;
        continue;
      }

      await sleep(1200); // hold, so write 2 (if still to come) parks on it
      await writer.commit();

      const outcome = await pending;
      const after = await subRow(subId);
      const ov = await overrideRow(actor.id);
      const split = !outcome.ok && after?.status === "active" && ov === null;
      results.push(
        `${i}:${outcome.ok ? "resolved" : "threw"}` +
          `/sub=${after?.status ?? "none"}/ov=${ov ? "present" : "none"}`,
      );
      if (split) {
        hit = true;
        expect(!outcome.ok && outcome.e.message).toMatch(/account_overrides/);
      }
    }

    // Reported rather than silently swallowed: a miss is a statement about the
    // window's width, not about whether the defect exists (III proves that).
    report("III-real", results.join(" | "));
    expect(
      hit,
      `no attempt landed in the gap. Attempts: ${results.join(" | ")}`,
    ).toBe(true);
  }, 120_000);
});
