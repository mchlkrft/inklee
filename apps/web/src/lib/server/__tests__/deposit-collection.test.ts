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
    });
  });

  it("not_connected when entitled but Connect cannot route a charge", async () => {
    expect(await getDepositCollection("a", { routing: noRoutes })).toEqual({
      canCollectByCard: false,
      reason: "not_connected",
    });
  });

  it("reads routing itself when no pre-derived routing is passed", async () => {
    vi.mocked(getConnectRoutingForArtist).mockResolvedValue(routes);
    expect(await getDepositCollection("a")).toEqual({
      canCollectByCard: true,
      reason: "ok",
    });
    expect(getConnectRoutingForArtist).toHaveBeenCalledWith("a");
  });

  it("propagates a fail-loud entitlement read error (never resolves to free)", async () => {
    vi.mocked(getAccountOverrides).mockRejectedValue(new Error("boom"));
    await expect(
      getDepositCollection("a", { routing: routes }),
    ).rejects.toThrow("boom");
  });
});
