"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { checkLoginRateLimit } from "@/lib/ratelimit";

type State = { error: string } | null;

export async function loginAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const ip = (await headers()).get("x-forwarded-for") ?? "unknown";
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

  redirect("/dashboard");
}
