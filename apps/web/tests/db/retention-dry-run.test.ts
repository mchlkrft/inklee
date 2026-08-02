import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient, makeActor, type Actor } from "./helpers/actor";

// Same `server-only` workaround the sibling retention DB tests use: the real
// server modules are imported so this stays an integration test of the thing
// under test rather than a mock of it.
vi.mock("server-only", () => ({}));

import {
  purgeCancelledStandaloneOrderEmails,
  purgeAbandonedCarts,
  countUnstampedCancelledStandaloneOrders,
} from "@/lib/server/shop-retention";

/**
 * Counsel Q14, the parts `shop-retention-purge.test.ts` does NOT cover. This
 * file deliberately does not repeat that one's dry-run tests; it adds the
 * three controls those tests cannot provide by construction.
 *
 * 1. THE NEGATIVE CONTROL FOR THE DRY-RUN PREDICATE. The sibling proves an
 *    expired row IS counted (`count >= 1`). A dry-run that counted the whole
 *    table would pass that too. What has to be pinned is that a row still
 *    inside its window moves the count by ZERO — asserted as a DELTA around
 *    inserting one fixture, because these are system-wide purges over shared
 *    tables and an absolute count would be at the mercy of another file's
 *    leftovers.
 *
 * 2. THE POSITIVE CONTROL FOR THE UNSTAMPED COUNTER. The sibling asserts it
 *    returns 0, which a function hard-coded to return 0 also satisfies. The
 *    counter only earns its place if it detects the state it exists for, so
 *    that state is constructed here and the count must move.
 *
 * 3. THE EVIDENCE LEDGER (`retention_purge_runs`, migration 0149). Counsel
 *    wants a zero-row run to be a RECORD rather than an absence, so the table
 *    has to accept a zero-count run, accept a FAILED run, and refuse a mode
 *    nobody defined.
 */

const LABEL = "q14-controls";
const NOW = new Date("2026-08-02T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

let admin: SupabaseClient;
let artist: Actor;

beforeAll(async () => {
  admin = adminClient();
  artist = await makeActor(admin, LABEL);
}, 60_000);

afterAll(async () => {
  await admin.from("shop_carts").delete().eq("artist_id", artist.id);
  await admin.from("orders").delete().eq("artist_id", artist.id);
  await admin.from("profiles").delete().eq("id", artist.id);
  await admin.auth.admin.deleteUser(artist.id);
}, 60_000);

async function insertOrder(fields: Record<string, unknown>): Promise<string> {
  const { data, error } = await admin
    .from("orders")
    .insert({
      artist_id: artist.id,
      deposit_amount: 0,
      subtotal_amount: 0,
      ...fields,
    })
    .select("id")
    .single();
  expect(error, error?.message).toBeNull();
  return data!.id as string;
}

async function orderEmail(orderId: string): Promise<string | null> {
  const { data, error } = await admin
    .from("orders")
    .select("client_email")
    .eq("id", orderId)
    .single();
  expect(error, error?.message).toBeNull();
  return (data?.client_email as string | null) ?? null;
}

// ===========================================================================

describe("Q14 control: the dry-run counts the expiring set, not the table", () => {
  it("cancelled orders — an in-window row moves the count by 0, a past-window row by exactly 1", async () => {
    const baseline = await purgeCancelledStandaloneOrderEmails(NOW, "dry-run");

    const survivorId = await insertOrder({
      client_email: "dryrun-survivor-29d@example.com",
      status: "cancelled",
      cancelled_at: new Date(NOW.getTime() - 29 * DAY).toISOString(),
    });
    const withSurvivor = await purgeCancelledStandaloneOrderEmails(
      NOW,
      "dry-run",
    );
    expect(
      withSurvivor.count,
      "a row inside its 30-day window must not be counted",
    ).toBe(baseline.count);

    const expiredId = await insertOrder({
      client_email: "dryrun-expired-31d@example.com",
      status: "cancelled",
      cancelled_at: new Date(NOW.getTime() - 31 * DAY).toISOString(),
    });
    const withExpired = await purgeCancelledStandaloneOrderEmails(
      NOW,
      "dry-run",
    );
    expect(withExpired.count, "counted exactly once, not twice").toBe(
      baseline.count + 1,
    );

    // Three dry-runs have now executed against both rows and written nothing.
    expect(await orderEmail(expiredId)).toBe("dryrun-expired-31d@example.com");
    expect(await orderEmail(survivorId)).toBe(
      "dryrun-survivor-29d@example.com",
    );
  });

  it("abandoned carts — the two-query candidate rule counts the stale cart and not the fresh one", async () => {
    const makeCart = async (updatedAt: string) => {
      const { data, error } = await admin
        .from("shop_carts")
        .insert({
          guest_token_hash: `q14-cart-${crypto.randomUUID()}`,
          artist_id: artist.id,
          updated_at: updatedAt,
        })
        .select("id")
        .single();
      expect(error, error?.message).toBeNull();
      return data!.id as string;
    };
    const cartExists = async (id: string) => {
      const { data } = await admin
        .from("shop_carts")
        .select("id")
        .eq("id", id)
        .maybeSingle();
      return Boolean(data);
    };

    const baseline = await purgeAbandonedCarts(NOW, "dry-run");

    const freshCartId = await makeCart(
      new Date(NOW.getTime() - 5 * DAY).toISOString(),
    );
    expect(
      (await purgeAbandonedCarts(NOW, "dry-run")).count,
      "a cart active 5 days ago must not be counted",
    ).toBe(baseline.count);

    const staleCartId = await makeCart(
      new Date(NOW.getTime() - 31 * DAY).toISOString(),
    );
    expect((await purgeAbandonedCarts(NOW, "dry-run")).count).toBe(
      baseline.count + 1,
    );

    expect(await cartExists(staleCartId)).toBe(true);
    expect(await cartExists(freshCartId)).toBe(true);
  });
});

// ===========================================================================

describe("Q14 control: the unstamped-cancelled counter detects the state it exists for", () => {
  it("counts a cancelled standalone order whose cancelled_at is null, and the purge provably leaves it behind", async () => {
    const before = await countUnstampedCancelledStandaloneOrders();

    const id = await insertOrder({
      client_email: "unstamped@example.com",
      status: "cancelled",
      cancelled_at: new Date(NOW.getTime() - 400 * DAY).toISOString(),
    });
    // 0149's trigger leaves `cancelled_at` alone while the row STAYS
    // cancelled (that is the no-restart rule), so an explicit null persists.
    // This is how a pre-0149 restore or a raw SQL writer produces the state.
    const blank = await admin
      .from("orders")
      .update({ cancelled_at: null })
      .eq("id", id);
    expect(blank.error, blank.error?.message).toBeNull();

    const after = await countUnstampedCancelledStandaloneOrders();
    expect(after.count).toBe(before.count + 1);

    // And the row really is unpurgeable — which is why counting it matters:
    // 400 days cancelled, and the purge cannot see it.
    await purgeCancelledStandaloneOrderEmails(NOW, "purge");
    expect(await orderEmail(id)).toBe("unstamped@example.com");

    await admin.from("orders").delete().eq("id", id);
  });
});

// ===========================================================================

describe("Q14: retention_purge_runs is a usable evidence ledger", () => {
  const written: string[] = [];

  afterAll(async () => {
    if (written.length > 0) {
      await admin.from("retention_purge_runs").delete().in("id", written);
    }
  });

  it("accepts a zero-count dry-run row and reads it back intact", async () => {
    const { data, error } = await admin
      .from("retention_purge_runs")
      .insert({
        mode: "dry-run",
        ok: true,
        step_counts: { purged_map_reports: 0, purged_abandoned_carts: 0 },
        step_errors: [],
        duration_ms: 12,
      })
      .select("id, mode, ok, step_counts")
      .single();
    expect(error, error?.message).toBeNull();
    written.push(data!.id as string);
    expect(data!.mode).toBe("dry-run");
    expect(data!.step_counts).toEqual({
      purged_map_reports: 0,
      purged_abandoned_carts: 0,
    });
  });

  it("records a FAILED run with its per-block errors, so a failure is evidenced too", async () => {
    const { data, error } = await admin
      .from("retention_purge_runs")
      .insert({
        mode: "purge",
        ok: false,
        step_counts: { purged_map_reports: 3 },
        step_errors: [{ step: "purged_audit_rows", error: "connection reset" }],
        duration_ms: 900,
      })
      .select("id, ok, step_errors")
      .single();
    expect(error, error?.message).toBeNull();
    written.push(data!.id as string);
    expect(data!.ok).toBe(false);
    expect(data!.step_errors).toEqual([
      { step: "purged_audit_rows", error: "connection reset" },
    ]);
  });

  it("rejects a mode outside {purge, dry-run} (23514), so a typo cannot be logged as a run that happened", async () => {
    const { error } = await admin
      .from("retention_purge_runs")
      .insert({ mode: "pretend", ok: true, step_counts: {}, step_errors: [] });
    expect(error?.code).toBe("23514");
  });
});
