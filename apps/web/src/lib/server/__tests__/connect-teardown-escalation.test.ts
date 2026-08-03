import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Counsel round-4 ruling 7.5 (docs/legal/counsel-handoff-round-4-2026-08-02.md
 * §7.5), migration 0151.
 *
 * Counsel refused a hard deletion deadline and required instead that an
 * uncompleted teardown at the seven-year mark stop being SILENT: "an operator
 * escalation -- an alert and a case -- and the continued retention becomes a
 * documented, per-account decision reviewed annually with the reason recorded
 * (unresolved balance, amount, what resolution requires)."
 *
 * Counsel also made mutation-style verification the standard for every guard
 * this process created (§7.4: "a compliance guard is tested only when its
 * REMOVAL fails the suite"). Each `it` below therefore names the single change
 * that reds it; each was made, observed red, and reverted.
 *
 * The one with the least obvious failure mode, and the reason this file leans
 * on it hardest: the weekly refresh must NOT move the annual review date. If
 * it does, nothing errors, no test that only checks the reason and the amount
 * notices, and the review simply never comes due -- silent indefinite
 * retention rebuilt inside the control that exists to prevent it.
 */

const h = vi.hoisted(() => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
  balanceRetrieve: vi.fn(),
  accountsDel: vi.fn(),
  dueRows: [] as Record<string, unknown>[],
  escalationRows: [] as Record<string, unknown>[],
  reviewRows: [] as Record<string, unknown>[],
  singleRow: null as Record<string, unknown> | null,
  upserts: [] as Record<string, unknown>[],
  updates: [] as Record<string, unknown>[],
  inserts: [] as Record<string, unknown>[],
  /** Make the insert-if-absent behave as "a case already existed". */
  caseAlreadyExists: false,
}));

vi.mock("@sentry/nextjs", () => ({
  captureMessage: h.captureMessage,
  captureException: h.captureException,
}));

vi.mock("@/lib/stripe", () => ({
  stripe: {
    balance: { retrieve: h.balanceRetrieve },
    accounts: { del: h.accountsDel },
  },
}));

vi.mock("@/lib/supabase/service", () => {
  const rowsFor = (table: string) => {
    if (table === "connect_teardown_escalations") return h.escalationRows;
    if (table === "connect_teardown_escalation_reviews") return h.reviewRows;
    return h.dueRows;
  };
  return {
    serviceClient: {
      from: (table: string) => ({
        select: (_cols?: string, opts?: { count?: string; head?: boolean }) => {
          const self: Record<string, unknown> = {
            select: () => self,
            not: () => self,
            in: () => self,
            lt: () => self,
            lte: () => self,
            eq: () => self,
            single: () => Promise.resolve({ data: h.singleRow, error: null }),
            then: (resolve: (v: unknown) => unknown) =>
              Promise.resolve({
                data: rowsFor(table),
                count: opts?.count ? rowsFor(table).length : undefined,
                error: null,
              }).then(resolve),
          };
          return self;
        },
        insert: (payload: Record<string, unknown>) => {
          h.inserts.push({ __table: table, ...payload });
          return Promise.resolve({ data: null, error: null });
        },
        upsert: (payload: Record<string, unknown>) => {
          h.upserts.push({ __table: table, ...payload });
          return {
            select: () =>
              Promise.resolve({
                data: h.caseAlreadyExists ? [] : [{ id: "esc_1" }],
                error: null,
              }),
          };
        },
        update: (patch: Record<string, unknown>) => {
          h.updates.push({ __table: table, ...patch });
          const chain: Record<string, unknown> = {
            eq: () => chain,
            then: (resolve: (v: unknown) => unknown) =>
              Promise.resolve({ data: null, error: null }).then(resolve),
          };
          return chain;
        },
      }),
    },
  };
});

import {
  nonZeroBuckets,
  summariseBalance,
  nextAnnualReview,
  balanceBlockReason,
  openOrRefreshEscalation,
  recordEscalationReview,
} from "@/lib/server/connect-teardown-escalation";
import { runConnectAccountTeardown } from "@/lib/server/connect-account-teardown";

const ROW = {
  id: "rec_1",
  stripe_account_id: "acct_1",
  connect_teardown_state: "blocked",
};

const ZERO_BALANCE = {
  object: "balance",
  livemode: false,
  available: [{ amount: 0, currency: "eur" }],
  pending: [{ amount: 0, currency: "eur" }],
};

const NON_ZERO_BALANCE = {
  object: "balance",
  livemode: false,
  available: [{ amount: 2500, currency: "eur" }],
  pending: [{ amount: 700, currency: "eur" }],
};

const NOW = new Date("2033-03-01T00:00:00.000Z");

function escalationUpserts() {
  return h.upserts.filter((u) => u.__table === "connect_teardown_escalations");
}
function escalationUpdates() {
  return h.updates.filter((u) => u.__table === "connect_teardown_escalations");
}

beforeEach(() => {
  vi.clearAllMocks();
  h.dueRows = [];
  h.escalationRows = [];
  h.reviewRows = [];
  h.singleRow = null;
  h.upserts = [];
  h.updates = [];
  h.inserts = [];
  h.caseAlreadyExists = false;
  h.balanceRetrieve.mockResolvedValue(ZERO_BALANCE);
  h.accountsDel.mockResolvedValue({ id: "acct_1", deleted: true });
});

// ───────────────────────────────────────────────────────────────────────────
describe("the amount counsel requires the case to record", () => {
  // RED: `nonZeroBuckets` returning `[]` instead of `null` for a non-object.
  it("distinguishes an UNREADABLE balance from a zero one", () => {
    expect(nonZeroBuckets(null)).toBeNull();
    expect(nonZeroBuckets(ZERO_BALANCE)).toEqual([]);
  });

  // RED: skipping the `pending` array, or naming only `available`.
  it("reports every non-zero bucket, with its amount and currency", () => {
    expect(nonZeroBuckets(NON_ZERO_BALANCE)).toEqual([
      { bucket: "available", amount: 2500, currency: "eur" },
      { bucket: "pending", amount: 700, currency: "eur" },
    ]);
  });

  // RED: naming the known buckets instead of iterating the returned arrays.
  it("reports a bucket nobody named at build time", () => {
    expect(
      nonZeroBuckets({ ...ZERO_BALANCE, connect_reserved: [{ amount: 12 }] }),
    ).toEqual([
      { bucket: "connect_reserved", amount: 12, currency: "unknown" },
    ]);
  });

  // RED: summing across currencies and picking buckets[0].currency.
  it("REFUSES a single-scalar summary when the money is in two currencies", () => {
    expect(
      summariseBalance([
        { bucket: "available", amount: 100, currency: "eur" },
        { bucket: "available", amount: 200, currency: "usd" },
      ]),
    ).toBeNull();
  });

  // DISTINCTION: it is not just refusing every summary.
  it("DISTINCTION: still summarises when there is exactly one currency", () => {
    expect(summariseBalance(nonZeroBuckets(NON_ZERO_BALANCE)!)).toEqual({
      minor: 3200,
      currency: "eur",
    });
  });

  // RED: dropping the amount from the reason string.
  it("states the amount and what resolution requires, which is what counsel asked for", () => {
    const { reason, resolutionRequires } = balanceBlockReason(
      nonZeroBuckets(NON_ZERO_BALANCE)!,
    );
    expect(reason).toContain("2500 EUR");
    expect(reason).toContain("700 EUR");
    expect(resolutionRequires).toContain("zero");
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("the annual review clock", () => {
  // RED: `+ 365 * 24 * 60 * 60 * 1000`, which drifts across a leap year.
  it("is one calendar year, not 365 days", () => {
    expect(
      nextAnnualReview(new Date("2032-02-29T00:00:00Z")).toISOString(),
    ).toBe("2033-03-01T00:00:00.000Z");
    expect(
      nextAnnualReview(new Date("2033-01-10T00:00:00Z")).toISOString(),
    ).toBe("2034-01-10T00:00:00.000Z");
  });

  /**
   * THE LOAD-BEARING ONE. The weekly cron refreshes the recorded amount; if
   * that refresh also rewrites `next_review_due_at`, the review never comes
   * due and no other assertion in this file notices.
   *
   * RED: switching `openOrRefreshEscalation`'s two statements for a plain
   * `upsert` (the obvious implementation), or adding `next_review_due_at` /
   * `opened_at` to the refresh patch.
   */
  it("a REFRESH must not move the review date or the opened date", async () => {
    h.caseAlreadyExists = true;
    await openOrRefreshEscalation({
      recordId: "rec_1",
      reason: "unresolved balance",
      resolutionRequires: "balance must reach zero",
      buckets: [{ bucket: "available", amount: 5, currency: "eur" }],
      now: NOW,
    });

    const patch = escalationUpdates()[0];
    expect(patch).toBeDefined();
    expect(patch).not.toHaveProperty("next_review_due_at");
    expect(patch).not.toHaveProperty("opened_at");
    expect(patch).not.toHaveProperty("last_reviewed_at");
    expect(patch).not.toHaveProperty("review_count");
    // DISTINCTION: it still did the job it was called for.
    expect(patch.balance_minor).toBe(5);
    expect(patch.observed_at).toBe(NOW.toISOString());
  });

  // DISTINCTION: the clock IS set when the case is first opened, otherwise
  // "never moves it" would be satisfied by never setting it at all.
  it("DISTINCTION: opening a case DOES set both clocks", async () => {
    h.caseAlreadyExists = false;
    const { opened } = await openOrRefreshEscalation({
      recordId: "rec_1",
      reason: "unresolved balance",
      resolutionRequires: "balance must reach zero",
      buckets: [],
      now: NOW,
    });
    expect(opened).toBe(true);
    const insert = escalationUpserts()[0];
    expect(insert.opened_at).toBe(NOW.toISOString());
    expect(insert.next_review_due_at).toBe("2034-03-01T00:00:00.000Z");
    // A refresh must not have run on the open path.
    expect(escalationUpdates()).toEqual([]);
  });

  // RED: incrementing a counter instead of recounting, or omitting the
  // next_review_due_at bump so the case stays permanently overdue.
  it("recording a review advances the clock by a year and recounts from the log", async () => {
    h.singleRow = {
      id: "esc_1",
      reason: "unresolved balance",
      resolution_requires: "balance must reach zero",
      balance_detail: [{ bucket: "available", amount: 5, currency: "eur" }],
      balance_minor: 5,
      balance_currency: "eur",
    };
    h.reviewRows = [{ id: "rev_1" }, { id: "rev_2" }];

    await recordEscalationReview({
      escalationId: "esc_1",
      reviewedBy: "ops@inklee",
      decision: "continue_retention",
      now: NOW,
    });

    // The review row copies the position AS AT the review.
    const review = h.inserts.find(
      (i) => i.__table === "connect_teardown_escalation_reviews",
    );
    expect(review).toMatchObject({
      escalation_id: "esc_1",
      reviewed_by: "ops@inklee",
      decision: "continue_retention",
      reason: "unresolved balance",
      balance_minor: 5,
    });

    const patch = escalationUpdates()[0];
    expect(patch.next_review_due_at).toBe("2034-03-01T00:00:00.000Z");
    expect(patch.review_count).toBe(2);
    expect(patch.last_reviewed_at).toBe(NOW.toISOString());
    // continue_retention keeps the case open.
    expect(patch).not.toHaveProperty("state");
  });

  // DISTINCTION: a review CAN close the case, so the above is not just
  // "never closes".
  it("DISTINCTION: a `resolved` review closes the case with a resolved_at", async () => {
    h.singleRow = {
      id: "esc_1",
      reason: "r",
      resolution_requires: "x",
      balance_detail: [],
      balance_minor: null,
      balance_currency: null,
    };
    await recordEscalationReview({
      escalationId: "esc_1",
      reviewedBy: "ops@inklee",
      decision: "resolved",
      now: NOW,
    });
    const patch = escalationUpdates()[0];
    expect(patch.state).toBe("resolved");
    expect(patch.resolved_at).toBe(NOW.toISOString());
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("the escalation itself: an alert AND a case", () => {
  // RED: deleting the openOrRefreshEscalation call from the blocked branch of
  // runConnectAccountTeardown.
  it("a blocked teardown past the seven-year mark opens a case carrying the reason and the amount", async () => {
    h.dueRows = [ROW];
    h.balanceRetrieve.mockResolvedValue(NON_ZERO_BALANCE);

    const result = await runConnectAccountTeardown(NOW);

    expect(result.blocked).toBe(1);
    expect(result.escalationsOpened).toBe(1);

    const opened = escalationUpserts()[0];
    expect(opened.record_id).toBe("rec_1");
    expect(opened.state).toBe("open");
    expect(opened.reason).toContain("2500 EUR");
    expect(opened.balance_minor).toBe(3200);
    expect(opened.balance_currency).toBe("eur");
    expect(opened.resolution_requires).toContain("zero");
  });

  // RED: dropping the Sentry.captureMessage from the opened branch, or
  // lowering it to a warning.
  it("and raises the ALERT half, at error level, naming the account and the amount", async () => {
    h.dueRows = [ROW];
    h.balanceRetrieve.mockResolvedValue(NON_ZERO_BALANCE);

    await runConnectAccountTeardown(NOW);

    const alert = h.captureMessage.mock.calls.find(
      (c) => c[1]?.tags?.escalation === "opened",
    );
    expect(alert).toBeDefined();
    expect(alert![1].level).toBe("error");
    expect(alert![1].extra.stripeAccountId).toBe("acct_1");
    expect(alert![1].extra.recordId).toBe("rec_1");
    expect(alert![1].extra.balance).toEqual([
      { bucket: "available", amount: 2500, currency: "eur" },
      { bucket: "pending", amount: 700, currency: "eur" },
    ]);
    expect(alert![1].extra.nextReviewDue).toBe("2034-03-01T00:00:00.000Z");
  });

  // RED: alerting on every cycle rather than only when the case is new.
  it("does NOT re-alert on the weekly refresh of a case that already exists", async () => {
    h.dueRows = [ROW];
    h.caseAlreadyExists = true;
    h.balanceRetrieve.mockResolvedValue(NON_ZERO_BALANCE);

    const result = await runConnectAccountTeardown(NOW);

    expect(result.escalationsOpened).toBe(0);
    expect(
      h.captureMessage.mock.calls.filter(
        (c) => c[1]?.tags?.escalation === "opened",
      ),
    ).toHaveLength(0);
    // DISTINCTION: it still refreshed the amount.
    expect(escalationUpdates()[0].balance_minor).toBe(3200);
  });

  /**
   * DISTINCTION for the whole feature: a guard that escalates on everything
   * would pass every test above. A teardown that SUCCEEDS must raise no case
   * and must close any case that was open.
   *
   * RED: calling openOrRefreshEscalation unconditionally instead of only on
   * the blocked branch; or deleting the resolveEscalation call.
   */
  it("DISTINCTION: a teardown that COMPLETES opens no case and resolves any open one", async () => {
    h.dueRows = [ROW];
    h.balanceRetrieve.mockResolvedValue(ZERO_BALANCE);

    const result = await runConnectAccountTeardown(NOW);

    expect(result.completed).toBe(1);
    expect(result.escalationsOpened).toBe(0);
    expect(escalationUpserts()).toEqual([]);
    expect(
      h.captureMessage.mock.calls.filter(
        (c) => c[1]?.tags?.escalation === "opened",
      ),
    ).toHaveLength(0);
    expect(escalationUpdates()).toContainEqual(
      expect.objectContaining({ state: "resolved" }),
    );
  });

  /**
   * RED: opening cases on the `!stripe` path.
   *
   * A missing platform key blocks every account at once. Writing "this
   * artist's balance is unresolved" against all of them records a claim
   * nobody observed, and the money-path rule this repo already learned the
   * hard way is that a platform-scope fault must not be attributed per
   * account.
   */
  it("does not manufacture per-account cases out of a PLATFORM fault", async () => {
    vi.resetModules();
    vi.doMock("@/lib/stripe", () => ({ stripe: null }));
    const mod = await import("@/lib/server/connect-account-teardown");
    h.dueRows = [ROW];

    const result = await mod.runConnectAccountTeardown(NOW);

    expect(result.blocked).toBe(1);
    expect(result.escalationsOpened).toBe(0);
    expect(escalationUpserts()).toEqual([]);
    // It still alerts: a platform fault is loud, it is just not a per-account
    // documented cause.
    expect(
      h.captureMessage.mock.calls.some((c) =>
        String(c[0]).includes("Stripe is not configured"),
      ),
    ).toBe(true);
    vi.doUnmock("@/lib/stripe");
    vi.resetModules();
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("the annual review is enforced by an alert, not by hope", () => {
  // RED: deleting the reportReviewsDue call, or gating it behind
  // `due.length > 0`.
  it("alerts at error level when an open case is overdue, even with nothing due for teardown", async () => {
    h.dueRows = [];
    h.escalationRows = [
      {
        id: "esc_1",
        record_id: "rec_1",
        opened_at: "2033-01-01T00:00:00.000Z",
        reason: "unresolved balance",
        resolution_requires: "balance must reach zero",
        balance_detail: [{ bucket: "available", amount: 900, currency: "eur" }],
        balance_minor: 900,
        balance_currency: "eur",
        next_review_due_at: "2034-01-01T00:00:00.000Z",
        last_reviewed_at: null,
        review_count: 0,
      },
    ];

    const result = await runConnectAccountTeardown(
      new Date("2034-06-01T00:00:00Z"),
    );

    expect(result.reviewsDue).toBe(1);
    const alert = h.captureMessage.mock.calls.find(
      (c) => c[1]?.tags?.escalation === "review_due",
    );
    expect(alert).toBeDefined();
    expect(alert![1].level).toBe("error");
    expect(alert![1].extra.cases[0]).toMatchObject({
      escalationId: "esc_1",
      recordId: "rec_1",
      reviewCount: 0,
    });
  });

  // RED: alerting from the dry-run branch too.
  it("a dry-run counts the overdue reviews but pages nobody", async () => {
    h.escalationRows = [
      {
        id: "esc_1",
        record_id: "rec_1",
        opened_at: "2033-01-01T00:00:00.000Z",
        reason: "r",
        resolution_requires: "x",
        balance_detail: [],
        balance_minor: null,
        balance_currency: null,
        next_review_due_at: "2034-01-01T00:00:00.000Z",
        last_reviewed_at: null,
        review_count: 0,
      },
    ];

    const result = await runConnectAccountTeardown(
      new Date("2034-06-01T00:00:00Z"),
      "dry-run",
    );

    expect(result.reviewsDue).toBe(1);
    expect(
      h.captureMessage.mock.calls.filter(
        (c) => c[1]?.tags?.escalation === "review_due",
      ),
    ).toHaveLength(0);
  });
});
