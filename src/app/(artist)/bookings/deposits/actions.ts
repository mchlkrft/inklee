"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { DepositDefaults } from "@/lib/deposit-settings";

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
