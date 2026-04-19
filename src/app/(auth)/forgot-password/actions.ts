"use server";

import { createClient } from "@/lib/supabase/server";

type State = { error: string } | { sent: true } | null;

export async function forgotPasswordAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const email = (formData.get("email") as string).trim();
  if (!email) return { error: "email is required" };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/reset-password`,
  });

  if (error) return { error: error.message.toLowerCase() };

  return { sent: true };
}
