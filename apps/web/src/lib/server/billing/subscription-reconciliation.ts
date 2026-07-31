import "server-only";
import * as Sentry from "@sentry/nextjs";
import { serviceClient } from "@/lib/supabase/service";
import { requireStripe } from "./client";
import { reconcileSubscriptionById, type ReconcileResult } from "./reconcile";

// C4 RECONCILIATION BACKSTOP for billing subscriptions.
//
// Two entry points:
// 1. reconcileOnCheckoutReturn — called when the user lands on
//    /settings/plan?checkout=success. Looks up their most recent completed
//    Checkout Session and reconciles the subscription if the webhook hasn't
//    yet. Idempotent: reconcile converges to a target.
// 2. reconcileStaleSubscriptions — cron backstop. Finds billing_subscriptions
//    rows not reconciled in the last N hours, re-fetches each from Stripe,
//    and reconciles. Also catches subscriptions that exist in Stripe but have
//    no billing_subscriptions row by scanning account_overrides with a
//    customer id.

export type CheckoutReconcileResult = {
  reconciled: boolean;
  result: ReconcileResult | null;
};

export async function reconcileOnCheckoutReturn(
  userId: string,
): Promise<CheckoutReconcileResult> {
  try {
    const stripe = requireStripe();

    const { data: overrides } = await serviceClient
      .from("account_overrides")
      .select("stripe_customer_id")
      .eq("artist_id", userId)
      .maybeSingle();

    const customerId = overrides?.stripe_customer_id as string | null;
    if (!customerId) return { reconciled: false, result: null };

    const subs = await stripe.subscriptions.list({
      customer: customerId,
      limit: 1,
    });
    const sub = subs.data[0];
    if (!sub) return { reconciled: false, result: null };

    const result = await reconcileSubscriptionById(sub.id);
    return { reconciled: true, result };
  } catch (e) {
    Sentry.captureException(e, {
      tags: { action: "billing_checkout_return_reconcile" },
      extra: { userId },
    });
    return { reconciled: false, result: null };
  }
}

export type CronReconcileResult = {
  checked: number;
  reconciled: number;
  errors: number;
};

export async function reconcileStaleSubscriptions(
  options: { staleHours?: number } = {},
): Promise<CronReconcileResult> {
  const result: CronReconcileResult = { checked: 0, reconciled: 0, errors: 0 };

  try {
    const stripe = requireStripe();
    const staleHours = options.staleHours ?? 4;
    const cutoff = new Date(
      Date.now() - staleHours * 60 * 60 * 1000,
    ).toISOString();

    // 1. Re-reconcile known subscriptions that haven't been touched recently.
    const { data: stale } = await serviceClient
      .from("billing_subscriptions")
      .select("stripe_subscription_id")
      .lt("last_reconciled_at", cutoff)
      .limit(20);

    for (const row of stale ?? []) {
      const subId = row.stripe_subscription_id as string;
      result.checked++;
      try {
        await reconcileSubscriptionById(subId);
        result.reconciled++;
      } catch (e) {
        Sentry.captureException(e, {
          tags: { action: "billing_cron_reconcile" },
          extra: { subscriptionId: subId },
        });
        result.errors++;
      }
    }

    // 2. Check for customers whose subscription might not have a
    // billing_subscriptions row at all (webhook was permanently lost).
    const { data: customers } = await serviceClient
      .from("account_overrides")
      .select("artist_id, stripe_customer_id")
      .not("stripe_customer_id", "is", null)
      .is("stripe_subscription_id", null)
      .limit(20);

    for (const row of customers ?? []) {
      const customerId = row.stripe_customer_id as string;
      result.checked++;
      try {
        const subs = await stripe.subscriptions.list({
          customer: customerId,
          limit: 1,
        });
        const sub = subs.data[0];
        if (sub) {
          await reconcileSubscriptionById(sub.id);
          result.reconciled++;
        }
      } catch (e) {
        Sentry.captureException(e, {
          tags: { action: "billing_cron_reconcile_orphan" },
          extra: { customerId, artistId: row.artist_id },
        });
        result.errors++;
      }
    }
  } catch (e) {
    Sentry.captureException(e, {
      tags: { action: "billing_cron_reconcile_init" },
    });
  }

  return result;
}
