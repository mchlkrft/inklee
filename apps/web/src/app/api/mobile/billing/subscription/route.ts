import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { getSubscriptionCancellationInfo } from "@/lib/server/billing/cancellation";
import { getWithdrawalWindow } from "@/lib/server/billing/withdrawal";
import type { MobileBillingSubscription } from "@inklee/shared/mobile-api";

export const runtime = "nodejs";

// Read-only subscription management state for the native plan screen. NO
// prices and NO purchase surface (decision D17: billing is web-only / no IAP);
// this powers the statutory management functions only (s312k cancellation +
// Art. 11a withdrawal). Cheap reads: account_overrides mirror + one Stripe
// fetch for the withdrawal window (fail-safe inside the core).
export async function GET(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);

  const info = await getSubscriptionCancellationInfo(auth.userId);
  const withdrawal = info.hasActiveSubscription
    ? await getWithdrawalWindow(auth.userId)
    : { hasSubscription: false, deadline: null, withinWindow: false };

  const body: MobileBillingSubscription = {
    hasActiveSubscription: info.hasActiveSubscription,
    currentPeriodEnd: info.effectiveAt,
    cancelAtPeriodEnd: info.alreadyScheduled,
    withdrawal,
  };
  return mobileOk(body);
}
