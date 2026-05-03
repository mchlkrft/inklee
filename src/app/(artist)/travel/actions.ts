"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import {
  validateTripLeg,
  validateTripLegsPayload,
} from "@/lib/trip-validation";
import { parseStudioFormData } from "@/lib/studio-validation";
import { z } from "zod";

type State = { error: string } | { success: true } | null;

async function validateOwnedStudios(
  supabase: Awaited<ReturnType<typeof createClient>>,
  artistId: string,
  studioIds: string[],
): Promise<string | null> {
  if (studioIds.length === 0) return null;

  const uniqueIds = [...new Set(studioIds)];
  const { data: studios, error } = await supabase
    .from("studios")
    .select("id")
    .eq("artist_id", artistId)
    .in("id", uniqueIds);

  if (error) return error.message;
  if ((studios ?? []).length !== uniqueIds.length) {
    return "one or more selected studios are invalid";
  }

  return null;
}

// ─── Studio actions ───────────────────────────────────────────────────────────

export async function createStudioAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not authenticated" };

  let input;
  try {
    input = parseStudioFormData(formData);
  } catch (err) {
    if (err instanceof z.ZodError)
      return { error: err.issues[0]?.message ?? "invalid input" };
    return { error: "invalid input" };
  }

  if (input.is_primary) {
    await supabase
      .from("studios")
      .update({ is_primary: false })
      .eq("artist_id", user.id)
      .eq("is_primary", true);
  }

  const { error } = await supabase.from("studios").insert({
    artist_id: user.id,
    name: input.name,
    city: input.city,
    country: input.country,
    address: input.address,
    google_place_id: input.google_place_id,
    formatted_address: input.formatted_address,
    latitude: input.latitude,
    longitude: input.longitude,
    google_maps_url: input.google_maps_url,
    visibility_mode: input.visibility_mode,
    public_note: input.public_note,
    is_primary: input.is_primary,
  });

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
  if (!id) return { error: "studio id is required" };

  let input;
  try {
    input = parseStudioFormData(formData);
  } catch (err) {
    if (err instanceof z.ZodError)
      return { error: err.issues[0]?.message ?? "invalid input" };
    return { error: "invalid input" };
  }

  if (input.is_primary) {
    await supabase
      .from("studios")
      .update({ is_primary: false })
      .eq("artist_id", user.id)
      .eq("is_primary", true)
      .neq("id", id);
  }

  const { error } = await supabase
    .from("studios")
    .update({
      name: input.name,
      city: input.city,
      country: input.country,
      address: input.address,
      google_place_id: input.google_place_id,
      formatted_address: input.formatted_address,
      latitude: input.latitude,
      longitude: input.longitude,
      google_maps_url: input.google_maps_url,
      visibility_mode: input.visibility_mode,
      public_note: input.public_note,
      is_primary: input.is_primary,
      updated_at: new Date().toISOString(),
    })
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

// ─── Trip actions ─────────────────────────────────────────────────────────────

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

  let legs;
  try {
    legs = validateTripLegsPayload(
      (formData.get("legs_json") as string) || null,
    );
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "trip stops are invalid",
    };
  }

  const studioError = await validateOwnedStudios(
    supabase,
    user.id,
    legs.map((leg) => leg.studioId).filter(Boolean) as string[],
  );
  if (studioError) return { error: studioError };

  const { data: newTrip, error } = await supabase
    .from("trips")
    .insert({
      artist_id: user.id,
      title,
      description,
      show_on_booking_form: showOnBookingForm,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  if (legs.length > 0) {
    const { error: legsError } = await supabase.from("trip_legs").insert(
      legs.map((leg) => ({
        trip_id: newTrip.id,
        starts_on: leg.startsOn,
        ends_on: leg.endsOn,
        studio_id: leg.studioId,
        notes: leg.notes,
      })),
    );

    if (legsError) {
      await supabase.from("trips").delete().eq("id", newTrip.id);
      return { error: legsError.message };
    }
  }

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
  const notes = (formData.get("notes") as string)?.trim() || null;
  if (!tripId) return { error: "trip, start date and end date are required" };

  let leg;
  try {
    leg = validateTripLeg({
      startsOn: formData.get("starts_on"),
      endsOn: formData.get("ends_on"),
      studioId: (formData.get("studio_id") as string) || null,
      notes,
    });
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "trip stop is invalid",
    };
  }

  const { data: trip } = await supabase
    .from("trips")
    .select("id")
    .eq("id", tripId)
    .eq("artist_id", user.id)
    .single();

  if (!trip) return { error: "trip not found" };

  const studioError = await validateOwnedStudios(
    supabase,
    user.id,
    leg.studioId ? [leg.studioId] : [],
  );
  if (studioError) return { error: studioError };

  const { error } = await supabase.from("trip_legs").insert({
    trip_id: tripId,
    studio_id: leg.studioId,
    starts_on: leg.startsOn,
    ends_on: leg.endsOn,
    notes: leg.notes,
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

  const { data: leg } = await supabase
    .from("trip_legs")
    .select("id, trips!inner(artist_id)")
    .eq("id", id)
    .eq("trips.artist_id", user.id)
    .single();

  if (!leg) return { error: "trip stop not found" };

  const { error } = await supabase.from("trip_legs").delete().eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/travel");
  return { success: true };
}
