"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

type State = { error: string } | null;

export async function loginAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const email = (formData.get("email") as string).trim();
  const password = formData.get("password") as string;

  if (!email || !password) return { error: "email and password are required" };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "invalid email or password" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("slug")
    .eq("id", (await supabase.auth.getUser()).data.user!.id)
    .single();

  if (!profile) {
    redirect("/onboarding/claim-slug");
  }

  redirect("/dashboard");
}
