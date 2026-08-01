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
import { appointmentTierFromOverrides, canAccess } from "@/lib/entitlements";
import { isCapabilityDisabled } from "@/lib/server/app-config";
import {
  appointmentFeeDisplay,
  type PaymentTier,
} from "@inklee/shared/fee-schedule";
import type { DepositCollectionReason } from "@inklee/shared/mobile-api";

export type DepositCollection = {
  canCollectByCard: boolean;
  reason: DepositCollectionReason;
  /** The artist's resolved appointment-lane fee tier (G1, FEE-DSP-001/
   *  FEE-STP-001). Absent only on the `capability_paused` refusal, which
   *  returns before the overrides read that resolves it — every other
   *  branch already reads overrides, so this costs no extra query. */
  feeTier?: PaymentTier;
  /** The lane's bps + trimmed percent label for `feeTier`, or `null` when
   *  that tier cannot transact the appointment lane at all under the active
   *  schedule (v2 Free) — NEVER a fabricated 0%. Same availability as
   *  `feeTier`. Powers the fee line on the request-detail accept dialog and
   *  the payouts settings page, so both read ONE resolution instead of
   *  re-deriving it. */
  feeDisplay?: { bps: number; percentLabel: string } | null;
};

/**
 * Resolve whether a card deposit will route for `artistId`, in the SAME order
 * `requestDepositCore` enforces: a platform-wide `deposits` pause beats
 * everything, then the `card_deposit_collection` entitlement, then Connect
 * card routing.
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
  // G1: resolved from the SAME read the entitlement check below already
  // requires, so this is not an extra query. Computed regardless of the
  // entitlement/routing outcome (not only on the `ok` branch): the payouts
  // settings page describes the fee an artist WOULD pay if they connected,
  // which is exactly the `not_entitled` / `not_connected` cases too.
  const feeTier = appointmentTierFromOverrides(overrides);
  const feeDisplay = appointmentFeeDisplay(feeTier);
  if (!canAccess(overrides, "card_deposit_collection")) {
    return {
      canCollectByCard: false,
      reason: "not_entitled",
      feeTier,
      feeDisplay,
    };
  }
  const routing = opts?.routing ?? (await getConnectRoutingForArtist(artistId));
  if (!routing.routeCharges) {
    return {
      canCollectByCard: false,
      reason: "not_connected",
      feeTier,
      feeDisplay,
    };
  }
  return { canCollectByCard: true, reason: "ok", feeTier, feeDisplay };
}
