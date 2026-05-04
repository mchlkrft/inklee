"use server";

import { revalidatePath } from "next/cache";
import { getAdminId } from "@/lib/admin-guard";
import { writeAudit } from "@/lib/audit";
import { serviceClient } from "@/lib/supabase/service";

type Result = { error?: string; data?: Record<string, unknown> };

type ProfileSnapshot = {
  id: string;
  display_name: string | null;
  account_status: string | null;
};

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

async function fetchTargetProfile(
  targetUserId: string,
): Promise<ProfileSnapshot | null> {
  const { data } = await serviceClient
    .from("profiles")
    .select("id, display_name, account_status")
    .eq("id", targetUserId)
    .single();
  return (data as ProfileSnapshot | null) ?? null;
}

async function applyAccountStateChange(input: {
  targetUserId: string;
  authUpdate: { ban_duration: string };
  rollbackAuthUpdate: { ban_duration: string };
  profileUpdate: Record<string, unknown>;
}): Promise<Result> {
  const { error: authError } = await serviceClient.auth.admin.updateUserById(
    input.targetUserId,
    input.authUpdate,
  );
  if (authError) return { error: authError.message };

  const { error: profileError } = await serviceClient
    .from("profiles")
    .update(input.profileUpdate)
    .eq("id", input.targetUserId);

  if (!profileError) return {};

  const { error: rollbackError } =
    await serviceClient.auth.admin.updateUserById(
      input.targetUserId,
      input.rollbackAuthUpdate,
    );

  if (rollbackError) {
    console.error("[admin] auth rollback failed:", rollbackError.message);
    return {
      error:
        "profile update failed after changing auth access. Manual admin review is required.",
    };
  }

  return { error: profileError.message };
}

function revalidateAccountViews(targetUserId: string): void {
  revalidatePath("/admin");
  revalidatePath(`/admin/accounts/${targetUserId}`);
}

export async function suspendAccountAction(
  targetUserId: string,
  reason: string,
): Promise<Result> {
  const adminId = await getAdminId();
  if (!adminId) return { error: "unauthorized" };
  if (adminId === targetUserId) {
    return { error: "you cannot suspend your own account" };
  }

  const profile = await fetchTargetProfile(targetUserId);
  if (!profile) return { error: "account not found" };
  if (profile.account_status === "suspended") {
    return { error: "account is already suspended" };
  }
  if (profile.account_status === "archived") {
    return { error: "account is archived - reactivate first" };
  }

  const now = new Date().toISOString();
  const result = await applyAccountStateChange({
    targetUserId,
    authUpdate: { ban_duration: "87600h" },
    rollbackAuthUpdate: { ban_duration: "none" },
    profileUpdate: {
      account_status: "suspended",
      suspended_at: now,
      suspended_reason: reason || null,
      updated_at: now,
    },
  });
  if (result.error) return result;

  await logAdminAction(adminId, targetUserId, "suspend", reason);
  revalidateAccountViews(targetUserId);
  return {};
}

export async function reactivateAccountAction(
  targetUserId: string,
): Promise<Result> {
  const adminId = await getAdminId();
  if (!adminId) return { error: "unauthorized" };

  const profile = await fetchTargetProfile(targetUserId);
  if (!profile) return { error: "account not found" };
  if (profile.account_status === "active") {
    return { error: "account is already active" };
  }

  const now = new Date().toISOString();
  const result = await applyAccountStateChange({
    targetUserId,
    authUpdate: { ban_duration: "none" },
    rollbackAuthUpdate: { ban_duration: "87600h" },
    profileUpdate: {
      account_status: "active",
      suspended_at: null,
      suspended_reason: null,
      deleted_at: null,
      deleted_by: null,
      updated_at: now,
    },
  });
  if (result.error) return result;

  await logAdminAction(adminId, targetUserId, "reactivate");
  revalidateAccountViews(targetUserId);
  return {};
}

export async function archiveAccountAction(
  targetUserId: string,
  reason: string,
): Promise<Result> {
  const adminId = await getAdminId();
  if (!adminId) return { error: "unauthorized" };
  if (adminId === targetUserId) {
    return { error: "you cannot archive your own account" };
  }

  const profile = await fetchTargetProfile(targetUserId);
  if (!profile) return { error: "account not found" };
  if (profile.account_status === "archived") {
    return { error: "account is already archived" };
  }

  const now = new Date().toISOString();
  const result = await applyAccountStateChange({
    targetUserId,
    authUpdate: { ban_duration: "87600h" },
    rollbackAuthUpdate: { ban_duration: "none" },
    profileUpdate: {
      account_status: "archived",
      deleted_at: now,
      deleted_by: adminId,
      suspended_at: now,
      suspended_reason: reason || "archived by admin",
      updated_at: now,
    },
  });
  if (result.error) return result;

  await logAdminAction(adminId, targetUserId, "archive", reason, {
    deleted_by: adminId,
  });
  revalidateAccountViews(targetUserId);
  return {};
}

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
  revalidateAccountViews(targetUserId);
  return {};
}

export async function deleteAccountPermanentlyAction(
  targetUserId: string,
): Promise<Result> {
  const adminId = await getAdminId();
  if (!adminId) return { error: "unauthorized" };
  if (adminId === targetUserId) {
    return { error: "you cannot delete your own account" };
  }

  const profile = await fetchTargetProfile(targetUserId);
  if (!profile) return { error: "account not found" };

  await logAdminAction(adminId, targetUserId, "permanent_delete", undefined, {
    display_name: profile.display_name,
  });

  // Delete auth user — may not exist for manually seeded/test accounts
  const { error: authError } =
    await serviceClient.auth.admin.deleteUser(targetUserId);

  if (
    authError &&
    !authError.message.toLowerCase().includes("not found") &&
    !authError.message.toLowerCase().includes("does not exist")
  ) {
    return { error: authError.message };
  }

  // Always clean up the profile row (handles orphaned profiles too)
  const { error: profileError } = await serviceClient
    .from("profiles")
    .delete()
    .eq("id", targetUserId);

  if (profileError) return { error: profileError.message };

  revalidatePath("/admin");
  return {};
}

export async function triggerPasswordResetAction(
  targetUserId: string,
): Promise<Result> {
  const adminId = await getAdminId();
  if (!adminId) return { error: "unauthorized" };

  const { data: authUser, error: authError } =
    await serviceClient.auth.admin.getUserById(targetUserId);
  if (authError || !authUser.user?.email) {
    return { error: "could not fetch user email" };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://inklee.app";
  const { error: resetError } = await serviceClient.auth.resetPasswordForEmail(
    authUser.user.email,
    { redirectTo: `${appUrl}/reset-password` },
  );
  if (resetError) return { error: resetError.message };

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
      email: authUser.user.email,
    },
  };
}
