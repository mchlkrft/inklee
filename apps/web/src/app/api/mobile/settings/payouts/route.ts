import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { syncConnectAccount } from "@/lib/stripe-connect";
import type { MobilePayouts } from "@inklee/shared/mobile-api";

export const runtime = "nodejs";

const PAYOUT_COLUMNS =
  "stripe_account_status, stripe_charges_enabled, stripe_payouts_enabled, stripe_account_country";

function toPayouts(data: Record<string, unknown> | null): MobilePayouts {
  return {
    status: (data?.stripe_account_status as string) ?? "unset",
    chargesEnabled: !!data?.stripe_charges_enabled,
    payoutsEnabled: !!data?.stripe_payouts_enabled,
    country: (data?.stripe_account_country as string | null) ?? null,
  };
}

// GET /api/mobile/settings/payouts — the artist's Stripe Connect payout status
// (stored, fast). Live requirements + KYC happen in an in-app browser later.
export async function GET(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  const { data } = await supabase
    .from("profiles")
    .select(PAYOUT_COLUMNS)
    .eq("id", userId)
    .single();

  return mobileOk(toPayouts(data));
}

// POST /api/mobile/settings/payouts — re-fetch the Connect account from Stripe and
// persist the derived status (the "Refresh status" button while Stripe verifies).
// Ports syncConnectAccountAction.
export async function POST(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_account_id, stripe_account_status")
    .eq("id", userId)
    .single();
  const accountId = (profile?.stripe_account_id as string | null) ?? null;
  const status = (profile?.stripe_account_status as string | null) ?? null;

  // Don't call Stripe for an account we no longer control (deauthorized → status
  // "unset" but id retained) or one never created — Stripe would 403/404.
  if (!accountId || status === "unset") {
    return mobileError(409, "No payout account to refresh yet.", "no_account");
  }

  const result = await syncConnectAccount({ userId, accountId });
  if ("error" in result) return mobileError(502, result.error, "sync_failed");

  const { data } = await supabase
    .from("profiles")
    .select(PAYOUT_COLUMNS)
    .eq("id", userId)
    .single();
  return mobileOk(toPayouts(data));
}
