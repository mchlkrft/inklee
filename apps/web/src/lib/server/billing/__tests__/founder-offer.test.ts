import { describe, it, expect, vi, beforeEach } from "vitest";

// The founder offer's eligibility rules (founder direction 2026-07-28): first
// 100 eligible subscribers, six-month window, yearly only, one per account,
// non-transferable. Fails CLOSED, because wrongly granting a capped
// lifetime-priced discount is unrecoverable while wrongly withholding it is a
// support conversation.

const tables: Record<string, { rows: unknown[]; error?: { message: string } }> =
  {};

function qb(table: string) {
  const state = tables[table] ?? { rows: [] };
  // Filters must actually apply: the "already redeemed" check is an eq on
  // artist_id, and a mock that ignored it would make every artist look like a
  // repeat redeemer (which is exactly what it did on the first run).
  const filters: Array<[string, unknown]> = [];
  const matching = () =>
    (state.rows as Record<string, unknown>[]).filter((r) =>
      filters.every(([c, v]) => r[c] === v),
    );
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.limit = () => chain;
  chain.eq = (c: string, v: unknown) => {
    filters.push([c, v]);
    return chain;
  };
  chain.maybeSingle = async () => ({
    data: state.error ? null : (matching()[0] ?? null),
    error: state.error ?? null,
  });
  chain.insert = (row: Record<string, unknown>) => {
    const conflict = (state.rows as Record<string, unknown>[]).some(
      (r) =>
        r.artist_id === row.artist_id ||
        r.cohort_position === row.cohort_position,
    );
    if (conflict) return Promise.resolve({ error: { code: "23505" } });
    state.rows.push(row);
    return Promise.resolve({ error: null });
  };
  chain.then = (resolve: (v: unknown) => unknown) => {
    const rows = matching();
    return resolve({
      data: state.error ? null : rows,
      error: state.error ?? null,
      // The cap count is unfiltered by design (it counts the whole cohort),
      // and that call carries no eq, so `matching()` is the full set there.
      count: state.error ? null : rows.length,
    });
  };
  return chain;
}

vi.mock("@/lib/supabase/service", () => ({
  serviceClient: { from: (t: string) => qb(t) },
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import {
  resolveFounderOffer,
  recordFounderOfferRedemption,
  FOUNDER_OFFER_POLICY_VERSION,
} from "@/lib/server/billing/founder-offer";

const YEAR = 365 * 24 * 60 * 60 * 1000;

function openPolicy(over: Record<string, unknown> = {}) {
  tables["founder_offer_policy"] = {
    rows: [
      {
        // The lookup filters on policy_version, so the fixture must carry it.
        policy_version: FOUNDER_OFFER_POLICY_VERSION,
        starts_at: new Date(Date.now() - YEAR / 12).toISOString(),
        ends_at: new Date(Date.now() + YEAR / 12).toISOString(),
        max_redemptions: 100,
        ...over,
      },
    ],
  };
}

function redemptions(n: number, artistIds: string[] = []) {
  tables["founder_offer_redemptions"] = {
    rows: Array.from({ length: n }, (_, i) => ({
      artist_id: artistIds[i] ?? `other-${i}`,
      cohort_position: i + 1,
    })),
  };
}

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k];
  redemptions(0);
});

describe("resolveFounderOffer", () => {
  it("the FIRST eligible subscriber gets position 1", async () => {
    openPolicy();
    const r = await resolveFounderOffer({
      artistId: "a1",
      billingInterval: "yearly",
    });
    expect(r).toMatchObject({ eligible: true, cohortPosition: 1 });
  });

  it("the 100th subscriber is eligible", async () => {
    openPolicy();
    redemptions(99);
    const r = await resolveFounderOffer({
      artistId: "a1",
      billingInterval: "yearly",
    });
    expect(r).toMatchObject({ eligible: true, cohortPosition: 100 });
  });

  it("the 101st is refused: cohort full", async () => {
    openPolicy();
    redemptions(100);
    const r = await resolveFounderOffer({
      artistId: "a1",
      billingInterval: "yearly",
    });
    expect(r).toMatchObject({ eligible: false, reason: "cohort_full" });
  });

  it("refuses after the enrollment deadline", async () => {
    openPolicy({ ends_at: new Date(Date.now() - 1000).toISOString() });
    const r = await resolveFounderOffer({
      artistId: "a1",
      billingInterval: "yearly",
    });
    expect(r).toMatchObject({ eligible: false, reason: "window_closed" });
  });

  it("refuses before the window opens", async () => {
    openPolicy({ starts_at: new Date(Date.now() + 1000).toISOString() });
    const r = await resolveFounderOffer({
      artistId: "a1",
      billingInterval: "yearly",
    });
    expect(r).toMatchObject({ eligible: false, reason: "window_not_started" });
  });

  it("refuses monthly outright", async () => {
    openPolicy();
    const r = await resolveFounderOffer({
      artistId: "a1",
      billingInterval: "monthly",
    });
    expect(r).toMatchObject({ eligible: false, reason: "not_yearly" });
  });

  it("refuses an account that already redeemed (non-transferable, no requalify)", async () => {
    openPolicy();
    redemptions(1, ["a1"]);
    const r = await resolveFounderOffer({
      artistId: "a1",
      billingInterval: "yearly",
    });
    expect(r).toMatchObject({ eligible: false, reason: "already_subscribed" });
  });

  it("a CANCELLED founder subscription does not free the slot", async () => {
    // The redemption row is the record, not the live subscription: cancelling
    // must not return a capped slot to the pool or let the account requalify.
    openPolicy();
    redemptions(1, ["a1"]);
    const again = await resolveFounderOffer({
      artistId: "a1",
      billingInterval: "yearly",
    });
    expect(again.eligible).toBe(false);
  });

  it("fails CLOSED when the offer was never opened (no policy row)", async () => {
    const r = await resolveFounderOffer({
      artistId: "a1",
      billingInterval: "yearly",
    });
    expect(r).toMatchObject({ eligible: false, reason: "window_not_started" });
  });

  it("fails CLOSED on a lookup error", async () => {
    tables["founder_offer_policy"] = { rows: [], error: { message: "boom" } };
    const r = await resolveFounderOffer({
      artistId: "a1",
      billingInterval: "yearly",
    });
    expect(r).toMatchObject({ eligible: false, reason: "lookup_failed" });
  });
});

describe("recordFounderOfferRedemption", () => {
  it("records a winner", async () => {
    redemptions(0);
    const ok = await recordFounderOfferRedemption({
      artistId: "a1",
      stripeCustomerId: "cus_1",
      cohortPosition: 1,
      reason: "eligible",
    });
    expect(ok).toBe(true);
  });

  it("CONCURRENT final redemptions: exactly one wins the same position", async () => {
    redemptions(99);
    const first = await recordFounderOfferRedemption({
      artistId: "a1",
      stripeCustomerId: null,
      cohortPosition: 100,
      reason: "eligible",
    });
    const second = await recordFounderOfferRedemption({
      artistId: "a2",
      stripeCustomerId: null,
      cohortPosition: 100,
      reason: "eligible",
    });
    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  it("a duplicate checkout for the same artist cannot double-record", async () => {
    redemptions(0);
    await recordFounderOfferRedemption({
      artistId: "a1",
      stripeCustomerId: null,
      cohortPosition: 1,
      reason: "eligible",
    });
    const again = await recordFounderOfferRedemption({
      artistId: "a1",
      stripeCustomerId: null,
      cohortPosition: 2,
      reason: "eligible",
    });
    expect(again).toBe(false);
  });
});
