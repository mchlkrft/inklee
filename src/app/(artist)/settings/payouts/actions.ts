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
import {
  isSupportedConnectCountry,
  DEFAULT_CONNECT_COUNTRY,
} from "@/lib/connect-countries";

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
  formData?: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

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

  // F9 (RS-5): the connected account's country is fixed at creation, so we
  // collect it on the payouts page before the first onboarding instead of
  // letting Stripe default to the platform country (US in sandbox). Order of
  // preference: the artist's just-submitted choice → a country already on the
  // profile (re-onboarding) → the default market. `ensureConnectAccount`
  // ignores `country` once an account exists, so this only bites at creation.
  const submittedCountry = formData?.get("country");
  const country = isSupportedConnectCountry(submittedCountry)
    ? submittedCountry
    : isSupportedConnectCountry(profile?.stripe_account_country)
      ? (profile!.stripe_account_country as string)
      : DEFAULT_CONNECT_COUNTRY;

  const ensured = await ensureConnectAccount({
    userId: user.id,
    email,
    existingAccountId: profile?.stripe_account_id ?? null,
    country,
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
