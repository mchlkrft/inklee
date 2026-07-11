"use server";

// Note: never re-export types from this "use server" file (next dev 500s it);
// the form declares its own copy of the state union.

import { revalidatePath } from "next/cache";
import { getAdminId } from "@/lib/admin-guard";
import { writeAudit } from "@/lib/audit";
import { saveGrowthSetting } from "@/lib/growth/settings";

type UpdateGrowthSettingState = { error: string } | { ok: true } | null;

export async function updateGrowthSettingAction(
  _prev: UpdateGrowthSettingState,
  formData: FormData,
): Promise<UpdateGrowthSettingState> {
  const adminId = await getAdminId();
  if (!adminId) return { error: "Not authorized." };

  const key = formData.get("key");
  const raw = formData.get("value");
  if (typeof key !== "string" || typeof raw !== "string") {
    return { error: "Missing setting key or value." };
  }

  let value: string | number;
  if (key === "reporting_timezone") {
    const timezone = raw.trim();
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    } catch {
      return { error: "Unknown timezone." };
    }
    value = timezone;
  } else {
    const parsed = parseInt(raw, 10);
    if (Number.isNaN(parsed)) return { error: "Enter a whole number." };
    value = parsed;
  }

  // saveGrowthSetting re-validates key membership and value bounds with zod
  // and returns a user-facing error string, or null on success.
  const error = await saveGrowthSetting(key, value, adminId);
  if (error) return { error };

  void writeAudit({
    action: "admin_growth_setting_updated",
    actor: adminId,
    category: "admin",
    details: { key, value },
  });

  revalidatePath("/admin/growth/settings");
  return { ok: true };
}
