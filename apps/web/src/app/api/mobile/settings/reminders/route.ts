import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import {
  parseReminderSettings,
  sanitizeReminderSettings,
  type ReminderSettings,
} from "@/lib/reminder-settings";
import type { MobileReminderSettings } from "@inklee/shared/mobile-api";

export const runtime = "nodejs";

// GET /api/mobile/settings/reminders — the artist's automated reminder email
// settings, parsed with the same defaults the web Emails page and the daily
// reminder cron use (parseReminderSettings). Stored in
// profiles.settings.reminder_settings; RLS scopes the read to the artist.
export async function GET(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  const { data, error } = await supabase
    .from("profiles")
    .select("settings")
    .eq("id", userId)
    .single();
  if (error) return mobileError(500, error.message);
  const settings = (data?.settings ?? {}) as Record<string, unknown>;

  const body: MobileReminderSettings = parseReminderSettings(
    settings.reminder_settings,
  );
  return mobileOk(body);
}

// POST /api/mobile/settings/reminders { ...5 reminder fields } — persist into
// profiles.settings.reminder_settings. Uses the shared sanitizer with
// absentBooleans:"false" (an omitted flag means the artist turned it off,
// matching the web save action), day counts clamped to 1-14 / 3-30, and the
// settings JSONB merged so other keys (deposit_defaults, …) are preserved.
export async function POST(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return mobileError(400, "Invalid JSON body.");
  }
  if (!raw || typeof raw !== "object") {
    return mobileError(400, "Invalid body.");
  }
  const reminderSettings: ReminderSettings = sanitizeReminderSettings(raw, {
    absentBooleans: "false",
  });

  const { data: profile, error: readError } = await supabase
    .from("profiles")
    .select("settings")
    .eq("id", userId)
    .single();
  if (readError || !profile) {
    return mobileError(500, readError?.message ?? "Profile not found.");
  }
  const current = (profile.settings ?? {}) as Record<string, unknown>;

  const { error } = await supabase
    .from("profiles")
    .update({
      settings: { ...current, reminder_settings: reminderSettings },
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
  if (error) return mobileError(500, error.message);

  const body: MobileReminderSettings = reminderSettings;
  return mobileOk(body);
}
