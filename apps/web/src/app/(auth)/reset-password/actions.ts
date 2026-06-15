"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

type State = { error: string } | null;

export async function resetPasswordAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const password = formData.get("password") as string;
  const confirm = formData.get("confirm") as string;

  if (!password) return { error: "Password is required." };
  if (password.length < 8)
    return { error: "Password must be at least 8 characters." };
  if (password !== confirm) return { error: "Passwords don’t match." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) return { error: error.message };

  redirect("/dashboard");
}
