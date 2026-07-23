// BM-2.0 slice 1b — the single, server-authoritative predictor of whether a
// deposit request will collect by CARD or degrade to a MANUAL deposit. Both the
// web request-detail page and the mobile deposit form read this one result, so
// the three-factor gate can never drift between surfaces again (previously the
// mobile form omitted the entitlement and the web page omitted the capability
// pause, each predicting with a different two of the three factors while the
// server core requires all three).
//
// This is a DISPLAY predictor. The authoritative enforcement stays in
// `requestDepositCore` (bookings.ts), which re-derives the same gate at request
// time. The two must agree; keeping the composition in one function is how.

import {
  getConnectRoutingForArtist,
  type ConnectRouting,
} from "@/lib/stripe-connect";
import { getAccountOverrides } from "@/lib/entitlements-server";
import { canAccess } from "@/lib/entitlements";
import { isCapabilityDisabled } from "@/lib/server/app-config";
import type { DepositCollectionReason } from "@inklee/shared/mobile-api";

export type DepositCollection = {
  canCollectByCard: boolean;
  reason: DepositCollectionReason;
};

/**
 * Resolve whether a card deposit will route for `artistId`, in the SAME order
 * `requestDepositCore` enforces: a platform-wide `deposits` pause beats
 * everything, then the `deposits` entitlement, then Connect card routing.
 *
 * Pass `opts.routing` when the caller already has the artist's Connect routing
 * (e.g. the mobile payouts route derived it from the profile row it just read)
 * to avoid a redundant service-role read.
 *
 * THROWS only if `getAccountOverrides` throws — that read is fail-loud by
 * money-path design (a swallowed error must never read as "free plan"). A
 * caller that only DISPLAYS state should catch and fall back to the manual copy
 * rather than erroring the whole screen, because the server core re-checks at
 * request time regardless.
 */
export async function getDepositCollection(
  artistId: string,
  opts?: { routing?: ConnectRouting },
): Promise<DepositCollection> {
  if (isCapabilityDisabled("deposits")) {
    return { canCollectByCard: false, reason: "capability_paused" };
  }
  const overrides = await getAccountOverrides(artistId);
  if (!canAccess(overrides, "deposits")) {
    return { canCollectByCard: false, reason: "not_entitled" };
  }
  const routing = opts?.routing ?? (await getConnectRoutingForArtist(artistId));
  if (!routing.routeCharges) {
    return { canCollectByCard: false, reason: "not_connected" };
  }
  return { canCollectByCard: true, reason: "ok" };
}
