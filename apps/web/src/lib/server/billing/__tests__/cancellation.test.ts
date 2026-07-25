import { describe, it, expect, vi, beforeEach } from "vitest";

// cancelSubscriptionCore: ordinary § 312k cancellation (Kündigung), distinct from
// the Art. 11a withdrawal. Verifies it ends the subscription at period end (no
// refund), is idempotent when already scheduled, sends the durable confirmation
// stating the effective date, and never touches the refund path.

const h = vi.hoisted(() => {
  const store: Record<string, Record<string, unknown>[]> = {
    billing_subscriptions: [],
    account_overrides: [],
    billing_contract_confirmations: [],
  };
  const stripe = { retrieve: vi.fn(), update: vi.fn() };
  const getUserById = vi.fn();
  const sendEmail = vi.fn();
  const reconcile = vi.fn();
  let idc = 0;
  const nextId = () => `id_${++idc}`;

  function qb(table: string) {
    const st: {
      op: string | null;
      payload: Record<string, unknown> | Record<string, unknown>[] | null;
      filters: Array<{ c: string; v: unknown }>;
      order: { col: string; asc: boolean } | null;
      limit: number | null;
      selectAfter: boolean;
    } = {
      op: null,
      payload: null,
      filters: [],
      order: null,
      limit: null,
      selectAfter: false,
    };
    const rows = () => (store[table] ||= []);
    const match = (r: Record<string, unknown>) =>
      st.filters.every((f) => r[f.c] === f.v);
    const selectRows = () => {
      let rs = rows().filter(match);
      if (st.order) {
        const { col, asc } = st.order;
        rs = [...rs].sort((a, b) => {
          const av = a[col] as string;
          const bv = b[col] as string;
          if (av === bv) return 0;
          return (av > bv ? 1 : -1) * (asc ? 1 : -1);
        });
      }
      if (st.limit != null) rs = rs.slice(0, st.limit);
      return rs;
    };
    async function resolve(single: boolean) {
      if (st.op === "insert") {
        const payload = Array.isArray(st.payload) ? st.payload : [st.payload!];
        const inserted = payload.map((r) => {
          const row = { id: (r.id as string) ?? nextId(), ...r };
          rows().push(row);
          return row;
        });
        const data = st.selectAfter ? inserted.map((r) => ({ ...r })) : null;
        return { data: single ? (data?.[0] ?? null) : data, error: null };
      }
      if (st.op === "update") {
        rows()
          .filter(match)
          .forEach((r) => Object.assign(r, st.payload));
        return { data: null, error: null };
      }
      const rs = selectRows().map((r) => ({ ...r }));
      return { data: single ? (rs[0] ?? null) : rs, error: null };
    }
    const b: Record<string, unknown> = {
      select() {
        if (!st.op) st.op = "select";
        if (st.op === "insert") st.selectAfter = true;
        return b;
      },
      eq(c: string, v: unknown) {
        st.filters.push({ c, v });
        return b;
      },
      order(col: string, opts?: { ascending?: boolean }) {
        st.order = { col, asc: opts?.ascending !== false };
        return b;
      },
      limit(n: number) {
        st.limit = n;
        return b;
      },
      insert(row: Record<string, unknown> | Record<string, unknown>[]) {
        st.op = "insert";
        st.payload = row;
        return b;
      },
      update(row: Record<string, unknown>) {
        st.op = "update";
        st.payload = row;
        return b;
      },
      maybeSingle() {
        return resolve(true);
      },
      then(res: (v: unknown) => unknown, rej: (e: unknown) => unknown) {
        return resolve(false).then(res, rej);
      },
    };
    return b;
  }

  return {
    store,
    stripe,
    getUserById,
    sendEmail,
    reconcile,
    serviceClient: {
      from: (t: string) => qb(t),
      auth: { admin: { getUserById: (id: string) => getUserById(id) } },
    },
  };
});

vi.mock("@/lib/supabase/service", () => ({ serviceClient: h.serviceClient }));
vi.mock("@/lib/server/billing/client", () => ({
  requireStripe: () => ({
    subscriptions: { retrieve: h.stripe.retrieve, update: h.stripe.update },
  }),
}));
vi.mock("@/lib/email/send", () => ({ sendEmail: h.sendEmail }));
vi.mock("@/lib/email/booking-templates", () => ({
  buildEmailHtml: (body: string) => body,
}));
vi.mock("@/lib/server/billing/reconcile", () => ({
  reconcileFromStripeSubscription: h.reconcile,
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import {
  cancelSubscriptionCore,
  getSubscriptionCancellationInfo,
} from "@/lib/server/billing/cancellation";

const periodEndSecs = Math.floor(Date.parse("2026-08-20T00:00:00Z") / 1000);

function seedSub() {
  h.store.billing_subscriptions.push({
    id: "bsub_1",
    artist_id: "artist_1",
    stripe_subscription_id: "sub_1",
    status: "active",
    last_reconciled_at: "2026-07-24T00:00:00Z",
  });
}

function makeSub(o: { status?: string; cancelAtPeriodEnd?: boolean }) {
  return {
    id: "sub_1",
    status: o.status ?? "active",
    cancel_at_period_end: o.cancelAtPeriodEnd ?? false,
    current_period_end: periodEndSecs,
    items: { data: [{ current_period_end: periodEndSecs }] },
  };
}

beforeEach(() => {
  h.store.billing_subscriptions = [];
  h.store.account_overrides = [];
  h.store.billing_contract_confirmations = [];
  h.stripe.retrieve.mockReset();
  h.stripe.update
    .mockReset()
    .mockResolvedValue(makeSub({ cancelAtPeriodEnd: true }));
  h.getUserById
    .mockReset()
    .mockResolvedValue({ data: { user: { email: "a@b.co" } } });
  h.sendEmail.mockReset().mockResolvedValue(undefined);
  h.reconcile.mockReset().mockResolvedValue({});
});

describe("cancelSubscriptionCore", () => {
  it("returns no_subscription when there is none", async () => {
    const r = await cancelSubscriptionCore({ artistId: "artist_1" });
    expect(r.status).toBe("no_subscription");
    expect(h.stripe.update).not.toHaveBeenCalled();
  });

  it("returns not_active for an already-canceled subscription", async () => {
    seedSub();
    h.stripe.retrieve.mockResolvedValue(makeSub({ status: "canceled" }));
    const r = await cancelSubscriptionCore({ artistId: "artist_1" });
    expect(r.status).toBe("not_active");
    expect(h.stripe.update).not.toHaveBeenCalled();
  });

  it("is idempotent when cancellation is already scheduled (no re-update, no email)", async () => {
    seedSub();
    h.stripe.retrieve.mockResolvedValue(makeSub({ cancelAtPeriodEnd: true }));
    const r = await cancelSubscriptionCore({ artistId: "artist_1" });
    expect(r.status).toBe("already_scheduled");
    expect(h.stripe.update).not.toHaveBeenCalled();
    expect(h.sendEmail).not.toHaveBeenCalled();
  });

  it("schedules cancellation at period end, reconciles, and confirms on a durable medium", async () => {
    seedSub();
    h.stripe.retrieve.mockResolvedValue(makeSub({ cancelAtPeriodEnd: false }));
    const r = await cancelSubscriptionCore({ artistId: "artist_1" });
    expect(r.status).toBe("scheduled");
    if (r.status !== "scheduled") return;
    expect(r.effectiveAt).toBe(new Date(periodEndSecs * 1000).toISOString());
    // Ordinary termination at period end, NOT an immediate cancel.
    expect(h.stripe.update).toHaveBeenCalledTimes(1);
    expect(h.stripe.update.mock.calls[0][1]).toEqual({
      cancel_at_period_end: true,
    });
    expect(h.reconcile).toHaveBeenCalledTimes(1);
    // Durable confirmation: states receipt + the effective date, no refund.
    expect(h.sendEmail).toHaveBeenCalledTimes(1);
    const call = h.sendEmail.mock.calls[0][0];
    expect(call.subject).toBe("Your Inklee Plus cancellation is confirmed");
    expect(call.html).toContain("We received your cancellation on");
    expect(call.html).toContain("will end on");
    expect(call.html).toContain("confirmation of receipt on a durable medium");
    expect(h.store.billing_contract_confirmations).toHaveLength(1);
  });
});

describe("getSubscriptionCancellationInfo", () => {
  it("reports an active subscription + effective date from account_overrides (no Stripe call)", async () => {
    h.store.account_overrides.push({
      artist_id: "artist_1",
      subscription_status: "active",
      current_period_end: "2026-08-20T00:00:00Z",
      cancel_at_period_end: false,
    });
    const info = await getSubscriptionCancellationInfo("artist_1");
    expect(info.hasActiveSubscription).toBe(true);
    expect(info.effectiveAt).toBe("2026-08-20T00:00:00Z");
    expect(info.alreadyScheduled).toBe(false);
    expect(h.stripe.retrieve).not.toHaveBeenCalled();
  });

  it("reports no active subscription when the status is not live", async () => {
    h.store.account_overrides.push({
      artist_id: "artist_1",
      subscription_status: "canceled",
      current_period_end: null,
      cancel_at_period_end: false,
    });
    const info = await getSubscriptionCancellationInfo("artist_1");
    expect(info.hasActiveSubscription).toBe(false);
  });
});
