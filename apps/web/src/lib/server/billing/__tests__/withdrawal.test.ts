import { describe, it, expect, vi, beforeEach } from "vitest";

// withdrawSubscriptionCore: the consumer withdrawal money core. Backed by an
// in-memory store so the REAL proration + refund primitives run; only Stripe,
// the DB, email, and reconcile are mocked. Verifies the statutory-window gate,
// idempotent single-case + single-refund behaviour, the partial refund on
// Inklee's own charge, the downgrade handoff, and the durable acknowledgement.

const h = vi.hoisted(() => {
  const store: Record<string, Record<string, unknown>[]> = {
    billing_subscriptions: [],
    withdrawal_cases: [],
    billing_consent_records: [],
    billing_contract_confirmations: [],
  };
  const stripe = {
    retrieve: vi.fn(),
    cancel: vi.fn(),
    refundCreate: vi.fn(),
    piRetrieve: vi.fn(),
  };
  const getUserById = vi.fn();
  const sendEmail = vi.fn();
  const reconcile = vi.fn();
  let idc = 0;
  const nextId = () => `id_${++idc}`;

  function qb(table: string) {
    const st: {
      op: string | null;
      payload: Record<string, unknown> | Record<string, unknown>[] | null;
      filters: Array<{ t: string; c: string; v?: unknown; arr?: unknown[] }>;
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
      st.filters.every((f) =>
        f.t === "eq"
          ? r[f.c] === f.v
          : f.t === "in"
            ? f.arr!.includes(r[f.c])
            : true,
      );
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
        st.filters.push({ t: "eq", c, v });
        return b;
      },
      in(c: string, arr: unknown[]) {
        st.filters.push({ t: "in", c, arr });
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
    subscriptions: { retrieve: h.stripe.retrieve, cancel: h.stripe.cancel },
    refunds: { create: h.stripe.refundCreate },
    paymentIntents: { retrieve: h.stripe.piRetrieve },
  }),
}));
vi.mock("@/lib/email/send", () => ({ sendEmail: h.sendEmail }));
vi.mock("@/lib/email/booking-templates", () => ({
  buildEmailHtml: () => "<html></html>",
}));
vi.mock("@/lib/server/billing/reconcile", () => ({
  reconcileFromStripeSubscription: h.reconcile,
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { withdrawSubscriptionCore } from "@/lib/server/billing/withdrawal";

const DAY = 86_400_000;
const nowMs = Date.parse("2026-07-24T12:00:00Z");

function makeStripeSub(o: {
  status?: string;
  startDaysAgo: number;
  periodDays?: number;
  amountPaid?: number | null;
  paymentIntent?: string | null;
  charge?: string | null;
}) {
  const start = Math.floor((nowMs - o.startDaysAgo * DAY) / 1000);
  const end = Math.floor(
    (nowMs + (o.periodDays ?? 30 - o.startDaysAgo) * DAY) / 1000,
  );
  const latest_invoice =
    o.amountPaid === null
      ? null
      : {
          amount_paid: o.amountPaid ?? 300,
          currency: "eur",
          payment_intent: o.paymentIntent ?? "pi_1",
          charge: o.charge ?? null,
        };
  return {
    id: "sub_1",
    status: o.status ?? "active",
    start_date: start,
    items: { data: [{ current_period_start: start, current_period_end: end }] },
    latest_invoice,
  };
}

function seedSub() {
  h.store.billing_subscriptions.push({
    id: "bsub_1",
    artist_id: "artist_1",
    stripe_subscription_id: "sub_1",
    status: "active",
    last_reconciled_at: "2026-07-24T00:00:00Z",
  });
}

beforeEach(() => {
  h.store.billing_subscriptions = [];
  h.store.withdrawal_cases = [];
  h.store.billing_consent_records = [];
  h.store.billing_contract_confirmations = [];
  vi.setSystemTime(new Date(nowMs));
  h.stripe.retrieve.mockReset();
  h.stripe.cancel
    .mockReset()
    .mockResolvedValue({ id: "sub_1", status: "canceled" });
  h.stripe.refundCreate.mockReset().mockResolvedValue({ id: "re_1" });
  h.stripe.piRetrieve.mockReset().mockResolvedValue({ latest_charge: "ch_1" });
  h.getUserById.mockReset().mockResolvedValue({
    data: { user: { email: "a@b.co" } },
  });
  h.sendEmail.mockReset().mockResolvedValue(undefined);
  h.reconcile.mockReset().mockResolvedValue({});
});

describe("withdrawSubscriptionCore", () => {
  it("returns no_subscription when the artist has no active subscription", async () => {
    const r = await withdrawSubscriptionCore({ artistId: "artist_1" });
    expect(r.status).toBe("no_subscription");
    expect(h.stripe.cancel).not.toHaveBeenCalled();
  });

  it("returns not_available after the 14-day window (offers cancellation)", async () => {
    seedSub();
    h.stripe.retrieve.mockResolvedValue(makeStripeSub({ startDaysAgo: 30 }));
    const r = await withdrawSubscriptionCore({ artistId: "artist_1" });
    expect(r.status).toBe("not_available");
    expect(h.store.withdrawal_cases).toHaveLength(0);
    expect(h.stripe.refundCreate).not.toHaveBeenCalled();
    expect(h.stripe.cancel).not.toHaveBeenCalled();
  });

  it("mid-period with immediate performance: prorated partial refund on Inklee's charge, then downgrade", async () => {
    seedSub();
    h.store.billing_consent_records.push({
      id: "ipc_1",
      artist_id: "artist_1",
      consent_type: "immediate_performance_request",
      consented_at: "2026-07-19T12:00:00Z",
    });
    // start 5 days ago, 30-day period -> used 5/30 -> retain 50, refund 250.
    h.stripe.retrieve.mockResolvedValue(
      makeStripeSub({ startDaysAgo: 5, periodDays: 25 }),
    );
    const r = await withdrawSubscriptionCore({ artistId: "artist_1" });
    expect(r.status).toBe("completed");
    if (r.status !== "completed") return;
    expect(r.refundMinor).toBe(250);
    // Refund on Inklee's OWN charge (resolved from the payment intent), correct amount.
    expect(h.stripe.piRetrieve).toHaveBeenCalledWith("pi_1");
    const refundArgs = h.stripe.refundCreate.mock.calls[0][0];
    expect(refundArgs.charge).toBe("ch_1");
    expect(refundArgs.amount).toBe(250);
    // Never a reverse_transfer / application-fee refund.
    expect(refundArgs).not.toHaveProperty("reverse_transfer");
    expect(refundArgs).not.toHaveProperty("refund_application_fee");
    // Downgrade handed to the shared reconcile.
    expect(h.stripe.cancel).toHaveBeenCalledTimes(1);
    expect(h.reconcile).toHaveBeenCalledTimes(1);
    // Case completed; withdrawal_ack recorded; durable confirmation created.
    expect(h.store.withdrawal_cases[0].state).toBe("completed");
    expect(
      h.store.billing_consent_records.some(
        (c) => c.consent_type === "withdrawal_ack",
      ),
    ).toBe(true);
    expect(h.store.billing_contract_confirmations).toHaveLength(1);
    expect(h.sendEmail).toHaveBeenCalledTimes(1);
  });

  it("without an immediate-performance request: FULL refund", async () => {
    seedSub();
    h.stripe.retrieve.mockResolvedValue(
      makeStripeSub({ startDaysAgo: 5, periodDays: 25 }),
    );
    const r = await withdrawSubscriptionCore({ artistId: "artist_1" });
    expect(r.status).toBe("completed");
    if (r.status !== "completed") return;
    expect(r.refundMinor).toBe(300);
    expect(h.stripe.refundCreate.mock.calls[0][0].amount).toBe(300);
  });

  it("is idempotent: an existing refunded case does not refund twice", async () => {
    seedSub();
    h.store.withdrawal_cases.push({
      id: "wc_1",
      billing_subscription_id: "bsub_1",
      artist_id: "artist_1",
      state: "refund_pending",
      received_at: "2026-07-24T12:00:00Z",
      refund_minor: 250,
      stripe_refund_id: "re_existing",
    });
    h.stripe.retrieve.mockResolvedValue(
      makeStripeSub({ startDaysAgo: 5, periodDays: 25 }),
    );
    const r = await withdrawSubscriptionCore({ artistId: "artist_1" });
    expect(r.status).toBe("completed");
    // The refund was already issued; do not create another.
    expect(h.stripe.refundCreate).not.toHaveBeenCalled();
    expect(h.stripe.cancel).toHaveBeenCalledTimes(1);
    expect(h.store.withdrawal_cases).toHaveLength(1);
  });

  it("a completed case returns immediately with no side effects", async () => {
    seedSub();
    h.store.withdrawal_cases.push({
      id: "wc_1",
      billing_subscription_id: "bsub_1",
      artist_id: "artist_1",
      state: "completed",
      received_at: "2026-07-24T12:00:00Z",
      refund_minor: 250,
      stripe_refund_id: "re_1",
    });
    h.stripe.retrieve.mockResolvedValue(
      makeStripeSub({ startDaysAgo: 5, periodDays: 25 }),
    );
    const r = await withdrawSubscriptionCore({ artistId: "artist_1" });
    expect(r.status).toBe("completed");
    expect(h.stripe.refundCreate).not.toHaveBeenCalled();
    expect(h.stripe.cancel).not.toHaveBeenCalled();
  });

  it("nothing paid (trial): no refund, still cancels + downgrades", async () => {
    seedSub();
    h.store.billing_consent_records.push({
      id: "ipc_1",
      artist_id: "artist_1",
      consent_type: "immediate_performance_request",
      consented_at: "2026-07-19T12:00:00Z",
    });
    h.stripe.retrieve.mockResolvedValue(
      makeStripeSub({ startDaysAgo: 5, periodDays: 25, amountPaid: 0 }),
    );
    const r = await withdrawSubscriptionCore({ artistId: "artist_1" });
    expect(r.status).toBe("completed");
    if (r.status !== "completed") return;
    expect(r.refundMinor).toBe(0);
    expect(h.stripe.refundCreate).not.toHaveBeenCalled();
    expect(h.stripe.cancel).toHaveBeenCalledTimes(1);
  });
});
