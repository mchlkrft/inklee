import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createConnectOnboardingLink } from "@/lib/stripe-connect";

// Stripe sends the artist here when the AccountLink they were on expires
// (the link's lifetime is ~5 minutes). We mint a fresh one and redirect
// straight back into Stripe's hosted onboarding so the artist isn't bounced
// out of the flow.
export default async function PayoutsRefreshPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_account_id")
    .eq("id", user.id)
    .single();
  const accountId = profile?.stripe_account_id as string | null;
  if (!accountId) redirect("/settings/payouts");

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://inklee.app";
  const link = await createConnectOnboardingLink({
    accountId,
    returnUrl: `${base}/settings/payouts/return`,
    refreshUrl: `${base}/settings/payouts/refresh`,
  });
  if ("error" in link) {
    // Can't mint a new link — kick back to the settings page so the artist
    // can retry via the standard CTA.
    redirect("/settings/payouts");
  }
  redirect(link.url);
}
