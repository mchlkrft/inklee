"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { checkSignupRateLimit } from "@/lib/ratelimit";
import { getClientIp } from "@/lib/get-client-ip";
import { recordPublicServerEvent } from "@/lib/public-analytics/record-server";
import { validatePassword } from "@inklee/shared/auth-validation";

type State = { error: string } | { sent: true } | null;

export async function signUpAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const email = (formData.get("email") as string).trim();
  const password = formData.get("password") as string;
  const passwordConfirm = formData.get("password_confirm") as string;

  if (!email || !password) return { error: "Email and password are required." };
  const pwError = validatePassword(password);
  if (pwError) return { error: pwError };
  if (password !== passwordConfirm) {
    return { error: "Passwords do not match." };
  }

  const headerStore = await headers();
  const ip = getClientIp(headerStore);
  const { allowed } = await checkSignupRateLimit(ip);
  if (!allowed) {
    return { error: "Too many sign-up attempts. Please wait a few minutes." };
  }

  // Public acquisition funnel: a validated submission reached the server
  // (fire-and-forget; analytics must never affect signup).
  void recordPublicServerEvent("artist_signup_started", {
    headers: headerStore,
    pathname: "/signup",
    props: { method: "email" },
  });

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  });

  if (error) {
    if (error.message.toLowerCase().includes("already registered")) {
      return { error: "An account with that email already exists." };
    }
    return { error: error.message };
  }

  // Supabase returns success for an existing email too (enumeration
  // protection): the tell is an empty identities array. Only record the
  // conversion for a genuinely new account. Awaited so a once-per-account
  // conversion cannot be lost to serverless teardown; the recorder never
  // throws and cannot fail the signup.
  const isNewAccount = (data.user?.identities?.length ?? 0) > 0;
  if (isNewAccount) {
    await recordPublicServerEvent("artist_signup_completed", {
      headers: headerStore,
      pathname: "/signup",
      props: { method: "email" },
    });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // If email confirmation is disabled, user is logged in immediately
  if (user) {
    redirect("/onboarding/welcome");
  }

  return { sent: true };
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
