import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  adminClient,
  makeActor,
  destroyActor,
  type Actor,
} from "./helpers/actor";
import { PgSession } from "./helpers/pg-session";

/**
 * 0126 CONVERGES, INCLUDING FROM THE ONE STATE IT USED TO ABORT ON.
 *
 * AGENTS.md: a migration that re-runs without erroring has not necessarily
 * converged, and `0122` is the reference for the guarded pattern. 0126 followed
 * that pattern and still had a state it could not reach, because its problem was
 * not the shape of its DDL but the DATA the DDL is asserted against:
 * `payment_requests_collects_sent_check` says a sent request declares what it
 * collects, and a request that was SENT BEFORE 0126 RAN has a null `collects`.
 *
 * EXECUTED, RED FIRST, on the local stack (127.0.0.1:54322), 2026-07-29, before
 * the repair existed. Statement by statement, as a SQL editor session applies it:
 *
 *   stmt 1  alter table … add column if not exists collects   OK   (committed)
 *   stmt 2  do $$ … add both constraints … end $$;            FAIL 23514
 *           check constraint "payment_requests_collects_sent_check" of relation
 *           "payment_requests" is violated by some row
 *
 * The column was left present and BOTH constraints absent (the `do` block is one
 * statement, so the first constraint went down with the second). Re-running the
 * whole file from there failed identically, which is the half-application and
 * the non-convergence in one. `supabase db push` wraps a migration in a
 * transaction and would roll the column back, but this repo's handoff describes
 * hand-application through the SQL editor, and "converges only under one of the
 * two application routes" is not convergence.
 *
 * WHY THE REPAIR NEEDS THE TRIGGER STOOD DOWN, which is the part that is easy to
 * get wrong. `enforce_payment_request_immutability` (the body section 2 of 0126
 * installs) treats `collects` as frozen, so on a database that already carries
 * that body the backfill raises `payment_request_frozen` and the migration is
 * STILL unappliable. That is the state this file reproduces, deliberately: it is
 * the harder of the two, and a repair proven against it holds for the pre-0125
 * one as well.
 *
 * SAFETY. Every statement below runs inside ONE transaction that is always
 * rolled back, including the DDL, so this file leaves the local schema exactly
 * as it found it. It does drop constraints and run a migration, which the sibling
 * race file explicitly refuses to do. The difference is the subject: that file
 * tests a function's BEHAVIOUR, and rewriting the thing under test would make it
 * meaningless; this one tests whether a migration can be APPLIED, which cannot be
 * observed without applying it.
 */

const MIGRATION = readFileSync(
  fileURLToPath(
    new URL(
      "../../supabase/migrations/0126_payment_request_send.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

const CONSTRAINTS = [
  "payment_requests_collects_check",
  "payment_requests_collects_sent_check",
];

let admin: SupabaseClient;
let owner: Actor;
let pg: PgSession;

async function constraintsPresent(): Promise<string[]> {
  const rows = await pg.query<{ conname: string }>(
    `select conname from pg_constraint
      where conrelid = 'payment_requests'::regclass
        and conname = any($1) order by conname`,
    [CONSTRAINTS],
  );
  return rows.map((r) => r.conname);
}

async function orphanCount(): Promise<number> {
  const rows = await pg.query<{ n: string }>(
    `select count(*)::text as n from payment_requests
      where sent_at is not null and collects is null`,
  );
  return Number(rows[0].n);
}

/**
 * Build the pre-0126 world inside a transaction and hand it to `body`.
 *
 * The sent row is created with the constraints already dropped, because that is
 * the only way it can exist: with them in place the database refuses it, which
 * is the whole point of them.
 */
async function inPre0126World(
  body: (ids: { requestId: string; draftId: string }) => Promise<void>,
): Promise<void> {
  await pg.begin();
  try {
    await pg.query(
      `alter table payment_requests drop constraint if exists payment_requests_collects_sent_check`,
    );
    await pg.query(
      `alter table payment_requests drop constraint if exists payment_requests_collects_check`,
    );

    const [booking] = await pg.query<{ id: string }>(
      `insert into booking_requests (artist_id) values ($1) returning id`,
      [owner.id],
    );

    const make = async (total: number, revision: number): Promise<string> => {
      const [req] = await pg.query<{ id: string }>(
        `insert into payment_requests
           (artist_id, booking_id, status, currency, collects, total_minor, revision)
         values ($1, $2, 'ready', 'eur', null, $3, $4) returning id`,
        [owner.id, booking.id, total, revision],
      );
      // The freeze verifies the total against the sum of the lines for every
      // role, so a request with no lines could not be sent at all and the
      // fixture would silently stop being a sent row.
      await pg.query(
        `insert into payment_request_lines
           (request_id, artist_id, currency, name, quantity, unit_amount_minor,
            line_total_minor, classification, position)
         values ($1, $2, 'eur', 'Balance', 1, $3, $3, 'tattoo_service', 0)`,
        [req.id, owner.id, total],
      );
      return req.id;
    };

    const requestId = await make(20_000, 1);
    const draftId = await make(15_000, 1);
    await pg.query(
      `update payment_requests
          set status = 'sent', sent_at = now(),
              expires_at = now() + interval '30 days',
              fee_schedule_version = 'fees-v1-2026-07-04'
        where id = $1`,
      [requestId],
    );

    await body({ requestId, draftId });
  } finally {
    // ALWAYS. A leaked transaction here would hold ACCESS EXCLUSIVE on
    // payment_requests and every later file would fail on a lock rather than on
    // its own subject.
    await pg.rollbackIfOpen();
  }
}

beforeAll(async () => {
  admin = adminClient();
  pg = PgSession.open("collects-backfill");
  owner = await makeActor(admin, "a2-backfill");
}, 60_000);

afterAll(async () => {
  await pg.close();
  await admin.from("payment_requests").delete().eq("artist_id", owner.id);
  await admin.from("booking_requests").delete().eq("artist_id", owner.id);
  await destroyActor(admin, owner);
}, 60_000);

describe("0126 applies to a database that already has sent payment requests", () => {
  it("CONTROL: the live schema holds both constraints and nothing violating them", async () => {
    // Without this, a green run below could be a schema that never had the
    // constraints in the first place.
    expect(await constraintsPresent()).toEqual(CONSTRAINTS);
    expect(
      await orphanCount(),
      "a sent request with no `collects` must be unstorable here",
    ).toBe(0);
  });

  it("converges from a request that was SENT before it ran", async () => {
    await inPre0126World(async ({ requestId }) => {
      // The state that used to abort it, asserted rather than assumed.
      expect(
        await constraintsPresent(),
        "the pre-0126 world has neither",
      ).toEqual([]);
      expect(await orphanCount()).toBe(1);

      // The whole file, exactly as shipped. RED before the repair with
      // `check constraint "payment_requests_collects_sent_check" … is violated
      // by some row`; the failure arrives as a rejected promise here.
      await pg.query(MIGRATION);

      expect(
        await constraintsPresent(),
        "both constraints must be back, not just the one that did not fail",
      ).toEqual(CONSTRAINTS);
      expect(await orphanCount(), "and nothing may still violate them").toBe(0);

      const [row] = await pg.query<{ collects: string }>(
        `select collects from payment_requests where id = $1`,
        [requestId],
      );
      expect(
        row.collects,
        "the repaired row carries the guess the migration documents",
      ).toBe("full_price");
    });
  });

  it("repairs only what the constraint requires, and leaves drafts alone", async () => {
    // `collects` is required at the FREEZE, not on the row. A repair written as
    // `where collects is null` would invent a purpose for every draft in the
    // database, and every one of those is a request an artist is still
    // composing.
    await inPre0126World(async ({ draftId }) => {
      await pg.query(MIGRATION);
      const [row] = await pg.query<{ collects: string | null }>(
        `select collects from payment_requests where id = $1`,
        [draftId],
      );
      expect(
        row.collects,
        "a draft still says nothing, because it may not know",
      ).toBeNull();
    });
  });

  it("does not weaken the constraint it repairs around", async () => {
    // The failure mode this repair could have taken instead: make the check
    // permissive and the migration applies everywhere, having stopped asserting
    // anything.
    await inPre0126World(async () => {
      await pg.query(MIGRATION);

      const [booking] = await pg.query<{ id: string }>(
        `insert into booking_requests (artist_id) values ($1) returning id`,
        [owner.id],
      );
      let refusal = { code: "none", constraint: "none" };
      try {
        await pg.query(
          `insert into payment_requests
             (artist_id, booking_id, status, currency, collects, total_minor,
              revision, sent_at, fee_schedule_version)
           values ($1, $2, 'sent', 'eur', null, 12000, 1, now(), 'fees-v1-2026-07-04')`,
          [owner.id, booking.id],
        );
      } catch (e) {
        const err = e as { code?: string; constraint_name?: string };
        refusal = {
          code: String(err.code ?? "unknown"),
          constraint: String(err.constraint_name ?? "unknown"),
        };
      }
      // The NAME as well as the code: several constraints on this table raise
      // 23514, so the code alone would let an unrelated refusal stand in for
      // this one.
      expect(
        refusal,
        "a sent request with no `collects` must still be refused",
      ).toEqual({
        code: "23514",
        constraint: "payment_requests_collects_sent_check",
      });
    });
  });
});
