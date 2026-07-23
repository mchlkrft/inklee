import { NextResponse } from "next/server";
import Stripe from "stripe";
import * as Sentry from "@sentry/nextjs";
import { reconcileSubscriptionById } from "@/lib/server/billing/reconcile";

export const runtime = "nodejs";

// ISOLATED subscription webhook (amendment 6). This endpoint is DISJOINT from
// the deposit webhook (/api/stripe/webhook): its own route, its own signing
// secret (STRIPE_BILLING_WEBHOOK_SECRET), and it handles ONLY subscription and
// invoice events. It never touches bookings, deposits, Connect, or a
// reverse_transfer. Reconciliation converges to a target, so Stripe redelivery
// and out-of-order events are safe with no explicit dedup table.
export async function POST(request: Request) {
  const secret = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_BILLING_WEBHOOK_SECRET;

  if (!secret || !webhookSecret) {
    return NextResponse.json(
      { error: "Billing webhook not configured" },
      { status: 400 },
    );
  }

  const body = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing signature" }, { status: 400 });
  }

  const stripe = new Stripe(secret);
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        // Re-fetch CURRENT truth instead of trusting the event's frozen
        // snapshot. Stripe does not guarantee event ordering and, on a failed
        // (500) delivery, redelivers the ORIGINAL payload; reconciling that
        // snapshot lets a stale event clobber newer state (a canceled artist
        // could regain Plus, or a paying artist lose it). reconcileSubscriptionById
        // reads the live subscription (a canceled one still resolves to
        // status=canceled), so redelivery and out-of-order events converge
        // correctly. event.created feeds the monotonic ordering guard in
        // reconcile, which closes the residual concurrent-processing window.
        const snap = event.data.object as Stripe.Subscription;
        const r = await reconcileSubscriptionById(snap.id, event.created);
        return NextResponse.json({ received: true, reconciled: r });
      }

      case "invoice.paid":
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        // basil (2025-03-31) removed the top-level invoice.subscription; on the
        // pinned dahlia API it lives at parent.subscription_details.subscription.
        // Read the current path first, then fall back to the legacy top-level
        // for any pre-basil serialization.
        const parentSub =
          invoice.parent?.subscription_details?.subscription ?? null;
        const legacySub =
          (
            invoice as unknown as {
              subscription?: string | { id: string } | null;
            }
          ).subscription ?? null;
        const raw = parentSub ?? legacySub;
        const subId = typeof raw === "string" ? raw : (raw?.id ?? null);
        if (subId) {
          await reconcileSubscriptionById(subId, event.created);
        }
        return NextResponse.json({ received: true, subscription: subId });
      }

      default:
        // Acknowledge everything else so Stripe does not retry an event this
        // endpoint intentionally ignores.
        return NextResponse.json({ received: true, ignored: event.type });
    }
  } catch (e) {
    // A genuine failure (DB error) returns 500 so Stripe redelivers; the
    // converge-to-target reconcile makes that retry safe.
    Sentry.captureException(e, {
      tags: { action: "billing_webhook" },
      extra: { eventType: event.type, eventId: event.id },
    });
    return NextResponse.json(
      { error: "reconciliation failed" },
      { status: 500 },
    );
  }
}
