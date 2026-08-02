import { describe, it, expect, vi, beforeEach } from "vitest";

// Reconcile orchestration test (earns `reconciliation_tested`). Rather than
// stub each method return, we back serviceClient with a tiny in-memory store so
// the REAL guardedUpsert convergence loop runs against realistic rows: the
// event-ordering guard, the grandfather-restore-on-downgrade, the orphan stop,
// and the duplicate flag are all exercised, not mocked away. The `.or()` filter
// implements only the one predicate reconcile uses
// (`last_event_created.is.null,last_event_created.lte.N`).

const h = vi.hoisted(() => {
  const store: Record<string, Record<string, unknown>[]> = {
    billing_subscriptions: [],
    account_overrides: [],
  };
  const stripeRetrieve = vi.fn();
  // BDEL-SUB-001: reconcile.ts now checks `profiles` before writing. This
  // in-memory mock has no real `profiles` table, so every artist id used
  // across this file is treated as an EXISTING profile by default (matching
  // every existing test's implicit assumption) unless explicitly listed
  // here as deleted -- the one thing the new deleted-profile tests below
  // actually want to model.
  const deletedProfiles = new Set<string>();

  function qb(table: string) {
    const state: {
      op: string | null;
      payload: Record<string, unknown> | null;
      upsertOpts: { onConflict?: string } | null;
      filters: Array<{
        t: string;
        col: string;
        val?: unknown;
        arr?: unknown[];
      }>;
      orPred: string | null;
      selectOpts: { count?: string; head?: boolean } | undefined;
      single: boolean;
    } = {
      op: null,
      payload: null,
      upsertOpts: null,
      filters: [],
      orPred: null,
      selectOpts: undefined,
      single: false,
    };
    const rows = () => (store[table] ||= []);
    const match = (r: Record<string, unknown>) => {
      for (const f of state.filters) {
        if (f.t === "eq" && r[f.col] !== f.val) return false;
        if (f.t === "neq" && r[f.col] === f.val) return false;
        if (f.t === "in" && !f.arr!.includes(r[f.col])) return false;
      }
      if (state.orPred) {
        const ok = state.orPred.split(",").some((p) => {
          const [col, op, val] = p.split(".");
          const cur = r[col];
          if (op === "is" && val === "null") return cur == null;
          if (op === "lte") return cur != null && Number(cur) <= Number(val);
          return false;
        });
        if (!ok) return false;
      }
      return true;
    };
    const resolve = async () => {
      if (table === "profiles") {
        // No real `profiles` table backs this mock. Only reached via
        // profileExists's `.select("id").eq("id", artistId).maybeSingle()`,
        // so read the id straight off the eq filter and answer from
        // `deletedProfiles` (default: exists -- see the comment above it).
        const idFilter = state.filters.find(
          (f) => f.t === "eq" && f.col === "id",
        );
        const id = idFilter?.val as string | undefined;
        const exists = !!id && !deletedProfiles.has(id);
        return { data: exists ? { id } : null, error: null };
      }
      const rs = rows();
      if (state.op === "update") {
        const matched = rs.filter(match);
        matched.forEach((r) => Object.assign(r, state.payload));
        return { data: matched.map((r) => ({ ...r })), error: null };
      }
      if (state.op === "insert") {
        rs.push({ ...state.payload });
        return { data: null, error: null };
      }
      if (state.op === "upsert") {
        const col = state.upsertOpts?.onConflict as string;
        const ex = rs.find((r) => r[col] === state.payload![col]);
        if (ex) Object.assign(ex, state.payload);
        else rs.push({ ...state.payload });
        return { data: null, error: null };
      }
      const matched = rs.filter(match);
      if (state.selectOpts?.count === "exact" && state.selectOpts?.head) {
        return { count: matched.length, data: null, error: null };
      }
      const data = matched.map((r) => ({ ...r }));
      return state.single
        ? { data: data[0] ?? null, error: null }
        : { data, error: null };
    };
    const builder: Record<string, unknown> = {
      upsert(payload: Record<string, unknown>, opts: { onConflict?: string }) {
        state.op = "upsert";
        state.payload = payload;
        state.upsertOpts = opts;
        return builder;
      },
      update(payload: Record<string, unknown>) {
        state.op = "update";
        state.payload = payload;
        return builder;
      },
      insert(payload: Record<string, unknown>) {
        state.op = "insert";
        state.payload = payload;
        return builder;
      },
      select(_cols: string, opts?: { count?: string; head?: boolean }) {
        if (!state.op) state.op = "select";
        state.selectOpts = opts;
        return builder;
      },
      eq(col: string, val: unknown) {
        state.filters.push({ t: "eq", col, val });
        return builder;
      },
      neq(col: string, val: unknown) {
        state.filters.push({ t: "neq", col, val });
        return builder;
      },
      in(col: string, arr: unknown[]) {
        state.filters.push({ t: "in", col, arr });
        return builder;
      },
      or(str: string) {
        state.orPred = str;
        return builder;
      },
      maybeSingle() {
        state.single = true;
        return resolve();
      },
      then(res: (v: unknown) => unknown, rej: (e: unknown) => unknown) {
        return resolve().then(res, rej);
      },
    };
    return builder;
  }

  return {
    store,
    stripeRetrieve,
    deletedProfiles,
    serviceClient: { from: (t: string) => qb(t) },
  };
});

vi.mock("@/lib/supabase/service", () => ({ serviceClient: h.serviceClient }));
vi.mock("@/lib/server/billing/client", () => ({
  requireStripe: () => ({
    customers: { retrieve: (id: string) => h.stripeRetrieve(id) },
    subscriptions: { retrieve: vi.fn() },
  }),
}));
const mockSentry = vi.hoisted(() => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));
vi.mock("@sentry/nextjs", () => mockSentry);

// Gallery relocation (C1.5) is its OWN module with its own dedicated tests
// (gallery-relocation.test.ts); this file only proves reconcile.ts calls it
// at the right moment with the right artist, not its internal storage logic.
const { mockRelocate, mockRestore } = vi.hoisted(() => ({
  mockRelocate: vi
    .fn()
    .mockResolvedValue({ ok: true, moved: 0, failed: 0, failedPaths: [] }),
  mockRestore: vi
    .fn()
    .mockResolvedValue({ ok: true, moved: 0, failed: 0, failedPaths: [] }),
}));
vi.mock("@/lib/server/gallery-relocation", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/server/gallery-relocation")
  >("@/lib/server/gallery-relocation");
  return {
    ...actual,
    relocateArtistGallery: (...a: unknown[]) => mockRelocate(...a),
    restoreArtistGallery: (...a: unknown[]) => mockRestore(...a),
  };
});

import { reconcileFromStripeSubscription } from "@/lib/server/billing/reconcile";

type SubInput = {
  subId: string;
  status: string;
  customer: string;
  artistId?: string;
  priceId?: string;
  cancelAtPeriodEnd?: boolean;
};

function makeSub(o: SubInput) {
  const periodEnd = Math.floor(Date.now() / 1000) + 3600;
  return {
    id: o.subId,
    status: o.status,
    livemode: false,
    customer: o.customer,
    cancel_at_period_end: o.cancelAtPeriodEnd ?? false,
    current_period_end: periodEnd,
    metadata: o.artistId
      ? { artist_id: o.artistId, contract_customer_type: "business" }
      : {},
    items: {
      data: [
        {
          price: { id: o.priceId ?? "price_plus" },
          current_period_end: periodEnd,
        },
      ],
    },
  } as unknown as import("stripe").Stripe.Subscription;
}

beforeEach(() => {
  h.store.billing_subscriptions = [];
  h.store.account_overrides = [];
  h.deletedProfiles.clear();
  h.stripeRetrieve.mockReset();
  mockRelocate.mockClear();
  mockRestore.mockClear();
  mockSentry.captureMessage.mockClear();
  mockSentry.captureException.mockClear();
});

describe("reconcileFromStripeSubscription", () => {
  it("orphan: no artist_id anywhere stops with no writes", async () => {
    // Neither the subscription nor the customer carries artist_id.
    h.stripeRetrieve.mockResolvedValue({ deleted: false, metadata: {} });
    const r = await reconcileFromStripeSubscription(
      makeSub({ subId: "sub_1", status: "active", customer: "cus_x" }),
      1000,
    );
    expect(r.orphaned).toBe(true);
    expect(r.artistId).toBeNull();
    expect(h.store.billing_subscriptions).toHaveLength(0);
    expect(h.store.account_overrides).toHaveLength(0);
  });

  it("active subscription upgrades the artist to paid Plus", async () => {
    const r = await reconcileFromStripeSubscription(
      makeSub({
        subId: "sub_2",
        status: "active",
        customer: "cus_a",
        artistId: "artist_a",
      }),
      1000,
    );
    expect(r.planTier).toBe("plus");
    expect(r.orphaned).toBe(false);
    expect(r.stale).toBe(false);
    expect(r.duplicate).toBe(false);
    const ov = h.store.account_overrides.find(
      (x) => x.artist_id === "artist_a",
    )!;
    expect(ov.plan_tier).toBe("plus");
    expect(ov.plan_source).toBe("paid");
    expect(ov.last_event_created).toBe(1000);
  });

  it("downgrade RESTORES the grandfather cohort, merges admin overrides, keeps the anchor", async () => {
    // A grandfathered account with an admin decision layered on top.
    h.store.account_overrides.push({
      artist_id: "artist_g",
      policy_id: "legacy_free_v1",
      plan_source: "grandfathered",
      grant_package: {
        features: { custom_templates: true },
        limits: { custom_fields: 30 },
      },
      entitlement_overrides: { branding: true }, // admin decision
      limit_overrides: { active_trips: 7 }, // admin decision
      last_event_created: 500,
    });
    const r = await reconcileFromStripeSubscription(
      makeSub({
        subId: "sub_3",
        status: "canceled",
        customer: "cus_g",
        artistId: "artist_g",
      }),
      1000,
    );
    expect(r.planTier).toBe("free");
    const ov = h.store.account_overrides.find(
      (x) => x.artist_id === "artist_g",
    )!;
    expect(ov.plan_tier).toBe("free");
    expect(ov.plan_source).toBe("grandfathered"); // not bare free
    expect(ov.policy_id).toBe("legacy_free_v1"); // anchor NEVER wiped
    expect(ov.grant_package).toBeTruthy(); // manifest preserved
    // Package base + admin overrides merged (admin wins on conflict).
    expect(
      (ov.entitlement_overrides as Record<string, unknown>).custom_templates,
    ).toBe(true);
    expect((ov.entitlement_overrides as Record<string, unknown>).branding).toBe(
      true,
    );
    expect((ov.limit_overrides as Record<string, unknown>).custom_fields).toBe(
      30,
    );
    expect((ov.limit_overrides as Record<string, unknown>).active_trips).toBe(
      7,
    );
  });

  it("an older (redelivered) event is skipped as stale, leaving newer state intact", async () => {
    // A newer event already wrote billing_subscriptions at ts=2000.
    h.store.billing_subscriptions.push({
      stripe_subscription_id: "sub_4",
      artist_id: "artist_s",
      status: "active",
      last_event_created: 2000,
    });
    const r = await reconcileFromStripeSubscription(
      makeSub({
        subId: "sub_4",
        status: "canceled",
        customer: "cus_s",
        artistId: "artist_s",
      }),
      1000, // older than the stored 2000
    );
    expect(r.stale).toBe(true);
    // The stale event must NOT have derived any account_overrides state.
    expect(h.store.account_overrides).toHaveLength(0);
    // The newer billing_subscriptions state is untouched.
    expect(h.store.billing_subscriptions[0].status).toBe("active");
    expect(h.store.billing_subscriptions[0].last_event_created).toBe(2000);
  });

  it("flags a duplicate when a second active subscription exists for the customer", async () => {
    // An existing active subscription for the same customer.
    h.store.billing_subscriptions.push({
      stripe_subscription_id: "sub_old",
      stripe_customer_id: "cus_d",
      artist_id: "artist_d",
      status: "active",
      last_event_created: 500,
    });
    const r = await reconcileFromStripeSubscription(
      makeSub({
        subId: "sub_new",
        status: "active",
        customer: "cus_d",
        artistId: "artist_d",
      }),
      1000,
    );
    expect(r.duplicate).toBe(true);
  });

  it("a refund posture (unpaid subscription) converges access to free", async () => {
    // A subscription refund does not itself change access: access follows the
    // subscription status via reconcile. Stripe leaves the subscription unpaid
    // (or the artist cancels), and reconcile converges the artist to free.
    const r = await reconcileFromStripeSubscription(
      makeSub({
        subId: "sub_r",
        status: "unpaid",
        customer: "cus_r",
        artistId: "artist_r",
      }),
      1000,
    );
    expect(r.planTier).toBe("free");
    const ov = h.store.account_overrides.find(
      (x) => x.artist_id === "artist_r",
    )!;
    expect(ov.plan_tier).toBe("free");
  });

  // C1.5 (counsel): the billing reconcile is one of the two named entitlement-
  // change hooks that must trigger gallery relocation/restore. These tests
  // prove the WIRING (called, once, with the right artist, at the right
  // transition) — relocateArtistGallery/restoreArtistGallery's own storage
  // logic is covered by gallery-relocation.test.ts.
  describe("C1.5 gallery relocation hook", () => {
    it("relocates on a fresh downgrade to free (never archived before)", async () => {
      await reconcileFromStripeSubscription(
        makeSub({
          subId: "sub_dg",
          status: "canceled",
          customer: "cus_dg",
          artistId: "artist_dg",
        }),
        1000,
      );
      expect(mockRelocate).toHaveBeenCalledTimes(1);
      expect(mockRelocate).toHaveBeenCalledWith("artist_dg");
      expect(mockRestore).not.toHaveBeenCalled();
    });

    it("does NOT relocate again when the artist is already archived", async () => {
      h.store.account_overrides.push({
        artist_id: "artist_already",
        gallery_relocated_at: "2026-07-01T00:00:00.000Z",
        last_event_created: 500,
      });
      await reconcileFromStripeSubscription(
        makeSub({
          subId: "sub_already",
          status: "canceled",
          customer: "cus_already",
          artistId: "artist_already",
        }),
        1000,
      );
      expect(mockRelocate).not.toHaveBeenCalled();
      expect(mockRestore).not.toHaveBeenCalled();
    });

    it("restores on resubscribe when the artist was previously archived", async () => {
      h.store.account_overrides.push({
        artist_id: "artist_resub",
        gallery_relocated_at: "2026-07-01T00:00:00.000Z",
        last_event_created: 500,
      });
      await reconcileFromStripeSubscription(
        makeSub({
          subId: "sub_resub",
          status: "active",
          customer: "cus_resub",
          artistId: "artist_resub",
        }),
        1000,
      );
      expect(mockRestore).toHaveBeenCalledTimes(1);
      expect(mockRestore).toHaveBeenCalledWith("artist_resub");
      expect(mockRelocate).not.toHaveBeenCalled();
    });

    it("touches neither hook for a plain active-to-active upgrade with nothing archived", async () => {
      await reconcileFromStripeSubscription(
        makeSub({
          subId: "sub_plain",
          status: "active",
          customer: "cus_plain",
          artistId: "artist_plain",
        }),
        1000,
      );
      expect(mockRelocate).not.toHaveBeenCalled();
      expect(mockRestore).not.toHaveBeenCalled();
    });

    it("neither hook runs on a stale (redelivered) event", async () => {
      h.store.billing_subscriptions.push({
        stripe_subscription_id: "sub_stale",
        artist_id: "artist_stale",
        status: "active",
        last_event_created: 2000,
      });
      await reconcileFromStripeSubscription(
        makeSub({
          subId: "sub_stale",
          status: "canceled",
          customer: "cus_stale",
          artistId: "artist_stale",
        }),
        1000,
      );
      expect(mockRelocate).not.toHaveBeenCalled();
      expect(mockRestore).not.toHaveBeenCalled();
    });
  });

  // BDEL-SUB-001 (task #59): an artist_id resolved from Stripe metadata can
  // still name a profile that no longer exists (account deletion cancels the
  // subscription in Stripe before deleting the profile, so the cancellation's
  // own customer.subscription.deleted event can arrive after the profile is
  // gone). See tests/db/billing-reconcile-deleted-profile.test.ts for the
  // real-Postgres proof that writing against a deleted profile 23503s; this
  // file proves the orchestration decision (skip both writes; alert only on
  // a live status) against the mock.
  describe("BDEL-SUB-001: the artist_id names a deleted profile", () => {
    it("writes neither table and stays quiet for the routine deletion-cancel echo (terminal status)", async () => {
      h.deletedProfiles.add("artist_gone");
      const r = await reconcileFromStripeSubscription(
        makeSub({
          subId: "sub_gone_echo",
          status: "canceled",
          customer: "cus_gone",
          artistId: "artist_gone",
        }),
        1000,
      );
      expect(r.deletedProfile).toBe(true);
      expect(r.orphaned).toBe(false);
      expect(r.artistId).toBe("artist_gone");
      expect(h.store.billing_subscriptions).toHaveLength(0);
      expect(h.store.account_overrides).toHaveLength(0);
      expect(mockSentry.captureMessage).not.toHaveBeenCalled();
    });

    it("alerts (but still writes nothing) when Stripe still shows a LIVE status against a deleted profile", async () => {
      h.deletedProfiles.add("artist_gone_live");
      const r = await reconcileFromStripeSubscription(
        makeSub({
          subId: "sub_gone_live",
          status: "active",
          customer: "cus_gone_live",
          artistId: "artist_gone_live",
        }),
        1000,
      );
      expect(r.deletedProfile).toBe(true);
      expect(h.store.billing_subscriptions).toHaveLength(0);
      expect(h.store.account_overrides).toHaveLength(0);
      expect(mockSentry.captureMessage).toHaveBeenCalledTimes(1);
      expect(mockSentry.captureMessage).toHaveBeenCalledWith(
        expect.stringContaining("still live"),
        expect.objectContaining({
          tags: { action: "billing_reconcile_deleted_profile" },
          extra: expect.objectContaining({
            artistId: "artist_gone_live",
            status: "active",
          }),
        }),
      );
    });

    it("does not run the gallery relocation hook for a deleted profile", async () => {
      h.deletedProfiles.add("artist_gone_gallery");
      await reconcileFromStripeSubscription(
        makeSub({
          subId: "sub_gone_gallery",
          status: "canceled",
          customer: "cus_gone_gallery",
          artistId: "artist_gone_gallery",
        }),
        1000,
      );
      expect(mockRelocate).not.toHaveBeenCalled();
      expect(mockRestore).not.toHaveBeenCalled();
    });
  });
});
