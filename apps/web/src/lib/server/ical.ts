// Private iCal feed token (profiles.settings.ical_token) — the SINGLE source for
// generate / revoke / read / feed-URL, used by the web settings/calendar actions
// and the /api/mobile/settings/calendar-export route (which had verbatim copies;
// a third copy under settings/calendar-export was dead). Server-only: takes the
// caller's RLS-scoped client + needs node crypto. (ME-10 D8)

import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

type Settings = Record<string, unknown>;

async function readSettings(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ settings: Settings } | { error: string }> {
  const { data, error } = await supabase
    .from("profiles")
    .select("settings")
    .eq("id", userId)
    .single();
  if (error || !data) return { error: error?.message ?? "Profile not found." };
  return { settings: (data.settings ?? {}) as Settings };
}

/** The stored token, or null. */
export function readIcalToken(
  settings: Settings | null | undefined,
): string | null {
  const t = (settings ?? {}).ical_token;
  return typeof t === "string" ? t : null;
}

/** Public iCal feed URL for a token (the existing capability URL), or null. */
export function icalFeedUrl(token: string | null): string | null {
  if (!token) return null;
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://inklee.app";
  return `${base}/api/ical/${token}`;
}

/** Generate (or rotate) the artist's feed token, merged into settings. */
export async function generateIcalTokenFor(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ token: string } | { error: string }> {
  const read = await readSettings(supabase, userId);
  if ("error" in read) return read;
  const token = crypto.randomBytes(16).toString("hex");
  const { error } = await supabase
    .from("profiles")
    .update({
      settings: { ...read.settings, ical_token: token },
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
  if (error) return { error: error.message };
  return { token };
}

/** Revoke the token (calendar apps holding the old link stop updating). */
export async function revokeIcalTokenFor(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ error: string } | null> {
  const read = await readSettings(supabase, userId);
  if ("error" in read) return read;
  const settings = { ...read.settings };
  delete settings.ical_token;
  const { error } = await supabase
    .from("profiles")
    .update({ settings, updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) return { error: error.message };
  return null;
}
