"use server";

import { createClient } from "@/lib/supabase/server";
import { headers } from "next/headers";
import { checkPasswordResetRateLimit } from "@/lib/ratelimit";
import { getClientIp } from "@/lib/get-client-ip";

type State = { error: string } | { sent: true } | null;

export async function forgotPasswordAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const email = (formData.get("email") as string).trim();
  if (!email) return { error: "Email is required." };

  // Rate limit by both IP and email to prevent targeted abuse
  const ip = getClientIp(await headers());
  const [byIp, byEmail] = await Promise.all([
    checkPasswordResetRateLimit(ip),
    checkPasswordResetRateLimit(`email:${email}`),
  ]);
  if (!byIp.allowed || !byEmail.allowed) return { sent: true }; // Silent: don't reveal whether email exists or limit was hit

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/reset-password`,
  });

  if (error) return { error: error.message };

  return { sent: true };
}
