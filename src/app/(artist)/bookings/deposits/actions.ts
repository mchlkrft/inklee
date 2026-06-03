"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { DepositDefaults } from "@/lib/deposit-settings";
import {
  FORFEIT_PCT_OPTIONS,
  type DepositPolicy,
  type ForfeitPct,
  type TimeUnit,
} from "@/lib/deposit-policy";

type State = { error: string } | { success: true } | null;

const MAX_AMOUNT = 100_000;
const MAX_DUE_DAYS = 90;
const MAX_NOTE = 300;

export async function saveDepositDefaultsAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  // Amount — blank input means "no default, force per-request entry".
  const amountRaw = (formData.get("amount") as string | null)?.trim() ?? "";
  let amount: number | null = null;
  if (amountRaw !== "") {
    const parsed = Number.parseFloat(amountRaw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return { error: "Default amount must be a positive number." };
    }
    if (parsed > MAX_AMOUNT) {
      return {
        error: `Default amount can’t exceed €${MAX_AMOUNT.toLocaleString()}.`,
      };
    }
    amount = parsed === 0 ? null : Math.round(parsed * 100) / 100;
  }

  // Due-window in days from "today" — required.
  const dueDaysRaw = (formData.get("due_days") as string | null)?.trim() ?? "";
  const dueDays = Number.parseInt(dueDaysRaw, 10);
  if (!Number.isFinite(dueDays) || dueDays < 1 || dueDays > MAX_DUE_DAYS) {
    return { error: `Due window must be between 1 and ${MAX_DUE_DAYS} days.` };
  }

  const note = ((formData.get("note") as string | null) ?? "")
    .trim()
    .slice(0, MAX_NOTE);

  const defaults: DepositDefaults = {
    amount,
    due_days: dueDays,
    note,
  };

  const { data: profile } = await supabase
    .from("profiles")
    .select("settings")
    .eq("id", user.id)
    .single();

  const currentSettings = (profile?.settings ?? {}) as Record<string, unknown>;

  const { error } = await supabase
    .from("profiles")
    .update({
      settings: { ...currentSettings, deposit_defaults: defaults },
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/bookings/deposits");
  revalidatePath("/bookings/requests", "layout");
  return { success: true };
}

// Q9: save the structured deposit policy. Free text is not accepted — only the
// three constrained parameters. Reciprocity (artist cancels => full refund) is
// not stored here; it's hard-coded in the refund logic and not overridable.
function parseWindowField(
  formData: FormData,
  valueKey: string,
  unitKey: string,
): { value: number; unit: TimeUnit } | { error: string } {
  const value = Number.parseInt(
    ((formData.get(valueKey) as string | null) ?? "").trim(),
    10,
  );
  const unit: TimeUnit = formData.get(unitKey) === "hours" ? "hours" : "days";
  const max = unit === "hours" ? 720 : 365;
  if (!Number.isFinite(value) || value < 0 || value > max) {
    return { error: `Each window must be between 0 and ${max} ${unit}.` };
  }
  return { value, unit };
}

export async function saveDepositPolicyAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const refundWindow = parseWindowField(
    formData,
    "refund_window_value",
    "refund_window_unit",
  );
  if ("error" in refundWindow) return { error: refundWindow.error };

  const forfeitRaw = Number.parseInt(
    ((formData.get("forfeit_pct") as string | null) ?? "").trim(),
    10,
  );
  if (!(FORFEIT_PCT_OPTIONS as readonly number[]).includes(forfeitRaw)) {
    return { error: "Pick a forfeit percentage from the list." };
  }

  // Last-minute window is optional — only parsed when the toggle is on.
  let lastMinute: { value: number; unit: TimeUnit } | null = null;
  if (formData.get("last_minute_enabled") === "on") {
    const lm = parseWindowField(
      formData,
      "last_minute_value",
      "last_minute_unit",
    );
    if ("error" in lm) return { error: lm.error };
    lastMinute = lm;
  }

  const policy: DepositPolicy = {
    refundWindow,
    lateCancelForfeitPct: forfeitRaw as ForfeitPct,
    lastMinute,
  };

  const { data: profile } = await supabase
    .from("profiles")
    .select("settings")
    .eq("id", user.id)
    .single();
  const currentSettings = (profile?.settings ?? {}) as Record<string, unknown>;

  const { error } = await supabase
    .from("profiles")
    .update({
      settings: { ...currentSettings, deposit_policy: policy },
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/bookings/deposits");
  return { success: true };
}
