"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import {
  attachItemsToDay,
  detachItemFromDay,
} from "@/lib/server/flash-day-membership";

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
  if (!user) return { error: "Not authenticated." };

  const title = parseString(formData, "title");
  if (!title) return { error: "Title is required." };

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
  if (!user) return { error: "Not authenticated." };

  const id = formData.get("id") as string;
  const title = parseString(formData, "title");
  if (!title) return { error: "Title is required." };

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
 * Attach multiple designs to a day (multi-select section on /flash/days/[id]).
 * Delegates to the shared single-writer membership module so web + mobile agree;
 * a design can be in this day AND others (many-to-many), re-attach is a no-op.
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
  if (!user) return { error: "Not authenticated." };

  const result = await attachItemsToDay(supabase, dayId, itemIds, user.id);
  if (!result.ok) return { error: result.error };
  revalidatePath(`/flash/days/${dayId}`);
  revalidatePath("/flash/items");
  return { success: true };
}

/**
 * Detach a single design from a day (per-item "remove" on the day-detail list).
 * Delegates to the shared module, which also repoints the design's primary-day
 * hint if needed.
 */
export async function detachFlashItemFromDayAction(
  dayId: string,
  itemId: string,
): Promise<SimpleState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const result = await detachItemFromDay(supabase, dayId, itemId, user.id);
  if (!result.ok) return { error: result.error };
  revalidatePath(`/flash/days/${dayId}`);
  revalidatePath("/flash/items");
  return { success: true };
}
