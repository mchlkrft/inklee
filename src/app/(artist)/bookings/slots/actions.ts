"use server";

import { createClient } from "@/lib/supabase/server";
import { localToUTC, generateSubSlots } from "@/lib/timezone";
import { revalidatePath } from "next/cache";

type ActionResult = { error: string } | { success: true };

export async function createSlotAction(
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .single();
  const timezone = profile?.timezone ?? "Europe/Berlin";

  const date = formData.get("date") as string;
  const time = formData.get("time") as string;
  const duration = parseInt(formData.get("duration") as string, 10);

  if (!date || !time || !duration) return { error: "all fields are required" };

  const startsAt = localToUTC(date, time, timezone);
  const endsAt = new Date(
    new Date(startsAt).getTime() + duration * 60000,
  ).toISOString();

  const { error } = await supabase.from("slots").insert({
    artist_id: user.id,
    starts_at: startsAt,
    ends_at: endsAt,
    duration_minutes: duration,
    status: "open",
  });

  if (error) return { error: error.message };

  revalidatePath("/bookings/slots");
  return { success: true };
}

export async function createSlotBlockAction(
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .single();
  const timezone = profile?.timezone ?? "Europe/Berlin";

  const date = formData.get("date") as string;
  const startTime = formData.get("start_time") as string;
  const endTime = formData.get("end_time") as string;
  const duration = parseInt(formData.get("duration") as string, 10);

  if (!date || !startTime || !endTime || !duration) {
    return { error: "all fields are required" };
  }

  const slots = generateSubSlots(date, startTime, endTime, duration, timezone);
  if (slots.length === 0)
    return { error: "no slots can fit in that time range" };

  const { error } = await supabase.from("slots").insert(
    slots.map((s) => ({
      artist_id: user.id,
      starts_at: s.startsAt,
      ends_at: s.endsAt,
      duration_minutes: s.durationMinutes,
      status: "open",
    })),
  );

  if (error) return { error: error.message };

  revalidatePath("/bookings/slots");
  return { success: true };
}

export async function deleteSlotAction(slotId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not authenticated" };

  const { error } = await supabase
    .from("slots")
    .delete()
    .eq("id", slotId)
    .eq("artist_id", user.id)
    .eq("status", "open");

  if (error) return { error: error.message };

  revalidatePath("/bookings/slots");
  return { success: true };
}
