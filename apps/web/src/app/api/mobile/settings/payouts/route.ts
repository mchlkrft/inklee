import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import type { MobilePayouts } from "@inklee/shared/mobile-api";

export const runtime = "nodejs";

// GET /api/mobile/settings/payouts — the artist's Stripe Connect payout status
// (stored, fast). Live requirements + KYC happen in an in-app browser later.
export async function GET(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  const { data } = await supabase
    .from("profiles")
    .select(
      "stripe_account_status, stripe_charges_enabled, stripe_payouts_enabled, stripe_account_country",
    )
    .eq("id", userId)
    .single();

  const body: MobilePayouts = {
    status: (data?.stripe_account_status as string) ?? "unset",
    chargesEnabled: !!data?.stripe_charges_enabled,
    payoutsEnabled: !!data?.stripe_payouts_enabled,
    country: (data?.stripe_account_country as string | null) ?? null,
  };
  return mobileOk(body);
}
