import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { syncConnectAccount } from "@/lib/stripe-connect";

// Stripe redirects the artist here once they finish (or close) the hosted
// onboarding flow. The query string is NOT trusted — we re-fetch the account
// from Stripe and persist whatever the canonical state is. Then we bounce
// back to /settings/payouts where the UI reflects the new status.
export default async function PayoutsReturnPage() {
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
  if (accountId) {
    await syncConnectAccount({ userId: user.id, accountId });
  }
  redirect("/settings/payouts");
}
