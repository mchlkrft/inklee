import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import {
  parseReminderSettings,
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

// JSON-body equivalent of saveReminderSettingsAction's `parseInt(...) || n`
// coercion: a non-numeric value collapses to 0 so the `|| default` kicks in.
function toInt(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

// POST /api/mobile/settings/reminders { ...5 reminder fields } — persist into
// profiles.settings.reminder_settings. Mirrors saveReminderSettingsAction
// exactly: strict boolean coercion, day counts clamped to 1-14 / 3-30 with the
// web defaults (3 / 14) as fallback, and the settings JSONB merged so other
// keys (deposit_defaults, dashboard widgets, …) are preserved.
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
  const r = raw as Record<string, unknown>;

  const reminderSettings: ReminderSettings = {
    deposit_overdue_enabled: r.deposit_overdue_enabled === true,
    appointment_reminder_enabled: r.appointment_reminder_enabled === true,
    appointment_reminder_days: Math.min(
      14,
      Math.max(1, toInt(r.appointment_reminder_days) || 3),
    ),
    reconfirmation_enabled: r.reconfirmation_enabled === true,
    reconfirmation_days: Math.min(
      30,
      Math.max(3, toInt(r.reconfirmation_days) || 14),
    ),
  };

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
