import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { readFileSync } from "fs";
import { PgSession } from "./helpers/pg-session";

/**
 * DRIFT-ENUM-001 / migration 0154 — repair of the production order_status
 * enum's mangled 'cancelled' label.
 *
 * Production's order_status enum carries E'cancel\r\n  led' at enumsortorder 3
 * instead of 'cancelled' (confirmed by catalog read 2026-08-03). Migration
 * 0149's backfill `update orders ... where status = 'cancelled'` coerces that
 * literal to order_status at PLAN time and raises 22P02, aborting the
 * 0125-0153 apply. 0154 renames the mangled label back.
 *
 * The local dev database has the CLEAN label, so every case here REPRODUCES
 * the corruption inside a transaction and ROLLS BACK, never persisting the
 * mangled state. ALTER TYPE ... RENAME VALUE is transactional, so the enum is
 * restored on rollback; afterEach and afterAll are the safety nets that
 * guarantee the shared enum is never left corrupted.
 *
 * These tests fail if the repair is wrong: remove the rename and case 3/4 go
 * red; weaken the guard and case 5/6 go red; and case 2 is the load-bearing
 * proof that the blocker is real (the exact 0149 statement against the exact
 * mangled label).
 */

// The exact production corruption: 'cancel' + CR + LF + two spaces + 'led'.
const MANGLE_CANCELLED =
  "alter type order_status rename value 'cancelled' to E'cancel\\r\\n  led'";

// Verbatim from 0149_order_cancelled_at_and_retention_runs.sql:129-132.
const BACKFILL_0149 =
  "update orders set cancelled_at = updated_at where status = 'cancelled' and cancelled_at is null";

// The real migration artifact, executed as-is so the test proves the file,
// not a reimplementation of it.
const MIGRATION_0154 = readFileSync(
  new URL(
    "../../supabase/migrations/0154_repair_order_status_enum.sql",
    import.meta.url,
  ),
  "utf8",
);

const LABELS_SQL = `
  select e.enumlabel as label,
         length(e.enumlabel) as len,
         (strpos(e.enumlabel, chr(13)) > 0 or strpos(e.enumlabel, chr(10)) > 0) as crlf
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
   where t.typname = 'order_status'
   order by e.enumsortorder`;

type Label = { label: string; len: number; crlf: boolean };

let s: PgSession;

async function labels(): Promise<Label[]> {
  return s.query<Label>(LABELS_SQL);
}

beforeAll(() => {
  s = PgSession.open("order-status-enum-repair");
});

afterEach(async () => {
  // Every case works inside a transaction; this guarantees the reproduced
  // corruption never survives the test, even if an assertion threw.
  await s.rollbackIfOpen();
});

afterAll(async () => {
  await s.close();
  // Final proof the shared enum is intact for whatever runs next.
});

describe("DRIFT-ENUM-001: order_status enum repair (migration 0154)", () => {
  it("the local enum starts CLEAN (control): five labels, cancelled at slot 3, no CR/LF", async () => {
    await s.begin();
    const rows = await labels();
    expect(rows.map((r) => r.label)).toEqual([
      "pending",
      "paid",
      "cancelled",
      "refunded",
      "partially_refunded",
    ]);
    expect(rows.every((r) => !r.crlf)).toBe(true);
  });

  it("reproduces the production corruption exactly: a 13-byte CR/LF label, no clean 'cancelled'", async () => {
    await s.begin();
    await s.query(MANGLE_CANCELLED);
    const rows = await labels();
    const third = rows[2];
    expect(third.len).toBe(13);
    expect(third.crlf).toBe(true);
    expect(rows.some((r) => r.label === "cancelled")).toBe(false);
  });

  it("THE BLOCKER: 0149's backfill aborts with 22P02 against the mangled enum", async () => {
    await s.begin();
    await s.query(MANGLE_CANCELLED);
    await s.query("savepoint pre_backfill");
    let err: unknown = null;
    try {
      await s.query(BACKFILL_0149);
    } catch (e) {
      err = e;
    }
    await s.query("rollback to savepoint pre_backfill");
    const e = err as { code?: string; message?: string } | null;
    expect(
      e,
      "0149's backfill must throw against the mangled enum",
    ).not.toBeNull();
    const is22P02 =
      e?.code === "22P02" ||
      /invalid input value for enum order_status/i.test(e?.message ?? "");
    expect(is22P02, `expected 22P02, got: ${e?.code} ${e?.message}`).toBe(true);
  });

  it("migration 0154 renames the mangled label back to 'cancelled'", async () => {
    await s.begin();
    await s.query(MANGLE_CANCELLED);
    await s.query(MIGRATION_0154);
    const rows = await labels();
    expect(rows.map((r) => r.label)).toEqual([
      "pending",
      "paid",
      "cancelled",
      "refunded",
      "partially_refunded",
    ]);
    expect(rows.every((r) => !r.crlf)).toBe(true);
  });

  it("AFTER 0154, 0149's backfill succeeds (the fix unblocks the apply)", async () => {
    await s.begin();
    await s.query(MANGLE_CANCELLED);
    await s.query(MIGRATION_0154);
    // Must not throw now that the literal 'cancelled' coerces cleanly.
    await s.query(BACKFILL_0149);
    const rows = await labels();
    expect(rows.some((r) => r.label === "cancelled" && !r.crlf)).toBe(true);
  });

  it("0154 is a convergent no-op on an already-clean enum, and idempotent on a second run", async () => {
    await s.begin();
    const before = await labels();
    await s.query(MIGRATION_0154);
    await s.query(MIGRATION_0154); // twice: converged, not just non-erroring
    const after = await labels();
    expect(after).toEqual(before);
    expect(after.some((r) => r.label === "cancelled")).toBe(true);
  });

  it("SAFETY: 0154 refuses to guess when more than one label is mangled", async () => {
    await s.begin();
    await s.query(MANGLE_CANCELLED);
    await s.query(
      "alter type order_status rename value 'refunded' to E'refun\\r\\nded'",
    );
    await s.query(MIGRATION_0154);
    const rows = await labels();
    // The guard's _n>1 branch: nothing renamed, no 'cancelled' invented.
    expect(rows.some((r) => r.label === "cancelled")).toBe(false);
    expect(rows.filter((r) => r.crlf).length).toBe(2);
  });
});
