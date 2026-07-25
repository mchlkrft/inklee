import { describe, it, expect, vi, beforeEach } from "vitest";

// writeWithdrawalCreditNote: the append-only credit-note tax snapshot written on
// a withdrawal refund. Backed by an in-memory store so the REAL treatment
// derivation (taxClassFor + the policy's rules) and the REAL content hash run;
// only the DB and Sentry are mocked. Verifies negative amounts, the copy-from-
// charge path, the derive-from-policy path, idempotency, and the best-effort
// (never throw) contract.

const h = vi.hoisted(() => {
  const store: Record<string, Record<string, unknown>[]> = {
    transaction_tax_snapshots: [],
    tax_policies: [],
    account_billing_profiles: [],
  };
  let idc = 0;
  const nextId = () => `snap_${++idc}`;

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
      maybeSingle() {
        return resolve(true);
      },
      then(res: (v: unknown) => unknown, rej: (e: unknown) => unknown) {
        return resolve(false).then(res, rej);
      },
    };
    return b;
  }

  return { store, serviceClient: { from: (t: string) => qb(t) } };
});

vi.mock("@/lib/supabase/service", () => ({ serviceClient: h.serviceClient }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { writeWithdrawalCreditNote } from "@/lib/server/billing/tax-snapshot";

const BASE = {
  artistId: "artist_1",
  billingSubscriptionId: "bsub_1",
  stripeCustomerId: "cus_1",
  stripeSubscriptionId: "sub_1",
  stripeInvoiceId: "in_1",
  stripePaymentIntentId: "pi_1",
  stripeChargeId: "ch_1",
  refundNetMinor: 300,
  refundVatMinor: 0,
  refundGrossMinor: 300,
  taxRate: 0,
  currency: "eur",
  contractCustomerType: "consumer",
};

function seedPolicy() {
  h.store.tax_policies.push({
    id: "tp_1",
    version_label: "ee-unregistered-v2",
    seller_country: "EE",
    seller_vat_registered: false,
    is_current: true,
    treatment_rules: {
      estonian: { treatment: "small_business_exemption", reverseCharge: false },
      eu_consumer: {
        treatment: "cross_border_sme_exemption",
        reverseCharge: false,
      },
    },
  });
}

beforeEach(() => {
  h.store.transaction_tax_snapshots = [];
  h.store.tax_policies = [];
  h.store.account_billing_profiles = [];
});

describe("writeWithdrawalCreditNote", () => {
  it("returns null and writes nothing when nothing is credited", async () => {
    seedPolicy();
    const id = await writeWithdrawalCreditNote({
      ...BASE,
      refundGrossMinor: 0,
    });
    expect(id).toBeNull();
    expect(h.store.transaction_tax_snapshots).toHaveLength(0);
  });

  it("best-effort: no current tax policy -> null, no row, no throw", async () => {
    const id = await writeWithdrawalCreditNote(BASE);
    expect(id).toBeNull();
    expect(h.store.transaction_tax_snapshots).toHaveLength(0);
  });

  it("derive path: writes a credit_note with NEGATIVE amounts and the policy-derived treatment", async () => {
    seedPolicy();
    h.store.account_billing_profiles.push({
      artist_id: "artist_1",
      contract_customer_type: "consumer",
      vat_customer_status: "private_non_taxable",
      billing_country: "DE",
    });
    const id = await writeWithdrawalCreditNote(BASE);
    expect(id).not.toBeNull();
    expect(h.store.transaction_tax_snapshots).toHaveLength(1);
    const row = h.store.transaction_tax_snapshots[0];
    expect(row.kind).toBe("credit_note");
    expect(row.gross_minor).toBe(-300);
    expect(row.net_minor).toBe(-300);
    expect(row.vat_minor).toBe(-0);
    expect(row.corrects_snapshot_id).toBeNull();
    // DE consumer -> the policy's eu_consumer rule.
    expect(row.tax_treatment).toBe("cross_border_sme_exemption");
    expect(row.tax_policy_version).toBe("ee-unregistered-v2");
    expect(row.seller_country).toBe("EE");
    expect(row.seller_vat_registered).toBe(false);
    expect(String(row.content_hash)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("preserves the net/VAT split (negated) when a rate applied", async () => {
    seedPolicy();
    const id = await writeWithdrawalCreditNote({
      ...BASE,
      refundNetMinor: 200,
      refundVatMinor: 50,
      refundGrossMinor: 250,
      taxRate: 0.25,
    });
    expect(id).not.toBeNull();
    const row = h.store.transaction_tax_snapshots[0];
    expect(row.net_minor).toBe(-200);
    expect(row.vat_minor).toBe(-50);
    expect(row.gross_minor).toBe(-250);
    expect(row.tax_rate).toBe(0.25);
  });

  it("copy path: copies treatment + jurisdiction from the original charge snapshot and links it", async () => {
    seedPolicy();
    h.store.transaction_tax_snapshots.push({
      id: "charge_1",
      kind: "charge",
      billing_subscription_id: "bsub_1",
      artist_id: "artist_1",
      tax_treatment: "domestic_standard",
      tax_jurisdiction: "EE",
      tax_rate: 0.22,
      tax_code: "txcd_1",
      reverse_charge_applied: false,
      oss_included: false,
      price_tax_behavior: "exclusive",
      tax_policy_version: "ee-registered-v9",
      classification_version: "class-v1",
      seller_country: "EE",
      seller_vat_registered: true,
      customer_country: "EE",
      contract_customer_type: "consumer",
      vat_customer_status: "private_non_taxable",
      vies_state: "not_submitted",
      created_at: "2026-07-20T00:00:00Z",
    });
    const id = await writeWithdrawalCreditNote(BASE);
    expect(id).not.toBeNull();
    const cn = h.store.transaction_tax_snapshots.find(
      (r) => r.kind === "credit_note",
    )!;
    expect(cn.corrects_snapshot_id).toBe("charge_1");
    expect(cn.tax_treatment).toBe("domestic_standard");
    expect(cn.tax_jurisdiction).toBe("EE");
    expect(cn.tax_rate).toBe(0.22);
    expect(cn.price_tax_behavior).toBe("exclusive");
    expect(cn.tax_policy_version).toBe("ee-registered-v9");
    // amounts still come from the refund split, negated.
    expect(cn.gross_minor).toBe(-300);
  });

  it("idempotent: an existing credit_note for the charge is returned, not duplicated", async () => {
    seedPolicy();
    h.store.transaction_tax_snapshots.push({
      id: "cn_existing",
      kind: "credit_note",
      stripe_charge_id: "ch_1",
      billing_subscription_id: "bsub_1",
    });
    const id = await writeWithdrawalCreditNote(BASE);
    expect(id).toBe("cn_existing");
    expect(
      h.store.transaction_tax_snapshots.filter((r) => r.kind === "credit_note"),
    ).toHaveLength(1);
  });
});
