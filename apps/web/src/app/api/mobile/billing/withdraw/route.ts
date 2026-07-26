import * as Sentry from "@sentry/nextjs";
import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { withdrawSubscriptionCore } from "@/lib/server/billing/withdrawal";
import type { MobileBillingWithdrawResult } from "@inklee/shared/mobile-api";

export const runtime = "nodejs";

// Consumer statutory withdrawal (Art. 11a), distinct from cancellation. The
// SAME idempotent core the web plan page uses: 14-day window gate, fixed-
// receipt-time proration, partial refund on Inklee's own charge, downgrade,
// durable acknowledgement, credit-note snapshot. Not a purchase (D17-safe).
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
    return mobileError(400, "Please confirm your withdrawal to continue.");
  }

  try {
    const result = await withdrawSubscriptionCore({ artistId: auth.userId });
    const body: MobileBillingWithdrawResult =
      result.status === "completed"
        ? {
            status: "completed",
            refundMinor: result.refundMinor,
            currency: result.currency,
          }
        : result.status === "not_available"
          ? { status: "not_available", reason: result.reason }
          : { status: "no_subscription" };
    return mobileOk(body);
  } catch (e) {
    // A refund that cannot be issued is a money-path failure: capture it, the
    // user only sees "try again".
    Sentry.captureException(e, {
      tags: { action: "mobile_billing_withdraw" },
      extra: { artistId: auth.userId },
    });
    return mobileError(
      500,
      "Something went wrong processing your withdrawal. Please try again, or write to support@inklee.app.",
    );
  }
}
