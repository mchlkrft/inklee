"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { checkLoginRateLimit } from "@/lib/ratelimit";
import { getClientIp } from "@/lib/get-client-ip";
import { sanitizeReturnPath } from "@/lib/return-path";

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

  // Return target from a sign-in wall (the public map, go-live plan S2).
  // Sanitized to a same-origin relative path; anything else falls back to the
  // dashboard. Accounts without a profile still route through onboarding
  // above (resuming the intended action after onboarding is a named
  // fast-follow, not this slice).
  const next = sanitizeReturnPath(formData.get("next"));
  redirect(next ?? "/dashboard");
}
