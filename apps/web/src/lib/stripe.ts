import Stripe from "stripe";

const secretKey = process.env.STRIPE_SECRET_KEY;

// Warn if test-mode keys are used in a production environment
if (
  secretKey &&
  secretKey.startsWith("sk_test_") &&
  process.env.NODE_ENV === "production"
) {
  console.warn(
    "[stripe] WARNING: test-mode key detected in production environment — " +
      "real payments will NOT be processed. Set STRIPE_SECRET_KEY to a live key before launch.",
  );
}

// Server-side Stripe client — null when STRIPE_SECRET_KEY is not set
// (graceful degradation: deposit tracking works without Stripe)
export const stripe = secretKey ? new Stripe(secretKey) : null;

// Client-side publishable key — safe to expose
export const stripePublishableKey =
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null;
