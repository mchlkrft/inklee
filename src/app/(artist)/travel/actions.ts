"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

type State = { error: string } | { success: true } | null;

// -- Studio actions --

export async function createStudioAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not authenticated" };

  const name = (formData.get("name") as string)?.trim();
  const city = (formData.get("city") as string)?.trim();
  const country = (formData.get("country") as string)?.trim();
  const address = (formData.get("address") as string)?.trim() || null;
  const notes = (formData.get("notes") as string)?.trim() || null;

  if (!name || !city || !country) {
    return { error: "name, city and country are required" };
  }

  const { error } = await supabase
    .from("studios")
    .insert({ artist_id: user.id, name, city, country, address, notes });

  if (error) return { error: error.message };
  revalidatePath("/travel");
  return { success: true };
}

export async function updateStudioAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not authenticated" };

  const id = formData.get("id") as string;
  const name = (formData.get("name") as string)?.trim();
  const city = (formData.get("city") as string)?.trim();
  const country = (formData.get("country") as string)?.trim();
  const address = (formData.get("address") as string)?.trim() || null;

  if (!name || !city || !country) {
    return { error: "name, city and country are required" };
  }

  const { error } = await supabase
    .from("studios")
    .update({ name, city, country, address })
    .eq("id", id)
    .eq("artist_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/travel");
  return { success: true };
}

export async function deleteStudioAction(id: string): Promise<State> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not authenticated" };

  const { error } = await supabase
    .from("studios")
    .delete()
    .eq("id", id)
    .eq("artist_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/travel");
  return { success: true };
}

// -- Trip actions --

export async function createTripAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not authenticated" };

  const title = (formData.get("title") as string)?.trim();
  const description = (formData.get("description") as string)?.trim() || null;
  const showOnBookingForm = formData.get("show_on_booking_form") !== "false";

  if (!title) return { error: "title is required" };

  const { error } = await supabase.from("trips").insert({
    artist_id: user.id,
    title,
    description,
    show_on_booking_form: showOnBookingForm,
  });

  if (error) return { error: error.message };
  revalidatePath("/travel");
  return { success: true };
}

export async function updateTripAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not authenticated" };

  const id = formData.get("id") as string;
  const title = (formData.get("title") as string)?.trim();
  const description = (formData.get("description") as string)?.trim() || null;
  const showOnBookingForm = formData.get("show_on_booking_form") === "true";

  if (!title) return { error: "title is required" };

  const { error } = await supabase
    .from("trips")
    .update({ title, description, show_on_booking_form: showOnBookingForm })
    .eq("id", id)
    .eq("artist_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/travel");
  return { success: true };
}

export async function toggleTripVisibilityAction(
  id: string,
  show: boolean,
): Promise<State> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not authenticated" };

  const { error } = await supabase
    .from("trips")
    .update({ show_on_booking_form: show })
    .eq("id", id)
    .eq("artist_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/travel");
  return { success: true };
}

export async function deleteTripAction(id: string): Promise<State> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not authenticated" };

  const { error } = await supabase
    .from("trips")
    .delete()
    .eq("id", id)
    .eq("artist_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/travel");
  return { success: true };
}

// -- Trip leg actions --

export async function createTripLegAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not authenticated" };

  const tripId = formData.get("trip_id") as string;
  const studioId = (formData.get("studio_id") as string) || null;
  const startsOn = formData.get("starts_on") as string;
  const endsOn = formData.get("ends_on") as string;
  const notes = (formData.get("notes") as string)?.trim() || null;

  if (!tripId || !startsOn || !endsOn) {
    return { error: "trip, start date and end date are required" };
  }

  // Verify ownership via trips table
  const { data: trip } = await supabase
    .from("trips")
    .select("id")
    .eq("id", tripId)
    .eq("artist_id", user.id)
    .single();

  if (!trip) return { error: "trip not found" };

  const { error } = await supabase.from("trip_legs").insert({
    trip_id: tripId,
    studio_id: studioId || null,
    starts_on: startsOn,
    ends_on: endsOn,
    notes,
  });

  if (error) return { error: error.message };
  revalidatePath("/travel");
  return { success: true };
}

export async function deleteTripLegAction(id: string): Promise<State> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not authenticated" };

  const { error } = await supabase.from("trip_legs").delete().eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/travel");
  return { success: true };
}
