import { stripe } from "@/lib/stripe";

// Subscriptions REUSE the shared Stripe client (same key, same pinned SDK
// apiVersion). We deliberately do NOT construct a second client with a
// different apiVersion: that shared client also runs live deposits, and a
// version/scope swap inside the billing code would ride the deposit path
// (money-path review HIGH-3). Isolation is enforced at the operation level
// (separate handlers, idempotency namespaces, metadata, refund commands), never
// by forking the client.
export function requireStripe() {
  if (!stripe) {
    throw new Error("Stripe is not configured (STRIPE_SECRET_KEY missing).");
  }
  return stripe;
}
