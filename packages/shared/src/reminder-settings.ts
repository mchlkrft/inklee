// Automated reminder-email settings (stored in profiles.settings.reminder_settings).
// The 1-14 / 3-30 day bounds + 3/14 defaults were duplicated across the web write
// action, the mobile POST route, and the read path (which REPLACED out-of-range
// values with the default while the writers CLAMPED them). Single-sourced here.
// Pure + Intl-free. (ME-10 D3)

export interface ReminderSettings {
  deposit_overdue_enabled: boolean;
  appointment_reminder_enabled: boolean;
  appointment_reminder_days: number; // days before appointment
  reconfirmation_enabled: boolean;
  reconfirmation_days: number; // days before appointment
}

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  deposit_overdue_enabled: true,
  appointment_reminder_enabled: true,
  appointment_reminder_days: 3,
  reconfirmation_enabled: true,
  reconfirmation_days: 14,
};

// Day-count bounds, exported once so the two stepper UIs (web reminders-form,
// mobile emails screen) and the sanitizer all agree.
export const REMINDER_BOUNDS = {
  appointmentReminderDays: { min: 1, max: 14, default: 3 },
  reconfirmationDays: { min: 3, max: 30, default: 14 },
} as const;

type DayBounds = { min: number; max: number; default: number };

// CLAMP an out-of-range day count into [min,max] (the canonical write-path
// behavior; the read path previously REPLACED out-of-range with the default).
// 0 / NaN / non-numeric collapse to the default, matching the writers' `|| default`.
function clampDays(value: unknown, bounds: DayBounds): number {
  const num = typeof value === "number" ? value : Number(value);
  const t = Number.isFinite(num) ? Math.trunc(num) : 0;
  const base = t === 0 ? bounds.default : t;
  return Math.min(bounds.max, Math.max(bounds.min, base));
}

// Accept BOTH a JSON boolean and the FormData "true"/"false" string. A truly
// absent / unrecognized value resolves to `absent` — the write paths pass false
// (an omitted flag means disabled), the read path passes the field default.
function coerceBool(value: unknown, absent: boolean): boolean {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return absent;
}

/**
 * Normalize a reminder-settings object. `absentBooleans` is the dangerous knob:
 * - "false"  (WRITE paths): an omitted flag means the artist turned it off.
 * - "default" (READ path): an omitted flag falls back to the field default (on).
 * Day counts are always clamped into REMINDER_BOUNDS.
 */
export function sanitizeReminderSettings(
  raw: unknown,
  opts: { absentBooleans: "false" | "default" },
): ReminderSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const boolAbsent = (def: boolean) =>
    opts.absentBooleans === "default" ? def : false;
  return {
    deposit_overdue_enabled: coerceBool(
      r.deposit_overdue_enabled,
      boolAbsent(DEFAULT_REMINDER_SETTINGS.deposit_overdue_enabled),
    ),
    appointment_reminder_enabled: coerceBool(
      r.appointment_reminder_enabled,
      boolAbsent(DEFAULT_REMINDER_SETTINGS.appointment_reminder_enabled),
    ),
    appointment_reminder_days: clampDays(
      r.appointment_reminder_days,
      REMINDER_BOUNDS.appointmentReminderDays,
    ),
    reconfirmation_enabled: coerceBool(
      r.reconfirmation_enabled,
      boolAbsent(DEFAULT_REMINDER_SETTINGS.reconfirmation_enabled),
    ),
    reconfirmation_days: clampDays(
      r.reconfirmation_days,
      REMINDER_BOUNDS.reconfirmationDays,
    ),
  };
}

/** Read a STORED reminder-settings object (the daily cron, the Emails page, and
 *  the mobile GET use this): an absent boolean falls back to its default (on). */
export function parseReminderSettings(raw: unknown): ReminderSettings {
  return sanitizeReminderSettings(raw, { absentBooleans: "default" });
}
