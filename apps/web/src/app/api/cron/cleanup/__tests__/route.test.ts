import { describe, it, expect, vi, beforeEach } from "vitest";

// CRON-CLN-001: the 7-year financial-retention lookup
// (`orders` select filtered to ORDER_MONEY_STATES) used to destructure only
// `data`. On a transient error the query returns null, the retention set
// silently shrinks to whatever `deposit_paid_at` alone can prove, and the
// stale-booking delete then hard-deletes rows that should have been kept —
// cascading their `orders` and `audit_log` rows away (ON DELETE CASCADE).
//
// The fix: capture the error and skip the ENTIRE delete step this run rather
// than deleting against an unverified (and therefore untrustworthy) set.
// Same treatment for the per-booking image purge (`storage.list`/`.remove`):
// a booking whose image purge failed is excluded from the row delete, since
// the row is the only remaining pointer to that storage folder.
//
// Every other sweep this route runs (stay lifecycle, payment reconciliation,
// billing reconciliation, etc.) is an independent module and is mocked
// wholesale — the retention guard and the delete decision are the only things
// that live in THIS file.

const {
  mockCaptureException,
  mockWriteAudit,
  mockRunStayLifecycleSweep,
  mockReconcileStalePaymentRequests,
  mockSweepExpiredPaymentRequests,
  mockSweepStalePendingStandaloneOrders,
  mockReconcileStaleSubscriptions,
  mockRunCompExpirySweep,
  mockRunArtistAnalyticsRollup,
} = vi.hoisted(() => ({
  mockCaptureException: vi.fn(),
  mockWriteAudit: vi.fn().mockResolvedValue(undefined),
  mockRunStayLifecycleSweep: vi
    .fn()
    .mockResolvedValue({ activated: 0, completed: 0, requestsCompleted: 0 }),
  mockReconcileStalePaymentRequests: vi.fn().mockResolvedValue({}),
  mockSweepExpiredPaymentRequests: vi.fn().mockResolvedValue({}),
  mockSweepStalePendingStandaloneOrders: vi.fn().mockResolvedValue({}),
  mockReconcileStaleSubscriptions: vi.fn().mockResolvedValue({}),
  mockRunCompExpirySweep: vi.fn().mockResolvedValue({}),
  mockRunArtistAnalyticsRollup: vi.fn().mockResolvedValue({}),
}));

vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({
  captureException: (...a: unknown[]) => mockCaptureException(...a),
}));
vi.mock("@/lib/audit", () => ({
  writeAudit: (...a: unknown[]) => mockWriteAudit(...a),
}));
vi.mock("@/lib/server/guest-spots", () => ({
  runStayLifecycleSweep: () => mockRunStayLifecycleSweep(),
}));
vi.mock("@/lib/server/appointment-payment-reconciliation", () => ({
  reconcileStalePaymentRequests: () => mockReconcileStalePaymentRequests(),
  sweepExpiredPaymentRequests: () => mockSweepExpiredPaymentRequests(),
}));
vi.mock("@/lib/server/goods-checkout", () => ({
  sweepStalePendingStandaloneOrders: () =>
    mockSweepStalePendingStandaloneOrders(),
}));
vi.mock("@/lib/server/billing/subscription-reconciliation", () => ({
  reconcileStaleSubscriptions: () => mockReconcileStaleSubscriptions(),
}));
vi.mock("@/lib/server/billing/comp-expiry-sweep", () => ({
  runCompExpirySweep: () => mockRunCompExpirySweep(),
}));
vi.mock("@/lib/server/artist-analytics-rollup", () => ({
  runArtistAnalyticsRollup: () => mockRunArtistAnalyticsRollup(),
}));

type Reply = { data?: unknown; error?: unknown; count?: unknown };

let staleReply: Reply = { data: [], error: null };
let moneyOrdersReply: Reply = { data: [], error: null };
let unreconciledReply: Reply = { data: [], error: null };
const storageListReplies = new Map<string, Reply>();
const storageRemoveReplies = new Map<string, Reply>();
const storageRemoveCalls: Array<{ folder: string; paths: string[] }> = [];
const deleteCalls: string[][] = [];
let deleteReply: Reply = { error: null };

function selectChain(reply: () => Reply) {
  const self: Record<string, unknown> = {
    select: () => self,
    in: () => self,
    eq: () => self,
    lt: () => self,
    is: () => self,
    gte: () => self,
    then: (onFulfilled: (v: Reply) => unknown, onRejected?: unknown) =>
      Promise.resolve(reply()).then(
        onFulfilled,
        onRejected as (r: unknown) => unknown,
      ),
  };
  return self;
}

vi.mock("@/lib/supabase/service", () => ({
  serviceClient: {
    from: (table: string) => {
      if (table === "booking_requests") {
        let staleCallCount = 0;
        return {
          select: () => {
            staleCallCount++;
            // First select() on booking_requests is the stale-bookings fetch;
            // the second (only reached if `stale` was non-empty) is the
            // unreconciled-deposit check.
            return selectChain(() =>
              staleCallCount === 1 ? staleReply : unreconciledReply,
            );
          },
          delete: () => ({
            in: (_col: string, ids: string[]) => {
              deleteCalls.push(ids);
              return Promise.resolve(deleteReply);
            },
          }),
        };
      }
      if (table === "orders") {
        return { select: () => selectChain(() => moneyOrdersReply) };
      }
      if (table === "audit_log") {
        // Only reached by the unreconciled-flag dedupe check; default to "not
        // already flagged today" so writeAudit fires once per unreconciled row.
        return { select: () => selectChain(() => ({ count: 0 })) };
      }
      throw new Error(`unexpected table: ${table}`);
    },
    storage: {
      from: (bucket: string) => {
        if (bucket !== "bookings")
          throw new Error(`unexpected bucket ${bucket}`);
        return {
          list: (folder: string) =>
            Promise.resolve(
              storageListReplies.get(folder) ?? { data: [], error: null },
            ),
          remove: (paths: string[]) => {
            const folder = paths[0]?.split("/").slice(0, -1).join("/") ?? "";
            storageRemoveCalls.push({ folder, paths });
            return Promise.resolve(
              storageRemoveReplies.get(folder) ?? { error: null },
            );
          },
        };
      },
    },
  },
}));

import { GET } from "../route";

function req() {
  return new Request("https://inkl.ee/api/cron/cleanup", {
    headers: { authorization: "Bearer test-secret" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "test-secret";
  staleReply = { data: [], error: null };
  moneyOrdersReply = { data: [], error: null };
  unreconciledReply = { data: [], error: null };
  storageListReplies.clear();
  storageRemoveReplies.clear();
  storageRemoveCalls.length = 0;
  deleteCalls.length = 0;
  deleteReply = { error: null };
});

describe("cleanup retention guard (CRON-CLN-001)", () => {
  it("deletes a non-money stale booking when the retention guard succeeds (control)", async () => {
    staleReply = {
      data: [{ id: "b1", artist_id: "a1", deposit_paid_at: null }],
      error: null,
    };
    moneyOrdersReply = { data: [], error: null };
    storageListReplies.set("a1/b1", { data: [], error: null });

    const res = await GET(req());
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(deleteCalls).toEqual([["b1"]]);
    expect(body.deleted).toBe(1);
    expect(body.retention_guard_failed).toBe(false);
  });

  it("does NOT delete a stale booking the retention guard marks as money-bearing (control)", async () => {
    staleReply = {
      data: [{ id: "b1", artist_id: "a1", deposit_paid_at: null }],
      error: null,
    };
    moneyOrdersReply = { data: [{ booking_id: "b1" }], error: null };
    storageListReplies.set("a1/b1", { data: [], error: null });

    const res = await GET(req());
    const body = (await res.json()) as Record<string, unknown>;

    expect(deleteCalls).toEqual([]);
    expect(body.deleted).toBe(0);
    expect(body.retained_with_financial_record).toBe(1);
  });

  it("aborts the delete step entirely when the retention guard query errors, instead of deleting on an empty set", async () => {
    staleReply = {
      data: [
        { id: "b1", artist_id: "a1", deposit_paid_at: null },
        { id: "b2", artist_id: "a2", deposit_paid_at: null },
      ],
      error: null,
    };
    // The retention guard fails transiently: without the fix, `moneyOrders`
    // destructures to `undefined`, `moneyBookingIds` collapses to whatever
    // `deposit_paid_at` alone proves (nothing, here), and BOTH bookings would
    // be hard-deleted despite the guard never having cleared them.
    moneyOrdersReply = { data: null, error: { message: "connection reset" } };
    storageListReplies.set("a1/b1", { data: [], error: null });
    storageListReplies.set("a2/b2", { data: [], error: null });

    const res = await GET(req());
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    // Fails if the retention-guard error is discarded: deleteCalls would then
    // contain [["b1","b2"]] and a booking carrying a real financial record
    // could be hard-deleted on a transient Postgres/network blip.
    expect(deleteCalls).toEqual([]);
    expect(body.deleted).toBe(0);
    expect(body.retention_guard_failed).toBe(true);
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "connection reset" }),
      expect.objectContaining({
        tags: expect.objectContaining({ step: "retention-guard" }),
      }),
    );
  });

  it("excludes a booking from the delete when its image purge fails, but still deletes its clean sibling", async () => {
    staleReply = {
      data: [
        { id: "b-purge-failed", artist_id: "a1", deposit_paid_at: null },
        { id: "b-clean", artist_id: "a2", deposit_paid_at: null },
      ],
      error: null,
    };
    moneyOrdersReply = { data: [], error: null };
    storageListReplies.set("a1/b-purge-failed", {
      data: null,
      error: { message: "storage unavailable" },
    });
    storageListReplies.set("a2/b-clean", { data: [], error: null });

    const res = await GET(req());
    const body = (await res.json()) as Record<string, unknown>;

    expect(deleteCalls).toEqual([["b-clean"]]);
    expect(body.deleted).toBe(1);
    expect(body.image_purge_failed).toBe(1);
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "storage unavailable" }),
      expect.objectContaining({
        tags: expect.objectContaining({ step: "image-purge-list" }),
      }),
    );
  });

  it("rejects a request without the cron secret", async () => {
    const res = await GET(new Request("https://inkl.ee/api/cron/cleanup"));
    expect(res.status).toBe(401);
  });
});
