"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

type State = { error: string } | { success: true; id?: string } | null;
type SimpleState = { error: string } | { success: true } | null;

function parseString(v: FormData, key: string): string | null {
  const raw = v.get(key) as string | null;
  return raw?.trim() || null;
}

/**
 * Resolve location fields: when an artist picks a studio, we clear the free
 * text. When they pick "Other / external venue", studio_id is null and text
 * may be supplied. Caller passes one or the other.
 */
function resolveLocationFields(formData: FormData): {
  studio_id: string | null;
  location: string | null;
} {
  const studioId = parseString(formData, "studio_id");
  if (studioId) return { studio_id: studioId, location: null };
  return { studio_id: null, location: parseString(formData, "location") };
}

export async function createFlashDayAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not authenticated" };

  const title = parseString(formData, "title");
  if (!title) return { error: "title is required" };

  const { studio_id, location } = resolveLocationFields(formData);

  const { data, error } = await supabase
    .from("flash_days")
    .insert({
      artist_id: user.id,
      title,
      scheduled_on: parseString(formData, "scheduled_on"),
      studio_id,
      location,
      description: parseString(formData, "description"),
      status: (formData.get("status") as string) || "upcoming",
      is_public: formData.get("is_public") === "true",
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  revalidatePath("/flash/days");
  return { success: true, id: data.id };
}

export async function updateFlashDayAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not authenticated" };

  const id = formData.get("id") as string;
  const title = parseString(formData, "title");
  if (!title) return { error: "title is required" };

  const { studio_id, location } = resolveLocationFields(formData);

  const { error } = await supabase
    .from("flash_days")
    .update({
      title,
      scheduled_on: parseString(formData, "scheduled_on"),
      studio_id,
      location,
      description: parseString(formData, "description"),
      status: formData.get("status") as string,
      is_public: formData.get("is_public") === "true",
    })
    .eq("id", id)
    .eq("artist_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/flash/days");
  revalidatePath(`/flash/days/${id}`);
  return { success: true };
}

/**
 * Attach multiple flash items to a day in one round-trip. Used by the
 * multi-select section on /flash/days/[id]. Items not already on this day
 * get updated; items already attached are silently no-op'd.
 */
export async function attachFlashItemsToDayAction(
  dayId: string,
  itemIds: string[],
): Promise<SimpleState> {
  if (itemIds.length === 0) return { success: true };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not authenticated" };

  // Confirm ownership of the day to avoid attaching items into a stranger's day
  const { data: day } = await supabase
    .from("flash_days")
    .select("id")
    .eq("id", dayId)
    .eq("artist_id", user.id)
    .maybeSingle();
  if (!day) return { error: "day not found" };

  const { error } = await supabase
    .from("flash_items")
    .update({ flash_day_id: dayId })
    .in("id", itemIds)
    .eq("artist_id", user.id);

  if (error) return { error: error.message };
  revalidatePath(`/flash/days/${dayId}`);
  revalidatePath("/flash/items");
  return { success: true };
}

/**
 * Detach a single flash item from a day. Used by per-item "remove" affordance
 * on the day-detail attached-items list.
 */
export async function detachFlashItemFromDayAction(
  dayId: string,
  itemId: string,
): Promise<SimpleState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not authenticated" };

  const { error } = await supabase
    .from("flash_items")
    .update({ flash_day_id: null })
    .eq("id", itemId)
    .eq("artist_id", user.id)
    .eq("flash_day_id", dayId);

  if (error) return { error: error.message };
  revalidatePath(`/flash/days/${dayId}`);
  revalidatePath("/flash/items");
  return { success: true };
}
