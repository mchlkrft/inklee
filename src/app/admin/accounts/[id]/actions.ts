"use server";

import { getAdminId } from "@/lib/admin-guard";
import { serviceClient } from "@/lib/supabase/service";
import { writeAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";

type Result = { error?: string; data?: Record<string, unknown> };

async function logAdminAction(
  adminUserId: string,
  targetUserId: string,
  action: string,
  reason?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await Promise.all([
    serviceClient.from("admin_action_log").insert({
      admin_user_id: adminUserId,
      target_user_id: targetUserId,
      action,
      reason: reason ?? null,
      metadata: metadata ?? {},
    }),
    writeAudit({
      action: `admin_account_${action}`,
      actor: adminUserId,
      category: "admin",
      details: { target_user_id: targetUserId, reason, ...metadata },
    }),
  ]);
}

/** Verify the target profile exists and belongs to this admin operation. */
async function fetchTargetProfile(targetUserId: string) {
  const { data } = await serviceClient
    .from("profiles")
    .select("id, display_name, account_status")
    .eq("id", targetUserId)
    .single();
  return data;
}

// ── Suspend account ──────────────────────────────────────────────────────────

export async function suspendAccountAction(
  targetUserId: string,
  reason: string,
): Promise<Result> {
  const adminId = await getAdminId();
  if (!adminId) return { error: "unauthorized" };
  if (adminId === targetUserId)
    return { error: "you cannot suspend your own account" };

  const profile = await fetchTargetProfile(targetUserId);
  if (!profile) return { error: "account not found" };
  if (profile.account_status === "suspended")
    return { error: "account is already suspended" };
  if (profile.account_status === "archived")
    return { error: "account is archived — reactivate first" };

  const now = new Date().toISOString();

  const [profileResult, banResult] = await Promise.all([
    serviceClient
      .from("profiles")
      .update({
        account_status: "suspended",
        suspended_at: now,
        suspended_reason: reason || null,
        updated_at: now,
      })
      .eq("id", targetUserId),
    // Ban the auth user so they cannot sign in while suspended
    serviceClient.auth.admin.updateUserById(targetUserId, {
      ban_duration: "87600h", // 10 years — effectively permanent until reactivated
    }),
  ]);

  if (profileResult.error) return { error: profileResult.error.message };
  if (banResult.error)
    console.error("[admin] ban failed:", banResult.error.message);

  await logAdminAction(adminId, targetUserId, "suspend", reason);

  revalidatePath("/admin");
  revalidatePath(`/admin/accounts/${targetUserId}`);
  return {};
}

// ── Reactivate account ───────────────────────────────────────────────────────

export async function reactivateAccountAction(
  targetUserId: string,
): Promise<Result> {
  const adminId = await getAdminId();
  if (!adminId) return { error: "unauthorized" };

  const profile = await fetchTargetProfile(targetUserId);
  if (!profile) return { error: "account not found" };
  if (profile.account_status === "active")
    return { error: "account is already active" };

  const now = new Date().toISOString();

  const [profileResult, unbanResult] = await Promise.all([
    serviceClient
      .from("profiles")
      .update({
        account_status: "active",
        suspended_at: null,
        suspended_reason: null,
        deleted_at: null,
        updated_at: now,
      })
      .eq("id", targetUserId),
    // Lift the auth ban
    serviceClient.auth.admin.updateUserById(targetUserId, {
      ban_duration: "none",
    }),
  ]);

  if (profileResult.error) return { error: profileResult.error.message };
  if (unbanResult.error)
    console.error("[admin] unban failed:", unbanResult.error.message);

  await logAdminAction(adminId, targetUserId, "reactivate");

  revalidatePath("/admin");
  revalidatePath(`/admin/accounts/${targetUserId}`);
  return {};
}

// ── Archive account (soft delete) ────────────────────────────────────────────

export async function archiveAccountAction(
  targetUserId: string,
  reason: string,
): Promise<Result> {
  const adminId = await getAdminId();
  if (!adminId) return { error: "unauthorized" };
  if (adminId === targetUserId)
    return { error: "you cannot archive your own account" };

  const profile = await fetchTargetProfile(targetUserId);
  if (!profile) return { error: "account not found" };
  if (profile.account_status === "archived")
    return { error: "account is already archived" };

  const now = new Date().toISOString();

  const [profileResult, banResult] = await Promise.all([
    serviceClient
      .from("profiles")
      .update({
        account_status: "archived",
        deleted_at: now,
        deleted_by: adminId,
        suspended_at: now,
        suspended_reason: reason || "archived by admin",
        updated_at: now,
      })
      .eq("id", targetUserId),
    serviceClient.auth.admin.updateUserById(targetUserId, {
      ban_duration: "87600h",
    }),
  ]);

  if (profileResult.error) return { error: profileResult.error.message };
  if (banResult.error)
    console.error("[admin] ban failed:", banResult.error.message);

  await logAdminAction(adminId, targetUserId, "archive", reason, {
    deleted_by: adminId,
  });

  revalidatePath("/admin");
  revalidatePath(`/admin/accounts/${targetUserId}`);
  return {};
}

// ── Reset onboarding ─────────────────────────────────────────────────────────

export async function resetOnboardingAction(
  targetUserId: string,
): Promise<Result> {
  const adminId = await getAdminId();
  if (!adminId) return { error: "unauthorized" };

  const { data: existing } = await serviceClient
    .from("profiles")
    .select("settings")
    .eq("id", targetUserId)
    .single();

  if (!existing) return { error: "account not found" };

  const currentSettings = (existing.settings ?? {}) as Record<string, unknown>;

  const { error } = await serviceClient
    .from("profiles")
    .update({
      settings: { ...currentSettings, onboarding_completed: false },
      updated_at: new Date().toISOString(),
    })
    .eq("id", targetUserId);

  if (error) return { error: error.message };

  await logAdminAction(adminId, targetUserId, "reset_onboarding");

  revalidatePath(`/admin/accounts/${targetUserId}`);
  return {};
}

// ── Toggle tester flag ───────────────────────────────────────────────────────

export async function setTesterFlagAction(
  targetUserId: string,
  isTester: boolean,
): Promise<Result> {
  const adminId = await getAdminId();
  if (!adminId) return { error: "unauthorized" };

  const { error } = await serviceClient
    .from("profiles")
    .update({ is_tester: isTester, updated_at: new Date().toISOString() })
    .eq("id", targetUserId);

  if (error) return { error: error.message };

  await logAdminAction(
    adminId,
    targetUserId,
    isTester ? "flag_tester" : "unflag_tester",
  );

  revalidatePath("/admin");
  revalidatePath(`/admin/accounts/${targetUserId}`);
  return {};
}

// ── Trigger password reset ───────────────────────────────────────────────────

export async function triggerPasswordResetAction(
  targetUserId: string,
): Promise<Result> {
  const adminId = await getAdminId();
  if (!adminId) return { error: "unauthorized" };

  // Get the user's email from auth
  const { data: authUser, error: authError } =
    await serviceClient.auth.admin.getUserById(targetUserId);
  if (authError || !authUser.user?.email)
    return { error: "could not fetch user email" };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://inklee.app";

  // Generate a password recovery link (Supabase sends the email if SMTP is configured,
  // and also returns the link for manual delivery if needed)
  const { data: linkData, error: linkError } =
    await serviceClient.auth.admin.generateLink({
      type: "recovery",
      email: authUser.user.email,
      options: { redirectTo: `${appUrl}/reset-password` },
    });

  if (linkError) return { error: linkError.message };

  await logAdminAction(
    adminId,
    targetUserId,
    "password_reset_triggered",
    undefined,
    {
      email: authUser.user.email,
    },
  );

  revalidatePath(`/admin/accounts/${targetUserId}`);
  return {
    data: {
      resetLink: linkData?.properties?.action_link ?? null,
      email: authUser.user.email,
    },
  };
}
