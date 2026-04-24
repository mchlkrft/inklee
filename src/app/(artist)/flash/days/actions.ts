"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

type State = { error: string } | { success: true; id?: string } | null;

function parseString(v: FormData, key: string): string | null {
  const raw = v.get(key) as string | null;
  return raw?.trim() || null;
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

  const { data, error } = await supabase
    .from("flash_days")
    .insert({
      artist_id: user.id,
      title,
      scheduled_on: parseString(formData, "scheduled_on"),
      location: parseString(formData, "location"),
      description: parseString(formData, "description"),
      status: (formData.get("status") as string) || "upcoming",
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

  const { error } = await supabase
    .from("flash_days")
    .update({
      title,
      scheduled_on: parseString(formData, "scheduled_on"),
      location: parseString(formData, "location"),
      description: parseString(formData, "description"),
      status: formData.get("status") as string,
    })
    .eq("id", id)
    .eq("artist_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/flash/days");
  return { success: true };
}
