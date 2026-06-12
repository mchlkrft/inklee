"use server";

import { createClient } from "@/lib/supabase/server";
import { createSlotsFromPattern, deleteOpenSlot } from "@/lib/server/slots";
import { validateSlotPattern } from "@inklee/shared/slot-pattern";
import { revalidatePath } from "next/cache";

type ActionResult = { error: string } | { success: true };

// Thin FormData adapter over the shared slot core (lib/server/slots.ts) — the
// /api/mobile/slots routes call the same core, so web and app cannot drift.
export async function createSlotsFromPatternAction(
  formData: FormData,
): Promise<{ error: string } | { success: true; count: number }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  let candidate: Record<string, unknown>;
  try {
    const applyMode = formData.get("apply_mode");
    candidate = {
      windows: JSON.parse((formData.get("windows_json") as string) ?? "null"),
      applyMode,
      ...(applyMode === "weekdays"
        ? {
            weekdays: JSON.parse(
              (formData.get("weekdays_json") as string) ?? "null",
            ),
            fromDate: formData.get("from_date"),
            toDate: formData.get("to_date"),
          }
        : {
            dates: JSON.parse((formData.get("dates_json") as string) ?? "null"),
          }),
    };
  } catch {
    return { error: "Invalid window data." };
  }

  const parsed = validateSlotPattern(candidate);
  if (!parsed.ok) return { error: parsed.error };

  const result = await createSlotsFromPattern(supabase, user.id, parsed.value);
  if (!result.ok) return { error: result.error };

  revalidatePath("/bookings/settings");
  return { success: true, count: result.count };
}

export async function deleteSlotAction(slotId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const result = await deleteOpenSlot(supabase, user.id, slotId);
  if (!result.ok) return { error: result.error };

  revalidatePath("/bookings/settings");
  return { success: true };
}
