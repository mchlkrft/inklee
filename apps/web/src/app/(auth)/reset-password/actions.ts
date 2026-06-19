"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { validatePassword } from "@inklee/shared/auth-validation";

type State = { error: string } | null;

export async function resetPasswordAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const password = formData.get("password") as string;
  const confirm = formData.get("confirm") as string;

  if (!password) return { error: "Password is required." };
  const pwError = validatePassword(password);
  if (pwError) return { error: pwError };
  if (password !== confirm) return { error: "Passwords don’t match." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) return { error: error.message };

  redirect("/dashboard");
}
