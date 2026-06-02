"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  createConnectOnboardingLink,
  ensureConnectAccount,
  syncConnectAccount,
  type ConnectStatus,
} from "@/lib/stripe-connect";

type ActionState = { error: string } | null;

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://inklee.app";
}

/**
 * Begin Stripe Connect onboarding for the signed-in artist. Idempotent:
 * re-clicking the CTA after an abandoned onboarding re-uses the same
 * `stripe_account_id` and just mints a fresh AccountLink. On success
 * redirects to Stripe's hosted onboarding URL; failures bubble back as a
 * useActionState-shaped error.
 */
export async function startConnectOnboardingAction(
  _prev: ActionState,
): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  // Pull the artist's existing Connect state + the email we need to seed the
  // Express account with. Stripe also asks for a country at create-time —
  // for now we let Stripe infer from the artist's location during
  // onboarding; if we later collect a country in profile settings, pass it
  // here via `country`.
  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_account_id, stripe_account_country")
    .eq("id", user.id)
    .single();

  const email = user.email;
  if (!email) {
    return {
      error: "Your account needs an email before connecting Stripe.",
    };
  }

  const ensured = await ensureConnectAccount({
    userId: user.id,
    email,
    existingAccountId: profile?.stripe_account_id ?? null,
    ...(profile?.stripe_account_country
      ? { country: profile.stripe_account_country as string }
      : {}),
  });
  if ("error" in ensured) return { error: ensured.error };

  const base = appUrl();
  const link = await createConnectOnboardingLink({
    accountId: ensured.id,
    returnUrl: `${base}/settings/payouts/return`,
    refreshUrl: `${base}/settings/payouts/refresh`,
  });
  if ("error" in link) return { error: link.error };

  // redirect() throws an internal NEXT_REDIRECT — must be called outside any
  // try/catch above. Any subsequent rendering is moot.
  redirect(link.url);
}

type SyncState = { ok: true; status: ConnectStatus } | { error: string } | null;

/**
 * Re-fetch the account from Stripe and persist the derived status. Called
 * by the return URL page after Stripe redirects the artist back, and by the
 * settings page's "Refresh status" button if onboarding stalls.
 */
export async function syncConnectAccountAction(
  _prev: SyncState,
): Promise<SyncState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_account_id")
    .eq("id", user.id)
    .single();
  const accountId = profile?.stripe_account_id as string | null;
  if (!accountId) {
    return { error: "No Stripe account is connected yet." };
  }

  const result = await syncConnectAccount({
    userId: user.id,
    accountId,
  });
  if ("error" in result) return { error: result.error };
  revalidatePath("/settings/payouts");
  return { ok: true, status: result.status };
}
