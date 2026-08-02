import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  adminClient,
  makeActor,
  destroyActor,
  type Actor,
} from "./helpers/actor";
import { getArtistFeeSavings } from "@/lib/server/fee-savings-query";

/**
 * The artist fee-savings panel (`/analytics` and `/api/mobile/analytics`),
 * read against a REAL schema.
 *
 * WHY THIS FILE EXISTS. The goods half of this query asked for a column named
 * `subtotal`. `orders` has never had one: migration 0036 defines
 * `subtotal_amount`. PostgREST answered 42703 on every call, the error was
 * discarded by a destructuring that took `data` and not `error`, and the goods
 * lane silently reported zero fees, zero transactions and zero hypothetical to
 * every artist on both surfaces. The suite was green throughout, because the
 * only existing test covered `fallbackTier` and said so in its own header:
 * "independent of the DB read the full query performs".
 *
 * That is the general lesson and the reason this is a db test rather than a
 * unit test. NO MOCK CAN CATCH A COLUMN THAT DOES NOT EXIST. A mocked client
 * returns the rows the test author hands it regardless of the select string,
 * so it proves the arithmetic and nothing about the contract with the
 * database. Only a real Postgres can fail on `select subtotal`.
 *
 * Two properties are asserted, and the second one only became reachable once
 * the first was fixed:
 *
 *  1. THE SELECT RESOLVES. A schema drift under this query fails here rather
 *     than degrading to a plausible-looking zero in production.
 *  2. A BOOKING-COUPLED ORDER IS NOT COUNTED TWICE. A combined deposit+add-on
 *     payment stamps the FULL Stripe application fee in BOTH
 *     `booking_requests.platform_fee_collected_cents` and the coupled order's
 *     `orders.platform_fee_amount` (request/[token]/actions.ts ~571). The dead
 *     query was concealing that: repairing only the column name would have
 *     turned an under-report into a double-count, which is the more damaging
 *     direction because the number looks credible.
 */

let admin: SupabaseClient;
let artist: Actor;

const STANDALONE_FEE_EUR = 3.5;
const COUPLED_FEE_EUR = 9.0;
const DEPOSIT_FEE_CENTS = 900;

beforeAll(async () => {
  admin = adminClient();
  artist = await makeActor(admin, "feesavings");

  // The panel is entitlement-gated; without this the function returns null
  // before it reads anything and the test would pass vacuously.
  const { error: ovErr } = await admin.from("account_overrides").upsert({
    artist_id: artist.id,
    plan_tier: "plus",
    plan_source: "paid",
  });
  if (ovErr) throw ovErr;

  // A settled STANDALONE order: the one row the goods lane should count.
  const { error: soErr } = await admin.from("orders").insert({
    artist_id: artist.id,
    booking_id: null,
    client_email: "buyer@example.com",
    status: "paid",
    deposit_amount: 0,
    goods_amount: 100,
    subtotal_amount: 100,
    platform_fee_amount: STANDALONE_FEE_EUR,
    currency: "eur",
  });
  if (soErr) throw soErr;

  // A combined deposit + add-on payment: ONE Stripe fee, recorded in two
  // places by design. Counting both is the double-count under test.
  const { data: booking, error: bErr } = await admin
    .from("booking_requests")
    .insert({
      artist_id: artist.id,
      status: "approved",
      deposit_amount: 200,
      deposit_paid_at: new Date().toISOString(),
      platform_fee_collected_cents: DEPOSIT_FEE_CENTS,
    })
    .select("id")
    .single();
  if (bErr) throw bErr;

  const { error: coErr } = await admin.from("orders").insert({
    artist_id: artist.id,
    booking_id: booking.id,
    client_email: "combined@example.com",
    status: "paid",
    deposit_amount: 200,
    goods_amount: 50,
    subtotal_amount: 250,
    platform_fee_amount: COUPLED_FEE_EUR,
    currency: "eur",
  });
  if (coErr) throw coErr;
});

afterAll(async () => {
  if (artist) {
    await admin.from("orders").delete().eq("artist_id", artist.id);
    await admin.from("booking_requests").delete().eq("artist_id", artist.id);
    await admin.from("account_overrides").delete().eq("artist_id", artist.id);
    await destroyActor(admin, artist);
  }
});

describe("getArtistFeeSavings against a real schema", () => {
  it("resolves its reads instead of silently reporting zero", async () => {
    const result = await getArtistFeeSavings(artist.id, null);

    // Non-null proves the entitlement gate opened AND neither read errored:
    // both failure paths now return null rather than a fabricated zero, so a
    // null here would mean the query is broken again.
    expect(result).not.toBeNull();

    // FAILS IF the goods select regresses to a column the schema lacks: the
    // read errors, the function returns null above, and if it did not, this
    // is the assertion that a silently-empty goods lane cannot satisfy.
    expect(result!.goodsFeesPaidCents).toBe(
      Math.round(STANDALONE_FEE_EUR * 100),
    );

    // One deposit + one standalone order. Three would mean the coupled order
    // was counted as its own transaction on top of the deposit it belongs to.
    expect(result!.transactionCount).toBe(2);
  });

  it("counts a combined payment's fee once, not once per table", async () => {
    const result = await getArtistFeeSavings(artist.id, null);
    expect(result).not.toBeNull();

    // The deposit lane holds the combined payment's whole fee, because that is
    // the only row Stripe's own application_fee_amount is written to.
    expect(result!.depositFeesPaidCents).toBe(DEPOSIT_FEE_CENTS);

    // FAILS IF the `booking_id IS NULL` filter is dropped: the coupled order's
    // 900 cents would be added a second time, taking the total to 2250.
    expect(result!.totalFeesPaidCents).toBe(
      DEPOSIT_FEE_CENTS + Math.round(STANDALONE_FEE_EUR * 100),
    );
  });
});
