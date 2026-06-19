import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import {
  readIcalToken,
  icalFeedUrl,
  generateIcalTokenFor,
  revokeIcalTokenFor,
} from "@/lib/server/ical";
import type { MobileCalendarExport } from "@inklee/shared/mobile-api";

export const runtime = "nodejs";

// The private iCal feed link (settings.ical_token). The token core is shared
// with the web settings/calendar actions (ME-10 D8); the server builds the full
// URL so the client never learns about token storage. The feed itself stays the
// existing public capability URL at /api/ical/[token].

// GET — the current feed URL (null when no token has been generated).
export async function GET(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);

  const { data, error } = await auth.supabase
    .from("profiles")
    .select("settings")
    .eq("id", auth.userId)
    .single();
  if (error || !data) return mobileError(500, "Profile not found.");

  const token = readIcalToken(data.settings as Record<string, unknown> | null);
  const body: MobileCalendarExport = { feedUrl: icalFeedUrl(token) };
  return mobileOk(body);
}

// POST — generate a token (overwriting an existing one = rotation).
export async function POST(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);

  const result = await generateIcalTokenFor(auth.supabase, auth.userId);
  if ("error" in result) return mobileError(500, result.error);

  const body: MobileCalendarExport = { feedUrl: icalFeedUrl(result.token) };
  return mobileOk(body);
}

// DELETE — revoke the token (calendar apps holding the old link stop updating).
export async function DELETE(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);

  const result = await revokeIcalTokenFor(auth.supabase, auth.userId);
  if (result?.error) return mobileError(500, result.error);

  const body: MobileCalendarExport = { feedUrl: null };
  return mobileOk(body);
}
