import { redirect } from "next/navigation";

// Deposits moved to /bookings/deposits 2026-05-24 — they belong to the
// booking workflow, not account configuration. Keep this redirect for
// bookmarks + the onboarding-done CTA that may still be cached.
export default function SettingsDepositsRedirect() {
  redirect("/bookings/deposits");
}
