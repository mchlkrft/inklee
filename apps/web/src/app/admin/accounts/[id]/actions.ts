"use server";

import { revalidatePath } from "next/cache";
import { getAdminId } from "@/lib/admin-guard";
import { writeAudit } from "@/lib/audit";
import { serviceClient } from "@/lib/supabase/service";
import { deleteOwnAccountCore } from "@/lib/server/account-deletion";
import {
  ENTITLEMENT_FEATURES,
  type EntitlementFeature,
} from "@/lib/entitlements";

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

  // Shared audited core: money pre-flight + Stripe teardown + storage purge of
  // BOTH buckets + the auth+profile delete. The old inline path here skipped
  // storage AND Stripe entirely (it leaked every uploaded file + orphaned the
  // Connect account); routing through the core fixes that for admin deletes too.
  const result = await deleteOwnAccountCore(targetUserId, { surface: "admin" });
  if (!result.ok) return { error: result.message };

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

// --- Slice 81: entitlements + fee sponsorship + admin notes ---
// All write to the service-role-only `account_overrides` table (upsert, since a
// row is created on first override) and are audit-logged via logAdminAction.

export async function setPlanOverrideAction(
  targetUserId: string,
  planTier: string,
  planSource: string | null,
  planExpiresAt: string | null,
): Promise<Result> {
  const adminId = await getAdminId();
  if (!adminId) return { error: "unauthorized" };
  if (planTier !== "free" && planTier !== "plus") {
    return { error: "invalid plan tier" };
  }

  const { error } = await serviceClient.from("account_overrides").upsert(
    {
      artist_id: targetUserId,
      plan_tier: planTier,
      plan_source: planTier === "free" ? null : (planSource ?? "comp"),
      plan_expires_at: planExpiresAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "artist_id" },
  );
  if (error) return { error: error.message };

  await logAdminAction(adminId, targetUserId, "set_plan", undefined, {
    plan_tier: planTier,
    plan_source: planSource,
    plan_expires_at: planExpiresAt,
  });
  revalidateAccountViews(targetUserId);
  return {};
}

export async function setEntitlementOverrideAction(
  targetUserId: string,
  feature: string,
  value: boolean | null,
): Promise<Result> {
  const adminId = await getAdminId();
  if (!adminId) return { error: "unauthorized" };
  if (!ENTITLEMENT_FEATURES.includes(feature as EntitlementFeature)) {
    return { error: "unknown feature" };
  }

  const { data: row } = await serviceClient
    .from("account_overrides")
    .select("entitlement_overrides")
    .eq("artist_id", targetUserId)
    .maybeSingle();
  const current = (row?.entitlement_overrides ?? {}) as Record<string, boolean>;
  if (value === null) delete current[feature];
  else current[feature] = value;

  const { error } = await serviceClient.from("account_overrides").upsert(
    {
      artist_id: targetUserId,
      entitlement_overrides: current,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "artist_id" },
  );
  if (error) return { error: error.message };

  await logAdminAction(adminId, targetUserId, "set_entitlement", undefined, {
    feature,
    value,
  });
  revalidateAccountViews(targetUserId);
  return {};
}

export async function setFeeSponsorshipAction(
  targetUserId: string,
  input: {
    feeSponsored: boolean;
    feeSponsorExpiresAt: string | null;
    feeSponsorCapCents: number | null;
  },
): Promise<Result> {
  const adminId = await getAdminId();
  if (!adminId) return { error: "unauthorized" };
  const cap = input.feeSponsorCapCents;
  if (cap !== null && (!Number.isFinite(cap) || cap < 0)) {
    return { error: "invalid spend cap" };
  }

  const { error } = await serviceClient.from("account_overrides").upsert(
    {
      artist_id: targetUserId,
      fee_sponsored: input.feeSponsored,
      fee_sponsor_expires_at: input.feeSponsorExpiresAt,
      fee_sponsor_cap_cents: cap,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "artist_id" },
  );
  if (error) return { error: error.message };

  await logAdminAction(
    adminId,
    targetUserId,
    "set_fee_sponsorship",
    undefined,
    {
      fee_sponsored: input.feeSponsored,
      fee_sponsor_expires_at: input.feeSponsorExpiresAt,
      fee_sponsor_cap_cents: cap,
    },
  );
  revalidateAccountViews(targetUserId);
  return {};
}

/** Zero the sponsorship spend counter, starting a fresh budget period against
 *  the same cap. Without this there was no way back once a cap was reached:
 *  the counter only ever grows (the webhook increments it at settlement), so a
 *  spent budget permanently disabled sponsorship for that artist unless someone
 *  edited the row by hand. The previous total goes into the audit log. */
export async function resetFeeSponsorshipUsageAction(
  targetUserId: string,
): Promise<Result> {
  const adminId = await getAdminId();
  if (!adminId) return { error: "unauthorized" };

  const { data: row } = await serviceClient
    .from("account_overrides")
    .select("fee_sponsored_used_cents")
    .eq("artist_id", targetUserId)
    .maybeSingle();
  const previous = (row?.fee_sponsored_used_cents as number | null) ?? 0;

  const { error } = await serviceClient.from("account_overrides").upsert(
    {
      artist_id: targetUserId,
      fee_sponsored_used_cents: 0,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "artist_id" },
  );
  if (error) return { error: error.message };

  await logAdminAction(
    adminId,
    targetUserId,
    "reset_fee_sponsorship_usage",
    undefined,
    { previous_used_cents: previous },
  );
  revalidateAccountViews(targetUserId);
  return {};
}

export async function saveAdminNotesAction(
  targetUserId: string,
  notes: string,
): Promise<Result> {
  const adminId = await getAdminId();
  if (!adminId) return { error: "unauthorized" };

  const { error } = await serviceClient.from("account_overrides").upsert(
    {
      artist_id: targetUserId,
      admin_notes: notes.slice(0, 5000) || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "artist_id" },
  );
  if (error) return { error: error.message };

  await logAdminAction(adminId, targetUserId, "update_admin_notes");
  revalidateAccountViews(targetUserId);
  return {};
}
