"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";
import { writeAudit } from "@/lib/audit";

type State = { error: string } | { success: true } | null;

export async function saveGeneralAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not authenticated" };

  const firstName = (formData.get("first_name") as string).trim();
  const lastName = (formData.get("last_name") as string).trim();
  const displayName = (formData.get("display_name") as string).trim();

  if (!displayName) return { error: "artist name is required" };

  const { error } = await supabase
    .from("profiles")
    .update({
      first_name: firstName || null,
      last_name: lastName || null,
      display_name: displayName,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) return { error: error.message.toLowerCase() };

  revalidatePath("/settings/account");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function requestEmailChangeAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not authenticated" };

  const newEmail = (formData.get("new_email") as string).trim().toLowerCase();
  if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail))
    return { error: "enter a valid email address" };
  if (newEmail === user.email) return { error: "this is already your email" };

  const { error } = await supabase.auth.updateUser({ email: newEmail });
  if (error) return { error: error.message.toLowerCase() };

  return { success: true };
}

export async function changePasswordAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) return { error: "not authenticated" };

  const currentPassword = formData.get("current_password") as string;
  const newPassword = formData.get("new_password") as string;
  const confirmPassword = formData.get("confirm_password") as string;

  if (!currentPassword || !newPassword || !confirmPassword)
    return { error: "all fields are required" };
  if (newPassword.length < 8)
    return { error: "new password must be at least 8 characters" };
  if (newPassword !== confirmPassword)
    return { error: "passwords do not match" };
  if (newPassword === currentPassword)
    return { error: "new password must be different from current password" };

  // Verify current password before allowing change.
  // signInWithPassword refreshes the session as a side-effect, which is acceptable here.
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (signInError) return { error: "current password is incorrect" };

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { error: error.message.toLowerCase() };

  void writeAudit({
    action: "password_changed",
    actor: user.id,
    category: "auth",
    details: { email: user.email },
  });

  return { success: true };
}

// Called from client components for auth events that happen client-side (2FA flows)
export async function logAuthEventAction(
  action: string,
  details: Record<string, unknown> = {},
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  void writeAudit({ action, actor: user.id, category: "auth", details });
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function saveMfaRecoveryCodesAction(
  codes: string[],
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not authenticated" };

  const hashes = await Promise.all(codes.map(sha256));

  const { data: profile } = await serviceClient
    .from("profiles")
    .select("settings")
    .eq("id", user.id)
    .single();
  const settings = (profile?.settings ?? {}) as Record<string, unknown>;

  await serviceClient
    .from("profiles")
    .update({ settings: { ...settings, mfa_recovery_codes: hashes } })
    .eq("id", user.id);

  return {};
}

export async function clearMfaRecoveryCodesAction(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: profile } = await serviceClient
    .from("profiles")
    .select("settings")
    .eq("id", user.id)
    .single();
  const settings = (profile?.settings ?? {}) as Record<string, unknown>;
  const { mfa_recovery_codes: _, ...rest } = settings;

  await serviceClient
    .from("profiles")
    .update({ settings: rest })
    .eq("id", user.id);
}
