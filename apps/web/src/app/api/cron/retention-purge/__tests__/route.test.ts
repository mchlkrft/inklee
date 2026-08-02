import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// This route used to be eight sequential blocks, each `return`ing a 500 the
// instant its own delete errored — which meant blocks after the failing one
// never ran, with no retry until the next scheduled invocation (found
// 2026-08-02 while adding the C1.4 guest-shop steps; the file had zero tests
// before this one). The fix wraps every step independently: one step's
// error is captured and reported, but every OTHER step still runs. This file
// proves exactly that property, plus that the C1.4 shop-retention steps
// (mocked wholesale here — their own correctness is DB-tested in
// tests/db/shop-retention-purge.test.ts) merge into the same response shape.
//
// EXTENDED 2026-08-03 for counsel Q14 and D3:
//   • `?mode=dry-run` must count and never delete, and any OTHER value must
//     be a real purge (a typo turning the scheduled run into a silent no-op
//     is the failure that would be hardest to notice).
//   • every run must leave a `retention_purge_runs` row, including a run
//     that matched nothing and a run that failed.
//   • a failed block must raise the aggregated alert as well as its own
//     exception.
//   • the deployed cadence must be weekly or finer.

const {
  mockCaptureException,
  mockCaptureMessage,
  mockRunShopRetentionPurges,
  mockRunBillingRecordRetentionPurges,
  mockRunTaxThresholdRollup,
  mockRunConnectAccountTeardown,
} = vi.hoisted(() => ({
  mockCaptureException: vi.fn(),
  mockCaptureMessage: vi.fn(),
  mockRunShopRetentionPurges: vi.fn(),
  mockRunBillingRecordRetentionPurges: vi.fn(),
  mockRunTaxThresholdRollup: vi.fn(),
  mockRunConnectAccountTeardown: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({
  captureException: (...a: unknown[]) => mockCaptureException(...a),
  captureMessage: (...a: unknown[]) => mockCaptureMessage(...a),
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
// A2: mocked wholesale here too — the counting rule and status boundaries are
// unit-tested on their own in tax-threshold-rollup.test.ts. Without this mock
// the real rollup would run against the service-client stub below and fail
// every chain it calls.
vi.mock("@/lib/server/tax-threshold-rollup", () => ({
  runTaxThresholdRollup: (...a: unknown[]) => mockRunTaxThresholdRollup(...a),
}));
// Q13 Connect teardown: mocked wholesale, DB-tested on its own.
vi.mock("@/lib/server/connect-account-teardown", () => ({
  runConnectAccountTeardown: (...a: unknown[]) =>
    mockRunConnectAccountTeardown(...a),
}));

type Reply = { data?: unknown; error?: unknown; count?: number };

/** Per-table canned reply for the DELETE path (`{ data, error }`). */
const deleteReplies = new Map<string, Reply>();
/** Per-table canned reply for the head-count path (`{ count, error }`). */
const countReplies = new Map<string, Reply>();

/** Which tables actually received a DELETE. Empty is the dry-run assertion. */
let deletedTables: string[] = [];
/** Which tables were head-counted. */
let countedTables: string[] = [];
/** Rows written to retention_purge_runs, and a switch to make that fail. */
let runLogRows: Record<string, unknown>[] = [];
let runLogError: string | null = null;

const FILTERS = ["is", "eq", "neq", "in", "lt", "gte", "not", "or"] as const;

function withFilterMethods<T extends Record<string, unknown>>(self: T): T {
  for (const name of FILTERS) {
    (self as Record<string, unknown>)[name] = () => self;
  }
  return self;
}

function deleteChain(table: string) {
  const self: Record<string, unknown> = withFilterMethods({
    select: () => {
      deletedTables.push(table);
      return Promise.resolve(
        deleteReplies.get(table) ?? { data: [], error: null },
      );
    },
  });
  return self;
}

/**
 * `.select(col, { count: "exact", head: true })` is itself the terminal call
 * for a head-count, so the chain has to be awaitable directly. `then` makes it
 * a thenable, which is exactly how supabase-js's builder behaves.
 */
function selectChain(table: string) {
  const settle = () => {
    countedTables.push(table);
    return Promise.resolve(
      countReplies.get(table) ?? { count: 0, error: null },
    );
  };
  const self: Record<string, unknown> = withFilterMethods({
    then: (
      resolve: (v: unknown) => unknown,
      reject?: (e: unknown) => unknown,
    ) => settle().then(resolve, reject),
  });
  return self;
}

vi.mock("@/lib/supabase/service", () => ({
  serviceClient: {
    from: (table: string) => ({
      delete: () => deleteChain(table),
      select: () => selectChain(table),
      insert: (row: Record<string, unknown>) => {
        if (table === "retention_purge_runs") {
          if (runLogError) {
            return Promise.resolve({ error: { message: runLogError } });
          }
          runLogRows.push(row);
        }
        return Promise.resolve({ error: null });
      },
    }),
  },
}));

import { GET } from "../route";

function req(query = "") {
  return new Request(`https://inkl.ee/api/cron/retention-purge${query}`, {
    headers: { authorization: "Bearer test-secret" },
  });
}

const SHOP_STEPS_ALL_OK = {
  purged_cancelled_standalone_order_emails: { ok: true as const, count: 0 },
  purged_completed_standalone_order_emails: { ok: true as const, count: 0 },
  purged_abandoned_carts: { ok: true as const, count: 0 },
  purged_inactive_wishlist_items: { ok: true as const, count: 0 },
  unstamped_cancelled_standalone_orders: { ok: true as const, count: 0 },
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

const TAX_THRESHOLD_STEPS_ALL_OK = {
  tax_threshold_rollup: { ok: true as const, count: 1 },
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "test-secret";
  deleteReplies.clear();
  countReplies.clear();
  deletedTables = [];
  countedTables = [];
  runLogRows = [];
  runLogError = null;
  mockRunShopRetentionPurges.mockResolvedValue(SHOP_STEPS_ALL_OK);
  mockRunBillingRecordRetentionPurges.mockResolvedValue(BILLING_STEPS_ALL_OK);
  mockRunTaxThresholdRollup.mockResolvedValue(TAX_THRESHOLD_STEPS_ALL_OK);
  mockRunConnectAccountTeardown.mockResolvedValue({
    completed: 0,
    blocked: 0,
  });
});

describe("retention-purge sequencing: every step is independent", () => {
  it("a failing early step does not prevent later steps from running or being reported", async () => {
    deleteReplies.set("deleted_account_records", {
      data: [{ id: "1" }],
      error: null,
    });
    deleteReplies.set("audit_log", { data: [{ id: "2" }], error: null });
    // Step 3 (of the original eight) fails.
    deleteReplies.set("admin_action_log", {
      data: null,
      error: { message: "connection reset" },
    });
    deleteReplies.set("analytics_events", { data: [{ id: "3" }], error: null });
    deleteReplies.set("artist_activity_days", {
      data: [{ artist_id: "4" }],
      error: null,
    });
    deleteReplies.set("web_analytics_events", {
      data: [{ id: "5" }],
      error: null,
    });
    deleteReplies.set("wa_visits_daily", {
      data: [{ day: "2020-01-01" }],
      error: null,
    });
    deleteReplies.set("wa_visit_rollup_days", {
      data: [{ day: "2020-01-01" }],
      error: null,
    });
    deleteReplies.set("map_reports", { data: [{ id: "6" }], error: null });

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
    expect(body.tax_threshold_rollup).toBe(1);
  });

  it("merges an A2 tax-threshold-rollup step failure into the same error list without blocking the others", async () => {
    mockRunTaxThresholdRollup.mockResolvedValue({
      tax_threshold_rollup: { ok: false, error: "boom" },
    });

    const res = await GET(req());
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(500);
    expect(body.purged_map_reports).toBe(0); // other steps still ran
    expect(body.tax_threshold_rollup).toBeUndefined();
    expect(body.errors).toEqual(
      expect.arrayContaining([{ step: "tax_threshold_rollup", error: "boom" }]),
    );
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

// ===========================================================================
// Q14 element (2): the dry-run / report mode.

describe("Q14: ?mode=dry-run reports without deleting", () => {
  it("counts every block and issues no DELETE at all", async () => {
    countReplies.set("deleted_account_records", { count: 4, error: null });
    countReplies.set("map_reports", { count: 7, error: null });

    const res = await GET(req("?mode=dry-run"));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.mode).toBe("dry-run");
    expect(body.purged_financial_records).toBe(4);
    expect(body.purged_map_reports).toBe(7);

    // The half that makes it a dry-run rather than a purge.
    expect(deletedTables).toEqual([]);
    expect(countedTables).toContain("deleted_account_records");
    expect(countedTables).toContain("map_reports");
  });

  it("passes the mode down to every delegated runner", async () => {
    await GET(req("?mode=dry-run"));
    expect(mockRunShopRetentionPurges).toHaveBeenCalledWith(
      expect.any(Date),
      "dry-run",
    );
    expect(mockRunBillingRecordRetentionPurges).toHaveBeenCalledWith(
      expect.any(Date),
      "dry-run",
    );
    expect(mockRunConnectAccountTeardown).toHaveBeenCalledWith(
      expect.any(Date),
      "dry-run",
    );
  });

  it("skips the A2 rollup, which writes, and says so rather than reporting a zero", async () => {
    const res = await GET(req("?mode=dry-run"));
    const body = (await res.json()) as Record<string, unknown>;

    expect(mockRunTaxThresholdRollup).not.toHaveBeenCalled();
    expect(body.skipped).toEqual(["tax_threshold_rollup"]);
    expect(body.tax_threshold_rollup).toBeUndefined();
  });

  // DISTINCTION CONTROL. Everything above would also pass if the route had
  // simply stopped purging. These prove a real purge still happens by default
  // and that only the exact string "dry-run" downgrades it: a typo in a
  // hand-typed production URL must fail loudly as a purge, never silently
  // succeed as a no-op.
  it("a request with no mode parameter is a REAL purge", async () => {
    deleteReplies.set("map_reports", { data: [{ id: "1" }], error: null });
    const res = await GET(req());
    const body = (await res.json()) as Record<string, unknown>;

    expect(body.mode).toBe("purge");
    expect(deletedTables).toContain("map_reports");
    expect(mockRunTaxThresholdRollup).toHaveBeenCalled();
    expect(body.skipped).toBeUndefined();
  });

  it.each(["?mode=dryrun", "?mode=DRY-RUN", "?mode=dry_run", "?mode="])(
    "treats %s as a real purge, not a dry-run",
    async (query) => {
      const res = await GET(req(query));
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.mode).toBe("purge");
      expect(deletedTables.length).toBeGreaterThan(0);
    },
  );
});

// ===========================================================================
// Q14 element (2), the durable half: "zero is then an evidenced result, not
// silence." A run that records nothing is indistinguishable from a run that
// never happened, which is the entire complaint.

describe("Q14: every run leaves a retention_purge_runs row", () => {
  it("records mode, ok and the per-block counts on a clean zero-row run", async () => {
    await GET(req());
    expect(runLogRows).toHaveLength(1);
    const row = runLogRows[0];
    expect(row.mode).toBe("purge");
    expect(row.ok).toBe(true);
    expect(row.step_errors).toEqual([]);
    expect(row.step_counts).toMatchObject({
      purged_financial_records: 0,
      purged_map_reports: 0,
      purged_cancelled_standalone_order_emails: 0,
    });
    expect(typeof row.duration_ms).toBe("number");
  });

  it("records a dry-run as mode=dry-run so it can never be mistaken for a purge", async () => {
    countReplies.set("map_reports", { count: 3, error: null });
    await GET(req("?mode=dry-run"));
    expect(runLogRows[0].mode).toBe("dry-run");
    expect(runLogRows[0].step_counts).toMatchObject({ purged_map_reports: 3 });
  });

  it("still records a FAILED run, with the failing block named", async () => {
    deleteReplies.set("admin_action_log", {
      data: null,
      error: { message: "connection reset" },
    });
    await GET(req());
    expect(runLogRows).toHaveLength(1);
    expect(runLogRows[0].ok).toBe(false);
    expect(runLogRows[0].step_errors).toEqual([
      { step: "purged_admin_rows", error: "connection reset" },
    ]);
  });

  it("surfaces a run-log write failure instead of swallowing it, without failing an otherwise-good purge", async () => {
    runLogError = "permission denied for table retention_purge_runs";
    const res = await GET(req());
    const body = (await res.json()) as Record<string, unknown>;

    // The purge itself succeeded, so the status must stay 200 — otherwise a
    // bookkeeping fault invites a re-run of deletions that already happened.
    expect(res.status).toBe(200);
    expect(body.run_log_error).toContain("permission denied");
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tags: expect.objectContaining({ step: "retention_run_log" }),
      }),
    );
  });
});

// ===========================================================================
// Q14 element (3): "every block failure alerts."

describe("Q14: per-block alerting", () => {
  it("raises one aggregated alert naming every failed block", async () => {
    deleteReplies.set("admin_action_log", {
      data: null,
      error: { message: "connection reset" },
    });
    deleteReplies.set("map_reports", {
      data: null,
      error: { message: "deadlock detected" },
    });

    await GET(req());

    expect(mockCaptureMessage).toHaveBeenCalledWith(
      expect.stringContaining("2 block(s) failed"),
      expect.objectContaining({ level: "error" }),
    );
    const [message] = mockCaptureMessage.mock.calls[0] as [string];
    expect(message).toContain("purged_admin_rows");
    expect(message).toContain("purged_map_reports");
  });

  // DISTINCTION CONTROL: an alerter that fires unconditionally is noise, and
  // noise is how a real failure gets ignored.
  it("raises no aggregated alert when every block succeeds", async () => {
    await GET(req());
    expect(mockCaptureMessage).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// D3: the deployed cadence. Counsel: "a stated retention period must be
// honest" — a monthly cron turns every 30-day rule into up to ~60 days. This
// asserts against the file Vercel actually reads, not against a comment.

describe("D3: the deployed cron cadence is weekly or finer", () => {
  it("vercel.json schedules the retention purge at least weekly", () => {
    const config = JSON.parse(
      readFileSync(
        path.join(__dirname, "../../../../../../vercel.json"),
        "utf8",
      ),
    ) as { crons: { path: string; schedule: string }[] };

    const cron = config.crons.find(
      (c) => c.path === "/api/cron/retention-purge",
    );
    expect(cron, "the retention purge must still be scheduled").toBeDefined();

    const [, , dayOfMonth, month, dayOfWeek] = cron!.schedule.split(" ");
    // A monthly expression pins day-of-month (`0 5 1 * *`) and so can leave a
    // row eligible for up to ~31 extra days. Weekly pins day-of-week and caps
    // the wait at 7. Anything that pins month is worse still.
    expect(month, "a yearly/monthly-by-month schedule is not honest").toBe("*");
    expect(
      dayOfMonth === "*" && dayOfWeek !== "*",
      `expected a weekly (or daily) schedule, got "${cron!.schedule}"`,
    ).toBe(true);
  });
});
