"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { checkLoginRateLimit } from "@/lib/ratelimit";
import { getClientIp } from "@/lib/get-client-ip";

type State = { error: string } | null;

export async function loginAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const ip = getClientIp(await headers());
  const { allowed } = await checkLoginRateLimit(ip);
  if (!allowed)
    return {
      error: "Too many login attempts — please wait a few minutes.",
    };

  const email = (formData.get("email") as string).trim();
  const password = formData.get("password") as string;

  if (!email || !password) return { error: "Email and password are required." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Credentials are correct but the email was never confirmed: say so, and
    // point to the de-facto resend (signing up again with the same email mints a
    // fresh link). Genuine bad credentials stay generic so we don't leak whether
    // an account exists.
    if (
      error.code === "email_not_confirmed" ||
      /not confirmed/i.test(error.message)
    ) {
      return {
        error:
          "Confirm your email first. Check your inbox for the confirmation link, or sign up again with the same email to get a new one.",
      };
    }
    return { error: "Invalid email or password." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("slug")
    .eq("id", (await supabase.auth.getUser()).data.user!.id)
    .single();

  if (!profile) {
    redirect("/onboarding/welcome");
  }

  redirect("/dashboard");
}
