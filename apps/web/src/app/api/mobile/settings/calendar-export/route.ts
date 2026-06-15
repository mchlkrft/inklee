import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import type { MobileCalendarExport } from "@inklee/shared/mobile-api";

export const runtime = "nodejs";

// The private iCal feed link (settings.ical_token), mirroring the web
// settings/calendar actions. The server builds the full URL so the client
// never learns about token storage; the feed itself stays the existing public
// capability URL at /api/ical/[token].
function feedUrl(token: string | null): string | null {
  if (!token) return null;
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://inklee.app";
  return `${base}/api/ical/${token}`;
}

async function readToken(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ settings: Record<string, unknown>; token: string | null } | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("settings")
    .eq("id", userId)
    .single();
  if (error || !data) return null;
  const settings = (data.settings ?? {}) as Record<string, unknown>;
  const token =
    typeof settings.ical_token === "string" ? settings.ical_token : null;
  return { settings, token };
}

// GET — the current feed URL (null when no token has been generated).
export async function GET(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);

  const read = await readToken(auth.supabase, auth.userId);
  if (!read) return mobileError(500, "Profile not found.");

  const body: MobileCalendarExport = { feedUrl: feedUrl(read.token) };
  return mobileOk(body);
}

// POST — generate a token (overwriting an existing one = rotation), mirroring
// the web generateIcalToken action.
export async function POST(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  const read = await readToken(supabase, userId);
  if (!read) return mobileError(500, "Profile not found.");

  const token = crypto.randomBytes(16).toString("hex");
  const { error } = await supabase
    .from("profiles")
    .update({
      settings: { ...read.settings, ical_token: token },
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
  if (error) return mobileError(500, error.message);

  const body: MobileCalendarExport = { feedUrl: feedUrl(token) };
  return mobileOk(body);
}

// DELETE — revoke the token (calendar apps holding the old link stop
// updating), mirroring the web revokeIcalToken action.
export async function DELETE(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  const read = await readToken(supabase, userId);
  if (!read) return mobileError(500, "Profile not found.");

  const settings = { ...read.settings };
  delete settings.ical_token;
  const { error } = await supabase
    .from("profiles")
    .update({ settings, updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) return mobileError(500, error.message);

  const body: MobileCalendarExport = { feedUrl: null };
  return mobileOk(body);
}
