import { describe, it, expect, vi, beforeEach } from "vitest";
import { DEFAULT_OVERRIDES } from "@inklee/shared/entitlements";

// Mock the three factors so the composition (and its ORDER) is tested in
// isolation from the DB/env. getConnectRoutingForArtist is only called when no
// pre-derived routing is passed.
vi.mock("@/lib/server/app-config", () => ({
  isCapabilityDisabled: vi.fn(() => false),
}));
vi.mock("@/lib/entitlements-server", () => ({
  getAccountOverrides: vi.fn(),
}));
vi.mock("@/lib/stripe-connect", () => ({
  getConnectRoutingForArtist: vi.fn(),
}));

import { getDepositCollection } from "../deposit-collection";
import { isCapabilityDisabled } from "@/lib/server/app-config";
import { getAccountOverrides } from "@/lib/entitlements-server";
import { getConnectRoutingForArtist } from "@/lib/stripe-connect";

const plus = { ...DEFAULT_OVERRIDES, planTier: "plus" as const };
const free = { ...DEFAULT_OVERRIDES };
const routes = { routeCharges: true, stripeAccountId: "acct_1" };
const noRoutes = { routeCharges: false, stripeAccountId: null };

describe("getDepositCollection (BM-2.0 slice 1b predictor)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isCapabilityDisabled).mockReturnValue(false);
    vi.mocked(getAccountOverrides).mockResolvedValue(plus);
  });

  it("ok when the capability is on, the artist is entitled, and routing is live", async () => {
    expect(await getDepositCollection("a", { routing: routes })).toEqual({
      canCollectByCard: true,
      reason: "ok",
      feeTier: "plus",
      feeDisplay: { bps: 300, percentLabel: "3" },
    });
  });

  it("capability_paused beats everything, before the entitlement read", async () => {
    vi.mocked(isCapabilityDisabled).mockReturnValue(true);
    expect(await getDepositCollection("a", { routing: routes })).toEqual({
      canCollectByCard: false,
      reason: "capability_paused",
    });
    // A platform pause must not even reach the (fail-loud) entitlement read.
    expect(getAccountOverrides).not.toHaveBeenCalled();
  });

  it("not_entitled when the deposits entitlement is absent (the drift bug's real case)", async () => {
    vi.mocked(getAccountOverrides).mockResolvedValue(free);
    expect(await getDepositCollection("a", { routing: routes })).toEqual({
      canCollectByCard: false,
      reason: "not_entitled",
      // G1: still resolved on the not_entitled branch (the payouts settings
      // page describes what THIS artist would pay if they connected, not
      // only artists who already can). Plain Free (no grandfather) under the
      // ACTIVE v1 schedule still prices at the flat 3%.
      feeTier: "free",
      feeDisplay: { bps: 300, percentLabel: "3" },
    });
  });

  it("not_connected when entitled but Connect cannot route a charge", async () => {
    expect(await getDepositCollection("a", { routing: noRoutes })).toEqual({
      canCollectByCard: false,
      reason: "not_connected",
      feeTier: "plus",
      feeDisplay: { bps: 300, percentLabel: "3" },
    });
  });

  it("reads routing itself when no pre-derived routing is passed", async () => {
    vi.mocked(getConnectRoutingForArtist).mockResolvedValue(routes);
    expect(await getDepositCollection("a")).toEqual({
      canCollectByCard: true,
      reason: "ok",
      feeTier: "plus",
      feeDisplay: { bps: 300, percentLabel: "3" },
    });
    expect(getConnectRoutingForArtist).toHaveBeenCalledWith("a");
  });

  // G1: a grandfathered Free artist (holds card_deposit_collection) resolves
  // to `legacy`, not `free` — the distinction the payouts page's fee
  // sentence depends on once v2 activates (legacy keeps the historical 3%;
  // plain free would show null / "not part of your plan").
  it("a grandfathered Free artist resolves feeTier to legacy, not free", async () => {
    vi.mocked(getAccountOverrides).mockResolvedValue({
      ...free,
      entitlementOverrides: { card_deposit_collection: true },
    });
    const result = await getDepositCollection("a", { routing: routes });
    expect(result.canCollectByCard).toBe(true);
    expect(result.feeTier).toBe("legacy");
    expect(result.feeDisplay).toEqual({ bps: 300, percentLabel: "3" });
  });

  it("propagates a fail-loud entitlement read error (never resolves to free)", async () => {
    vi.mocked(getAccountOverrides).mockRejectedValue(new Error("boom"));
    await expect(
      getDepositCollection("a", { routing: routes }),
    ).rejects.toThrow("boom");
  });
});
