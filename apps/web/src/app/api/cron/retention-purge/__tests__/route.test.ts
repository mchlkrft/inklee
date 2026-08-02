import { describe, it, expect, vi, beforeEach } from "vitest";

// This route used to be eight sequential blocks, each `return`ing a 500 the
// instant its own delete errored — which meant blocks after the failing one
// never ran, with no retry until the next scheduled invocation (found
// 2026-08-02 while adding the C1.4 guest-shop steps; the file had zero tests
// before this one). The fix wraps every step independently: one step's
// error is captured and reported, but every OTHER step still runs. This file
// proves exactly that property, plus that the C1.4 shop-retention steps
// (mocked wholesale here — their own correctness is DB-tested in
// tests/db/shop-retention-purge.test.ts) merge into the same response shape.

const {
  mockCaptureException,
  mockRunShopRetentionPurges,
  mockRunBillingRecordRetentionPurges,
} = vi.hoisted(() => ({
  mockCaptureException: vi.fn(),
  mockRunShopRetentionPurges: vi.fn(),
  mockRunBillingRecordRetentionPurges: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({
  captureException: (...a: unknown[]) => mockCaptureException(...a),
}));
vi.mock("@/lib/server/shop-retention", () => ({
  runShopRetentionPurges: (...a: unknown[]) => mockRunShopRetentionPurges(...a),
}));
// BDEL-RET-002: mocked wholesale here — their own correctness (including the
// FK dependency ordering) is DB-tested in
// tests/db/billing-record-retention-purge.test.ts.
vi.mock("@/lib/server/billing-record-retention", () => ({
  runBillingRecordRetentionPurges: (...a: unknown[]) =>
    mockRunBillingRecordRetentionPurges(...a),
}));

type Reply = { data?: unknown; error?: unknown };

const tableReplies = new Map<string, Reply>();

function deleteChain(table: string) {
  const self: Record<string, unknown> = {
    is: () => self,
    eq: () => self,
    lt: () => self,
    select: () =>
      Promise.resolve(tableReplies.get(table) ?? { data: [], error: null }),
  };
  return self;
}

vi.mock("@/lib/supabase/service", () => ({
  serviceClient: {
    from: (table: string) => ({
      delete: () => deleteChain(table),
    }),
  },
}));

import { GET } from "../route";

function req() {
  return new Request("https://inkl.ee/api/cron/retention-purge", {
    headers: { authorization: "Bearer test-secret" },
  });
}

const SHOP_STEPS_ALL_OK = {
  purged_cancelled_standalone_order_emails: { ok: true as const, count: 0 },
  purged_completed_standalone_order_emails: { ok: true as const, count: 0 },
  purged_abandoned_carts: { ok: true as const, count: 0 },
  purged_inactive_wishlist_items: { ok: true as const, count: 0 },
};

const BILLING_STEPS_ALL_OK = {
  purged_deleted_account_withdrawal_cases: { ok: true as const, count: 0 },
  purged_deleted_account_billing_contract_confirmations: {
    ok: true as const,
    count: 0,
  },
  purged_deleted_account_billing_consent_records: {
    ok: true as const,
    count: 0,
  },
  purged_deleted_account_billing_subscriptions: { ok: true as const, count: 0 },
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "test-secret";
  tableReplies.clear();
  mockRunShopRetentionPurges.mockResolvedValue(SHOP_STEPS_ALL_OK);
  mockRunBillingRecordRetentionPurges.mockResolvedValue(BILLING_STEPS_ALL_OK);
});

describe("retention-purge sequencing: every step is independent", () => {
  it("a failing early step does not prevent later steps from running or being reported", async () => {
    tableReplies.set("deleted_account_records", {
      data: [{ id: "1" }],
      error: null,
    });
    tableReplies.set("audit_log", { data: [{ id: "2" }], error: null });
    // Step 3 (of the original eight) fails.
    tableReplies.set("admin_action_log", {
      data: null,
      error: { message: "connection reset" },
    });
    tableReplies.set("analytics_events", { data: [{ id: "3" }], error: null });
    tableReplies.set("artist_activity_days", {
      data: [{ artist_id: "4" }],
      error: null,
    });
    tableReplies.set("web_analytics_events", {
      data: [{ id: "5" }],
      error: null,
    });
    tableReplies.set("wa_visits_daily", {
      data: [{ day: "2020-01-01" }],
      error: null,
    });
    tableReplies.set("wa_visit_rollup_days", {
      data: [{ day: "2020-01-01" }],
      error: null,
    });
    tableReplies.set("map_reports", { data: [{ id: "6" }], error: null });

    const res = await GET(req());
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(500);
    expect(body.purged_financial_records).toBe(1);
    expect(body.purged_audit_rows).toBe(1);
    expect(body.purged_admin_rows).toBeUndefined(); // the failed step is omitted, not zeroed

    // The whole point: every step scheduled AFTER the failing one still ran.
    expect(body.purged_analytics_events).toBe(1);
    expect(body.purged_activity_days).toBe(1);
    expect(body.purged_web_analytics_events).toBe(1);
    expect(body.purged_wa_visits).toBe(1);
    expect(body.purged_wa_rollup_days).toBe(1);
    expect(body.purged_map_reports).toBe(1);

    expect(body.errors).toEqual([
      { step: "purged_admin_rows", error: "connection reset" },
    ]);
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "connection reset" }),
      expect.objectContaining({
        tags: expect.objectContaining({ step: "admin_action_log" }),
      }),
    );
  });

  it("returns 200 with every count when every step succeeds", async () => {
    const res = await GET(req());
    const body = (await res.json()) as Record<string, unknown>;
    expect(res.status).toBe(200);
    expect(body.errors).toBeUndefined();
    expect(body.purged_financial_records).toBe(0);
    expect(body.purged_map_reports).toBe(0);
    expect(body.purged_cancelled_standalone_order_emails).toBe(0);
  });

  it("merges a C1.4 shop-retention step failure into the same error list without blocking the others", async () => {
    mockRunShopRetentionPurges.mockResolvedValue({
      purged_cancelled_standalone_order_emails: {
        ok: false,
        error: "boom",
      },
      purged_completed_standalone_order_emails: { ok: true, count: 2 },
      purged_abandoned_carts: { ok: true, count: 0 },
      purged_inactive_wishlist_items: { ok: true, count: 0 },
    });

    const res = await GET(req());
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(500);
    expect(body.purged_completed_standalone_order_emails).toBe(2);
    expect(body.purged_cancelled_standalone_order_emails).toBeUndefined();
    expect(body.errors).toEqual(
      expect.arrayContaining([
        { step: "purged_cancelled_standalone_order_emails", error: "boom" },
      ]),
    );
  });

  it("merges a BDEL-RET-002 billing-record-retention step failure into the same error list without blocking the others", async () => {
    mockRunBillingRecordRetentionPurges.mockResolvedValue({
      purged_deleted_account_withdrawal_cases: { ok: false, error: "boom" },
      purged_deleted_account_billing_contract_confirmations: {
        ok: true,
        count: 3,
      },
      purged_deleted_account_billing_consent_records: { ok: true, count: 0 },
      purged_deleted_account_billing_subscriptions: { ok: true, count: 0 },
    });

    const res = await GET(req());
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(500);
    expect(body.purged_deleted_account_billing_contract_confirmations).toBe(3);
    expect(body.purged_deleted_account_withdrawal_cases).toBeUndefined();
    expect(body.errors).toEqual(
      expect.arrayContaining([
        { step: "purged_deleted_account_withdrawal_cases", error: "boom" },
      ]),
    );
  });

  it("rejects a request without the cron secret", async () => {
    const res = await GET(
      new Request("https://inkl.ee/api/cron/retention-purge"),
    );
    expect(res.status).toBe(401);
  });
});
