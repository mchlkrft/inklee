"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import crypto from "crypto";

export async function generateIcalToken(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const token = crypto.randomBytes(16).toString("hex");

  const { data: profile } = await supabase
    .from("profiles")
    .select("settings")
    .eq("id", user.id)
    .single();

  const { error } = await supabase
    .from("profiles")
    .update({
      settings: { ...((profile?.settings as object) ?? {}), ical_token: token },
    })
    .eq("id", user.id);

  if (error) {
    console.error("[ical] generate failed:", error.message);
    return;
  }

  revalidatePath("/settings/calendar-export");
}

export async function revokeIcalToken(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: profile } = await supabase
    .from("profiles")
    .select("settings")
    .eq("id", user.id)
    .single();

  const settings = {
    ...((profile?.settings as Record<string, unknown>) ?? {}),
  };
  delete settings.ical_token;

  const { error } = await supabase
    .from("profiles")
    .update({ settings })
    .eq("id", user.id);

  if (error) {
    console.error("[ical] revoke failed:", error.message);
    return;
  }

  revalidatePath("/settings/calendar-export");
}
