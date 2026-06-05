"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

type State = { error: string } | { sent: true } | null;

export async function signUpAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const email = (formData.get("email") as string).trim();
  const password = formData.get("password") as string;

  if (!email || !password) return { error: "Email and password are required." };
  if (password.length < 8)
    return { error: "Password must be at least 8 characters." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
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
