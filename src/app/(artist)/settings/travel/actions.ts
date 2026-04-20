"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

type State = { error: string } | { success: true } | null;

export async function createTravelLegAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not authenticated" };

  const city = (formData.get("city") as string).trim();
  const country = (formData.get("country") as string).trim();
  const studioName = (formData.get("studio_name") as string).trim() || null;
  const startsOn = formData.get("starts_on") as string;
  const endsOn = formData.get("ends_on") as string;
  const description = (formData.get("description") as string).trim() || null;

  if (!city) return { error: "city is required" };
  if (!country) return { error: "country is required" };
  if (!startsOn || !endsOn)
    return { error: "start and end dates are required" };
  if (new Date(endsOn) < new Date(startsOn))
    return { error: "end date must be after start date" };
  if (description && description.length > 500)
    return { error: "description must be 500 characters or fewer" };

  const { error } = await supabase.from("travel_legs").insert({
    artist_id: user.id,
    city,
    country,
    studio_name: studioName,
    starts_on: startsOn,
    ends_on: endsOn,
    description,
  });

  if (error) return { error: error.message };

  revalidatePath("/settings/travel");
  return { success: true };
}

export async function deleteTravelLegAction(id: string): Promise<void> {
  const supabase = await createClient();
  await supabase.from("travel_legs").delete().eq("id", id);
  revalidatePath("/settings/travel");
}

export async function toggleTravelLegAction(
  id: string,
  isActive: boolean,
): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("travel_legs")
    .update({ is_active: isActive })
    .eq("id", id);
  revalidatePath("/settings/travel");
}
