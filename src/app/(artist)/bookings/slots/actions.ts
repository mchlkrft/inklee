"use server";

import { createClient } from "@/lib/supabase/server";
import { addDaysToDateKey } from "@/lib/date-utils";
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

export async function createSlotsFromPatternAction(
  formData: FormData,
): Promise<{ error: string } | { success: true; count: number }> {
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

  // Parse time windows
  let windows: { start: string; end: string }[];
  try {
    windows = JSON.parse(formData.get("windows_json") as string);
    if (!Array.isArray(windows) || windows.length === 0)
      return { error: "at least one time window is required" };
    for (const w of windows) {
      if (!w.start || !w.end || w.end <= w.start)
        return {
          error: "each window must have a start time before its end time",
        };
    }
  } catch {
    return { error: "invalid window data" };
  }

  // Generate date list
  const applyMode = formData.get("apply_mode") as string;
  const dates: string[] = [];

  if (applyMode === "weekdays") {
    let weekdays: number[];
    try {
      weekdays = JSON.parse(formData.get("weekdays_json") as string);
      if (!Array.isArray(weekdays) || weekdays.length === 0)
        return { error: "select at least one weekday" };
    } catch {
      return { error: "invalid weekday data" };
    }
    const fromDate = formData.get("from_date") as string;
    const toDate = formData.get("to_date") as string;
    if (!fromDate || !toDate) return { error: "date range is required" };

    for (
      let dateKey = fromDate;
      dateKey <= toDate;
      dateKey = addDaysToDateKey(dateKey, 1)
    ) {
      const d = new Date(`${dateKey}T12:00:00Z`);
      if (weekdays.includes((d.getDay() + 6) % 7)) {
        dates.push(dateKey);
      }
    }
  } else if (applyMode === "dates") {
    let parsed: string[];
    try {
      parsed = JSON.parse(formData.get("dates_json") as string);
      if (!Array.isArray(parsed) || parsed.length === 0)
        return { error: "add at least one date" };
      dates.push(...parsed);
    } catch {
      return { error: "invalid date data" };
    }
  } else {
    return { error: "invalid apply mode" };
  }

  if (dates.length === 0) return { error: "no matching dates in that range" };

  // Build slot records — each window on each date is one slot
  const slots = [];
  for (const date of dates) {
    for (const w of windows) {
      const startsAt = localToUTC(date, w.start, timezone);
      const endsAt = localToUTC(date, w.end, timezone);
      const durationMinutes = Math.round(
        (new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60000,
      );
      slots.push({
        artist_id: user.id,
        starts_at: startsAt,
        ends_at: endsAt,
        duration_minutes: durationMinutes,
        status: "open" as const,
      });
    }
  }

  const { error } = await supabase.from("slots").insert(slots);
  if (error) return { error: error.message };

  revalidatePath("/bookings/settings");
  return { success: true, count: slots.length };
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
