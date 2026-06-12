// Slot CRUD core — the single server-side implementation behind BOTH the web
// server actions (apps/web/src/app/(artist)/bookings/slots/actions.ts) and the
// /api/mobile/slots routes, so the two platforms cannot drift (the pattern of
// lib/server/bookings.ts *Core functions). Pure pattern math lives in
// @inklee/shared/slot-pattern; this module owns the timezone fetch, the
// wall-clock -> UTC conversion, the inserts/deletes, and the no-slots-warning
// side effects.

import type { SupabaseClient } from "@supabase/supabase-js";
import { serviceClient } from "@/lib/supabase/service";
import { createNotification } from "@/lib/notifications";
import { localToUTC } from "@/lib/timezone";
import {
  expandPatternDates,
  type SlotPatternInput,
} from "@inklee/shared/slot-pattern";

export type SlotRow = {
  id: string;
  starts_at: string;
  ends_at: string;
  duration_minutes: number;
  status: string;
};

/** The artist's slot list — the one query both the web settings page and the
 *  mobile list use (cancelled filtered defensively; it is never written). */
export async function listSlotsForArtist(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ slots: SlotRow[] } | { error: string }> {
  const { data, error } = await supabase
    .from("slots")
    .select("id, starts_at, ends_at, duration_minutes, status")
    .eq("artist_id", userId)
    .neq("status", "cancelled")
    .order("starts_at", { ascending: true });
  if (error) return { error: error.message };
  return { slots: (data ?? []) as SlotRow[] };
}

/** Open-slot count — the single definition behind openSlotCount /
 *  isFixedSlotsWithoutSlots everywhere (books GET, booking-form GET,
 *  booking-mode POST, slots GET). A future filter change applies once. */
export async function queryOpenSlotCount(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ count: number } | { error: string }> {
  const { count, error } = await supabase
    .from("slots")
    .select("*", { count: "exact", head: true })
    .eq("artist_id", userId)
    .eq("status", "open");
  if (error) return { error: error.message };
  return { count: count ?? 0 };
}

/**
 * Create slots from a validated pattern: every window on every expanded date
 * becomes one open slot whose duration is end - start, converted from the
 * ARTIST'S stored profile timezone (never a device/browser timezone). On
 * success the standing no-slots warning resolves (best-effort) — the artist
 * just did what it asked for.
 */
export async function createSlotsFromPattern(
  supabase: SupabaseClient,
  userId: string,
  input: SlotPatternInput,
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  // A FAILED read must not silently fall back to Berlin (every slot would be
  // created in the wrong wall-clock time); only a null timezone column does.
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", userId)
    .single();
  if (profileError) return { ok: false, error: profileError.message };
  const timezone = profile?.timezone ?? "Europe/Berlin";

  const dates = expandPatternDates(input);
  if (dates.length === 0) {
    return { ok: false, error: "No matching dates in that range." };
  }

  const rows = [];
  for (const date of dates) {
    for (const w of input.windows) {
      const startsAt = localToUTC(date, w.start, timezone);
      const endsAt = localToUTC(date, w.end, timezone);
      const durationMinutes = Math.round(
        (new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60000,
      );
      rows.push({
        artist_id: userId,
        starts_at: startsAt,
        ends_at: endsAt,
        duration_minutes: durationMinutes,
        status: "open" as const,
      });
    }
  }

  const { error } = await supabase.from("slots").insert(rows);
  if (error) return { ok: false, error: error.message };

  // Awaited: un-awaited work after a serverless response is not guaranteed to
  // run, and the mobile client refetches notifications right after the POST.
  // Still best-effort — the helper swallows its own errors.
  await resolveNoSlotsWarning(userId);
  return { ok: true, count: rows.length };
}

/**
 * Delete a slot the artist owns, only while it is still open — the row-level
 * status guard (not application logic) is what prevents deleting a slot a
 * client locked mid-checkout. Silently succeeds on zero affected rows, like
 * the original web action.
 */
export async function deleteOpenSlot(
  supabase: SupabaseClient,
  userId: string,
  slotId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase
    .from("slots")
    .delete()
    .eq("id", slotId)
    .eq("artist_id", userId)
    .eq("status", "open");
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * File the high-priority "no time slots set up yet" warning, deduped on the
 * unresolved flag — shared by the web skip action and the mobile booking-mode
 * route (previously duplicated verbatim in both).
 */
export async function fileNoSlotsWarning(
  artistId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { count } = await serviceClient
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("artist_id", artistId)
    .eq("type", "system_warning")
    .is("is_resolved", false)
    .contains("metadata", { warning_type: "no_slots_warning" });

  if ((count ?? 0) === 0) {
    const result = await createNotification({
      artistId,
      type: "system_warning",
      category: "system_warning",
      priority: "high",
      title: "No time slots set up yet",
      message:
        "Fixed slots mode is active but no time slots have been added. Clients cannot book until you create some slots.",
      ctaLabel: "Set up slots",
      ctaHref: "/bookings/settings",
      isResolved: false,
      metadata: { warning_type: "no_slots_warning" },
    });
    if (!result.ok) return { ok: false, error: result.error };
  }
  return { ok: true };
}

/** Resolve any unresolved no-slots warning after slots were created. Both
 *  platforms create through createSlotsFromPattern, so the resolution rule
 *  lives exactly once. Best-effort: failures log, never fail the create. */
export async function resolveNoSlotsWarning(artistId: string): Promise<void> {
  const { error } = await serviceClient
    .from("notifications")
    .update({ is_resolved: true })
    .eq("artist_id", artistId)
    .eq("type", "system_warning")
    .is("is_resolved", false)
    .contains("metadata", { warning_type: "no_slots_warning" });
  if (error) {
    console.error("[slots] resolve no-slots warning failed", error.message);
  }
}
