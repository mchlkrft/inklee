"use server";

import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { deleteTripCore, deleteTripLegCore } from "@/lib/server/guest-spots";
import { getAccountOverrides } from "@/lib/entitlements-server";
import { capState } from "@/lib/server/entitlement-gates";
import type { EntitlementLimit } from "@/lib/entitlements";
import {
  validateTripLeg,
  validateTripLegsPayload,
  validateTripMeta,
} from "@/lib/trip-validation";
import { parseStudioFormData } from "@/lib/studio-validation";
import {
  sanitizeTravelIcon,
  sanitizeTravelIconColor,
  sanitizeTravelIconBg,
} from "@inklee/shared/travel-icons";
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

// Shared entitlement cap gate for the travel create actions. Dark-launched via
// entitlement_caps; existing rows are never touched. Fail OPEN on a plan-read
// blip (a soft cap, not money). Returns an error string when the create is
// blocked, else null.
async function checkTravelCap(
  supabase: Awaited<ReturnType<typeof createClient>>,
  artistId: string,
  key: EntitlementLimit,
  noun: string,
): Promise<string | null> {
  try {
    const overrides = await getAccountOverrides(artistId);
    let count = 0;
    if (key === "studio_library") {
      const { count: n } = await supabase
        .from("studios")
        .select("id", { count: "exact", head: true })
        .eq("artist_id", artistId);
      count = n ?? 0;
    } else if (key === "active_trips") {
      // An active trip has at least one leg ending today or later.
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from("trips")
        .select("id, trip_legs!inner(ends_on)")
        .eq("artist_id", artistId)
        .gte("trip_legs.ends_on", today);
      count = new Set((data ?? []).map((t) => t.id)).size;
    }
    const gate = capState(overrides, key, count);
    if (gate.blocked) {
      return `You've reached the ${gate.cap}-${noun} limit on your current plan. Upgrade to Plus to add more.`;
    }
    return null;
  } catch (e) {
    Sentry.captureException(e, {
      tags: { action: "travel_cap_check" },
      extra: { artistId, key },
    });
    return null; // fail open
  }
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
  if (!user) return { error: "Not authenticated." };

  let input;
  try {
    input = parseStudioFormData(formData);
  } catch (err) {
    if (err instanceof z.ZodError)
      return { error: err.issues[0]?.message ?? "invalid input" };
    return { error: "Invalid input." };
  }

  const capErr = await checkTravelCap(
    supabase,
    user.id,
    "studio_library",
    "studio",
  );
  if (capErr) return { error: capErr };

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
    icon: input.icon ?? null,
    icon_color: input.icon_color ?? null,
    icon_bg: input.icon_bg ?? null,
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
  if (!user) return { error: "Not authenticated." };

  const id = formData.get("id") as string;
  if (!id) return { error: "Studio id is required." };

  let input;
  try {
    input = parseStudioFormData(formData);
  } catch (err) {
    if (err instanceof z.ZodError)
      return { error: err.issues[0]?.message ?? "invalid input" };
    return { error: "Invalid input." };
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
      // The web form always posts the icon input ("" = none), so null here is
      // an explicit clear, never an accidental wipe.
      icon: input.icon ?? null,
      icon_color: input.icon_color ?? null,
      icon_bg: input.icon_bg ?? null,
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
  if (!user) return { error: "Not authenticated." };

  const { error } = await supabase
    .from("studios")
    .delete()
    .eq("id", id)
    .eq("artist_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/travel");
  return { success: true };
}

// Creates a studio and returns its data. Deduplicates by google_place_id.
export async function createStudioAndReturnAction(formData: FormData): Promise<
  | { error: string }
  | {
      success: true;
      studio: { id: string; name: string; city: string; country: string };
    }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  let input;
  try {
    input = parseStudioFormData(formData);
  } catch (err) {
    if (err instanceof z.ZodError)
      return { error: err.issues[0]?.message ?? "invalid input" };
    return { error: "Invalid input." };
  }

  // Dedup: if a studio with the same Google Place ID already exists, reuse it
  if (input.google_place_id) {
    const { data: existing } = await supabase
      .from("studios")
      .select("id, name, city, country")
      .eq("artist_id", user.id)
      .eq("google_place_id", input.google_place_id)
      .maybeSingle();

    if (existing) {
      return { success: true, studio: existing };
    }
  }

  // Cap only a genuinely NEW studio row (after the dedup above, so re-selecting
  // an existing library entry is never blocked).
  const capErr = await checkTravelCap(
    supabase,
    user.id,
    "studio_library",
    "studio",
  );
  if (capErr) return { error: capErr };

  if (input.is_primary) {
    await supabase
      .from("studios")
      .update({ is_primary: false })
      .eq("artist_id", user.id)
      .eq("is_primary", true);
  }

  const { data: created, error } = await supabase
    .from("studios")
    .insert({
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
      icon: input.icon ?? null,
      icon_color: input.icon_color ?? null,
      icon_bg: input.icon_bg ?? null,
    })
    .select("id, name, city, country")
    .single();

  if (error) return { error: error.message };
  revalidatePath("/travel");
  return { success: true, studio: created };
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
  if (!user) return { error: "Not authenticated." };

  const meta = validateTripMeta({
    title: formData.get("title"),
    description: formData.get("description"),
  });
  if (!meta.ok) return { error: meta.error };
  const { title, description } = meta.value;
  const showOnBookingForm = formData.get("show_on_booking_form") !== "false";
  const icon = sanitizeTravelIcon(
    (formData.get("icon") as string)?.trim() || null,
  );
  const iconColor = sanitizeTravelIconColor(
    (formData.get("icon_color") as string)?.trim() || null,
  );
  const iconBg = sanitizeTravelIconBg(
    (formData.get("icon_bg") as string)?.trim() || null,
  );

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

  const capErr = await checkTravelCap(
    supabase,
    user.id,
    "active_trips",
    "active trip",
  );
  if (capErr) return { error: capErr };

  const { data: newTrip, error } = await supabase
    .from("trips")
    .insert({
      artist_id: user.id,
      title,
      description,
      show_on_booking_form: showOnBookingForm,
      icon,
      icon_color: iconColor,
      icon_bg: iconBg,
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
  if (!user) return { error: "Not authenticated." };

  const id = formData.get("id") as string;
  const meta = validateTripMeta({
    title: formData.get("title"),
    description: formData.get("description"),
  });
  if (!meta.ok) return { error: meta.error };
  const { title, description } = meta.value;
  const showOnBookingForm = formData.get("show_on_booking_form") === "true";
  // The edit form always posts the icon input ("" = none) — explicit clear.
  const icon = sanitizeTravelIcon(
    (formData.get("icon") as string)?.trim() || null,
  );
  const iconColor = sanitizeTravelIconColor(
    (formData.get("icon_color") as string)?.trim() || null,
  );
  const iconBg = sanitizeTravelIconBg(
    (formData.get("icon_bg") as string)?.trim() || null,
  );

  const { error } = await supabase
    .from("trips")
    .update({
      title,
      description,
      show_on_booking_form: showOnBookingForm,
      icon,
      icon_color: iconColor,
      icon_bg: iconBg,
    })
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
  if (!user) return { error: "Not authenticated." };

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
  if (!user) return { error: "Not authenticated." };

  // The core enforces the guest spot lock: live stays block deletion, but a
  // trip whose stays are all done or cancelled may be cleaned up.
  const result = await deleteTripCore(user.id, id);
  if (result.error) return { error: result.error };
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
  if (!user) return { error: "Not authenticated." };

  const tripId = formData.get("trip_id") as string;
  const notes = (formData.get("notes") as string)?.trim() || null;
  if (!tripId) return { error: "Trip, start date, and end date are required." };

  // Single-day parity with the native range picker: an empty end date means a
  // one-day stop.
  const startsOn = formData.get("starts_on");
  const endsOnRaw = formData.get("ends_on");
  const endsOn =
    typeof endsOnRaw === "string" && endsOnRaw.trim() ? endsOnRaw : startsOn;

  let leg;
  try {
    leg = validateTripLeg({
      startsOn,
      endsOn,
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

  if (!trip) return { error: "Trip not found." };

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
  if (!user) return { error: "Not authenticated." };

  const result = await deleteTripLegCore(user.id, id);
  if (result.error) return { error: result.error };
  revalidatePath("/travel");
  return { success: true };
}
