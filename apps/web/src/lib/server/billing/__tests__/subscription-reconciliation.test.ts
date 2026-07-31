import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockServiceClient, mockStripe, mockReconcile } = vi.hoisted(() => ({
  mockServiceClient: { from: vi.fn() },
  mockStripe: { subscriptions: { list: vi.fn() } },
  mockReconcile: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));
vi.mock("@/lib/supabase/service", () => ({
  serviceClient: mockServiceClient,
}));
vi.mock("../client", () => ({
  requireStripe: () => mockStripe,
}));
vi.mock("../reconcile", () => ({
  reconcileSubscriptionById: (...a: unknown[]) => mockReconcile(...a),
}));

import {
  reconcileOnCheckoutReturn,
  reconcileStaleSubscriptions,
} from "../subscription-reconciliation";

type Reply = { data?: unknown; error?: unknown; count?: number };
let selectReply: Reply = { data: null };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeChain(reply?: Reply): any {
  const r = reply ?? selectReply;
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "lt", "is", "not", "in", "limit"]) {
    chain[m] = () => chain;
  }
  chain.then = (onF?: (v: Reply) => unknown, onR?: (r: unknown) => unknown) =>
    Promise.resolve(r).then(onF, onR);
  chain.maybeSingle = () => Promise.resolve(r);
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  selectReply = { data: null };
  mockServiceClient.from.mockImplementation(() => ({
    select: () => makeChain(),
  }));
});

describe("reconcileOnCheckoutReturn", () => {
  it("reconciles when the user has a customer and a subscription", async () => {
    selectReply = { data: { stripe_customer_id: "cus_abc" } };
    mockStripe.subscriptions.list.mockResolvedValue({
      data: [{ id: "sub_abc" }],
    });
    mockReconcile.mockResolvedValue({
      artistId: "u1",
      planTier: "plus",
      status: "active",
      duplicate: false,
      orphaned: false,
      stale: false,
    });

    const r = await reconcileOnCheckoutReturn("u1");

    expect(r.reconciled).toBe(true);
    expect(mockReconcile).toHaveBeenCalledWith("sub_abc");
  });

  it("returns not reconciled when no customer id", async () => {
    selectReply = { data: null };

    const r = await reconcileOnCheckoutReturn("u1");

    expect(r.reconciled).toBe(false);
    expect(mockStripe.subscriptions.list).not.toHaveBeenCalled();
  });

  it("returns not reconciled when no subscription exists", async () => {
    selectReply = { data: { stripe_customer_id: "cus_abc" } };
    mockStripe.subscriptions.list.mockResolvedValue({ data: [] });

    const r = await reconcileOnCheckoutReturn("u1");

    expect(r.reconciled).toBe(false);
    expect(mockReconcile).not.toHaveBeenCalled();
  });
});

describe("reconcileStaleSubscriptions", () => {
  it("re-reconciles stale billing_subscriptions rows", async () => {
    mockServiceClient.from.mockImplementation((table: string) => {
      if (table === "billing_subscriptions") {
        return {
          select: () =>
            makeChain({
              data: [{ stripe_subscription_id: "sub_old" }],
            }),
        };
      }
      return { select: () => makeChain({ data: [] }) };
    });
    mockReconcile.mockResolvedValue({
      artistId: "u1",
      planTier: "plus",
      status: "active",
      duplicate: false,
      orphaned: false,
      stale: false,
    });

    const r = await reconcileStaleSubscriptions();

    expect(r.checked).toBeGreaterThanOrEqual(1);
    expect(r.reconciled).toBeGreaterThanOrEqual(1);
    expect(mockReconcile).toHaveBeenCalledWith("sub_old");
  });

  it("discovers orphaned customers without a subscription row", async () => {
    mockServiceClient.from.mockImplementation((table: string) => {
      if (table === "account_overrides") {
        return {
          select: () =>
            makeChain({
              data: [{ artist_id: "u2", stripe_customer_id: "cus_orphan" }],
            }),
        };
      }
      return { select: () => makeChain({ data: [] }) };
    });
    mockStripe.subscriptions.list.mockResolvedValue({
      data: [{ id: "sub_found" }],
    });
    mockReconcile.mockResolvedValue({
      artistId: "u2",
      planTier: "plus",
      status: "active",
      duplicate: false,
      orphaned: false,
      stale: false,
    });

    const r = await reconcileStaleSubscriptions();

    expect(r.reconciled).toBeGreaterThanOrEqual(1);
    expect(mockReconcile).toHaveBeenCalledWith("sub_found");
  });

  it("returns zeros when nothing needs reconciliation", async () => {
    mockServiceClient.from.mockImplementation(() => ({
      select: () => makeChain({ data: [] }),
    }));

    const r = await reconcileStaleSubscriptions();

    expect(r.checked).toBe(0);
    expect(r.reconciled).toBe(0);
    expect(r.errors).toBe(0);
  });
});
