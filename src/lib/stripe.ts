import Stripe from "stripe";

// Server-side Stripe client — null when STRIPE_SECRET_KEY is not set
// (graceful degradation: deposit tracking works without Stripe)
export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

// Client-side publishable key — safe to expose
export const stripePublishableKey =
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null;
