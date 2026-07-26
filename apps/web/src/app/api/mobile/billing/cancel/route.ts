import * as Sentry from "@sentry/nextjs";
import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { cancelSubscriptionCore } from "@/lib/server/billing/cancellation";
import type { MobileBillingCancelResult } from "@inklee/shared/mobile-api";

export const runtime = "nodejs";

// Ordinary cancellation (s312k Kuendigung), distinct from withdrawal: ends
// Plus at the END of the paid period, no refund, durable receipt confirmation.
// The SAME idempotent core the web settings/account section uses. Not a
// purchase (D17-safe).
//
// DELIBERATELY not behind PLUS_CONSUMER_LAUNCH_ENABLED or a capability:
// statutory rights of an existing subscriber must stay reachable even if the
// purchase surface is dark or rolled back (docs/web-native-parity.md ground
// rules). No subscriber exists while the launch flag is off, so the route
// leaks nothing.
export async function POST(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);

  let confirmed = false;
  try {
    const body = (await req.json()) as { confirmed?: unknown };
    confirmed = body.confirmed === true;
  } catch {
    // fall through: unconfirmed
  }
  if (!confirmed) {
    return mobileError(400, "Please confirm to cancel your subscription.");
  }

  try {
    const result = await cancelSubscriptionCore({ artistId: auth.userId });
    return mobileOk(result satisfies MobileBillingCancelResult);
  } catch (e) {
    Sentry.captureException(e, {
      tags: { action: "mobile_billing_cancel" },
      extra: { artistId: auth.userId },
    });
    return mobileError(
      500,
      "Something went wrong cancelling your subscription. Please try again, or write to support@inklee.app.",
    );
  }
}
