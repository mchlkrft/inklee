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

export function parseReminderSettings(raw: unknown): ReminderSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_REMINDER_SETTINGS };
  const r = raw as Record<string, unknown>;
  return {
    deposit_overdue_enabled:
      typeof r.deposit_overdue_enabled === "boolean"
        ? r.deposit_overdue_enabled
        : DEFAULT_REMINDER_SETTINGS.deposit_overdue_enabled,
    appointment_reminder_enabled:
      typeof r.appointment_reminder_enabled === "boolean"
        ? r.appointment_reminder_enabled
        : DEFAULT_REMINDER_SETTINGS.appointment_reminder_enabled,
    appointment_reminder_days:
      typeof r.appointment_reminder_days === "number" &&
      r.appointment_reminder_days >= 1 &&
      r.appointment_reminder_days <= 14
        ? r.appointment_reminder_days
        : DEFAULT_REMINDER_SETTINGS.appointment_reminder_days,
    reconfirmation_enabled:
      typeof r.reconfirmation_enabled === "boolean"
        ? r.reconfirmation_enabled
        : DEFAULT_REMINDER_SETTINGS.reconfirmation_enabled,
    reconfirmation_days:
      typeof r.reconfirmation_days === "number" &&
      r.reconfirmation_days >= 3 &&
      r.reconfirmation_days <= 30
        ? r.reconfirmation_days
        : DEFAULT_REMINDER_SETTINGS.reconfirmation_days,
  };
}
