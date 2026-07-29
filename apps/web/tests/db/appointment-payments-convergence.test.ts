import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PgSession } from "./helpers/pg-session";

/**
 * DOES 0125 CONVERGE, OR DOES IT MERELY NOT ERROR? (AGENTS.md).
 *
 * The footgun this file exists for, in the words the repo already uses:
 * "a migration that RE-RUNS without erroring has not necessarily CONVERGED".
 * `create table if not exists` checks the TABLE's existence, so anything
 * declared INLINE in its column list (primary keys, foreign keys, unique
 * constraints, checks) is skipped entirely once the table exists, and the run
 * exits 0 having restored nothing. That was found empirically on `0122` and it
 * had been certified idempotent on the basis that it does not error, which is a
 * different property.
 *
 * 0125 shipped with SIX constraints declared inline exactly that way. They were
 * moved into guarded `do $$ ... if not exists ... end $$;` blocks; this file is
 * the sentinel that keeps them there. Measured against the inline version, six
 * dropped by hand: re-running exited 0 with zero ERROR lines and restored
 * `0 of 6`. Against the guarded version, the same probe restores `6 of 6`.
 *
 * WHY THE WHOLE FILE IS RE-RUN AND NOT JUST THE SIX BLOCKS. Convergence is a
 * property of the migration, not of a fragment of it. Re-running the file is
 * also the exact operation the footgun describes someone reaching for during an
 * incident, so it is the operation that has to be tested.
 *
 * SAFETY: EVERYTHING HAPPENS INSIDE ONE TRANSACTION THAT IS ALWAYS ROLLED BACK.
 * These tests drop real constraints on real tables in the shared local stack,
 * and `vitest.db.config.ts` runs files serially, but a failure between the drop
 * and the repair would still leave the database wrong for every file after it.
 * `supabase db push` wraps a migration in a transaction anyway, so running it
 * this way is faithful rather than a workaround.
 */

const migrationPath = (file: string) =>
  path.join(__dirname, "..", "..", "supabase", "migrations", file);

const MIGRATION = migrationPath("0125_appointment_payments.sql");
const MIGRATION_A2 = migrationPath("0126_payment_request_send.sql");

/** The six that were inline. Named individually because "six came back" is a
 *  weaker claim than "these six came back": a run that restored six DIFFERENT
 *  constraints would satisfy a count. */
const FORMERLY_INLINE = [
  "payment_requests_pkey",
  "payment_requests_artist_id_fkey",
  "payment_request_lines_pkey",
  "payment_request_lines_artist_id_fkey",
  "payment_allocations_pkey",
  "payment_allocations_artist_id_fkey",
] as const;

const TABLES = [
  "payment_requests",
  "payment_request_lines",
  "payment_collections",
  "payment_allocations",
] as const;

let sql: PgSession;
let migrationText: string;
let migrationA2Text: string;

async function constraintNames(): Promise<string[]> {
  const rows = await sql.query<{ conname: string }>(
    `select c.conname
       from pg_constraint c
      where c.conrelid = any (
              select oid from pg_class
               where relname = any ($1) and relnamespace = 'public'::regnamespace)
      order by c.conname`,
    [TABLES as unknown as string[]],
  );
  return rows.map((r) => r.conname);
}

async function present(names: readonly string[]): Promise<string[]> {
  const rows = await sql.query<{ conname: string }>(
    "select conname from pg_constraint where conname = any ($1) order by conname",
    [names as string[]],
  );
  return rows.map((r) => r.conname);
}

beforeAll(async () => {
  sql = PgSession.open("convergence");
  migrationText = readFileSync(MIGRATION, "utf8");
  migrationA2Text = readFileSync(MIGRATION_A2, "utf8");
  expect(
    Math.min(migrationText.length, migrationA2Text.length),
    "both migration files must be readable, or nothing below tests anything",
  ).toBeGreaterThan(1000);
}, 60_000);

afterAll(async () => {
  await sql.close();
}, 60_000);

describe("0125 converges: a dropped constraint comes BACK on a re-run", () => {
  it("restores all six formerly-inline constraints, one drop at a time", async () => {
    // ONE AT A TIME, because that is the shape of the incident: somebody drops
    // or loses a single object and re-runs the migration expecting it back. A
    // combined drop can also be satisfied by a `create table` that happens to
    // run because the table is gone too, which is not the property under test.
    const restored: string[] = [];
    const missing: string[] = [];

    for (const name of FORMERLY_INLINE) {
      await sql.begin();
      try {
        expect(
          await present([name]),
          `${name} must exist BEFORE the drop, or the drop proves nothing`,
        ).toEqual([name]);

        // CASCADE, because a primary key is the target of other foreign keys
        // and Postgres refuses a bare drop. That widens the damage, which is
        // the honest version of the scenario anyway.
        const table = name.startsWith("payment_requests_")
          ? "payment_requests"
          : name.startsWith("payment_request_lines_")
            ? "payment_request_lines"
            : "payment_allocations";
        await sql.query(`alter table ${table} drop constraint ${name} cascade`);
        expect(
          await present([name]),
          `${name} must really be gone before the re-run`,
        ).toEqual([]);

        // THE OPERATION UNDER TEST.
        await sql.query(migrationText);

        const after = await present([name]);
        (after.length === 1 ? restored : missing).push(name);
      } finally {
        await sql.rollbackIfOpen();
      }
    }

    expect(
      { restored: restored.length, missing },
      `expected all six to come back; missing means they are declared INLINE ` +
        `inside \`create table if not exists\` again and the re-run skipped them`,
    ).toEqual({ restored: 6, missing: [] });
  }, 120_000);

  it("restores the WHOLE constraint set, not only the six it was asked about", async () => {
    // The stronger claim, and the reason the six are not enough on their own:
    // a re-run that restored exactly the six named constraints and silently
    // lost a check or a composite FK would pass the test above. This drops
    // EVERY constraint on the four tables and asserts the name list comes back
    // byte-identical.
    //
    // BOTH migrations are re-run, in order, because two of the constraints on
    // these tables belong to 0126 (`payment_requests_collects_check` and
    // `payment_requests_collects_sent_check`). Measured: re-running 0125 alone
    // restored 53 of 55 and those two were the gap, which is the correct answer
    // to the wrong question. "Re-run the migration" during an incident means
    // the migrations that own the objects, so that is what is executed.
    await sql.begin();
    try {
      const before = await constraintNames();
      expect(
        before.length,
        "0125 must own constraints on these tables, or the drop below is a no-op",
      ).toBeGreaterThan(20);

      for (const name of before) {
        const owner = await sql.query<{ rel: string }>(
          `select c.relname as rel from pg_constraint k
             join pg_class c on c.oid = k.conrelid
            where k.conname = $1`,
          [name],
        );
        if (!owner.length) continue; // already taken by an earlier cascade
        await sql.query(
          `alter table ${owner[0].rel} drop constraint if exists ${name} cascade`,
        );
      }
      const emptied = await constraintNames();
      expect(
        emptied,
        "every constraint must really be gone before the re-run",
      ).toEqual([]);

      await sql.query(migrationText);
      await sql.query(migrationA2Text);

      const after = await constraintNames();
      expect(after).toEqual(before);
    } finally {
      await sql.rollbackIfOpen();
    }
  }, 120_000);

  it("restores 0125's indexes too, which no constraint would bring back", async () => {
    // The partial unique indexes are the arbiter of "one payable request per
    // subject" and they are NOT constraints, so nothing above covers them. Same
    // footgun class: `create index if not exists` is skipped when the index
    // exists and does nothing when it does not, so it converges only because
    // the drop leaves it absent.
    await sql.begin();
    try {
      const before = await sql.query<{ indexname: string }>(
        `select indexname from pg_indexes
          where schemaname = 'public' and tablename = any ($1)
            and indexname not in (select conname from pg_constraint
                                   where conname = indexname)
          order by indexname`,
        [TABLES as unknown as string[]],
      );
      expect(before.length).toBeGreaterThan(0);

      for (const { indexname } of before) {
        await sql.query(`drop index if exists ${indexname}`);
      }
      const gone = await sql.query<{ n: string }>(
        `select count(*)::text as n from pg_indexes
          where schemaname = 'public' and indexname = any ($1)`,
        [before.map((b) => b.indexname)],
      );
      expect(Number(gone[0].n), "the indexes must really be gone").toBe(0);

      await sql.query(migrationText);

      const restored = await sql.query<{ n: string }>(
        `select count(*)::text as n from pg_indexes
          where schemaname = 'public' and indexname = any ($1)`,
        [before.map((b) => b.indexname)],
      );
      expect(Number(restored[0].n)).toBe(before.length);
    } finally {
      await sql.rollbackIfOpen();
    }
  }, 120_000);

  it("re-runs clean: no ERROR, and the tables are not recreated", async () => {
    // The weaker property, kept and LABELLED as the weaker one, because
    // AGENTS.md records that this repo has mistaken it for the stronger one.
    // Both hold at once and they are not in tension: 0125 re-runs without
    // erroring AND (per the tests above) converges.
    await sql.begin();
    try {
      const idBefore = await sql.query<{ oid: number }>(
        "select 'payment_requests'::regclass::oid as oid",
      );
      await sql.query(migrationText);
      const idAfter = await sql.query<{ oid: number }>(
        "select 'payment_requests'::regclass::oid as oid",
      );
      expect(
        idAfter[0].oid,
        "a re-run must not recreate the table; that would silently drop its data",
      ).toBe(idBefore[0].oid);
    } finally {
      await sql.rollbackIfOpen();
    }
  }, 120_000);
});
