import { redirect } from "next/navigation";

// Legacy route from the Stripe-hosted onboarding flow (Slice 79 moved payout
// setup fully in-app, so Stripe no longer redirects here). Kept as a redirect
// so any stale bookmark still resolves.
export default async function PayoutsRefreshPage() {
  redirect("/settings/payouts");
}
