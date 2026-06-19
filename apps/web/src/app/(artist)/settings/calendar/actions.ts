"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { generateIcalTokenFor, revokeIcalTokenFor } from "@/lib/server/ical";

export async function generateIcalToken(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const result = await generateIcalTokenFor(supabase, user.id);
  if ("error" in result) {
    console.error("[ical] generate failed:", result.error);
    return;
  }
  revalidatePath("/settings/calendar");
}

export async function revokeIcalToken(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const result = await revokeIcalTokenFor(supabase, user.id);
  if (result?.error) {
    console.error("[ical] revoke failed:", result.error);
    return;
  }
  revalidatePath("/settings/calendar");
}
