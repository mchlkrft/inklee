import { describe, it, expect } from "vitest";
import {
  sanitizeReminderSettings,
  parseReminderSettings,
  DEFAULT_REMINDER_SETTINGS,
  REMINDER_BOUNDS,
} from "@inklee/shared/reminder-settings";

describe("parseReminderSettings (read path: absent boolean -> default on)", () => {
  it("returns all defaults for a non-object", () => {
    expect(parseReminderSettings(null)).toEqual(DEFAULT_REMINDER_SETTINGS);
    expect(parseReminderSettings("x")).toEqual(DEFAULT_REMINDER_SETTINGS);
  });

  it("keeps stored booleans and defaults absent ones to ON", () => {
    const r = parseReminderSettings({ deposit_overdue_enabled: false });
    expect(r.deposit_overdue_enabled).toBe(false);
    expect(r.appointment_reminder_enabled).toBe(true); // absent -> default on
    expect(r.reconfirmation_enabled).toBe(true);
  });

  it("CLAMPS out-of-range stored day counts (not replace-with-default)", () => {
    expect(
      parseReminderSettings({ appointment_reminder_days: 50 })
        .appointment_reminder_days,
    ).toBe(REMINDER_BOUNDS.appointmentReminderDays.max); // 14, clamped
    expect(
      parseReminderSettings({ reconfirmation_days: 1 }).reconfirmation_days,
    ).toBe(REMINDER_BOUNDS.reconfirmationDays.min); // 3, clamped up
    // 0 collapses to the default
    expect(
      parseReminderSettings({ appointment_reminder_days: 0 })
        .appointment_reminder_days,
    ).toBe(REMINDER_BOUNDS.appointmentReminderDays.default);
  });
});

describe("sanitizeReminderSettings (write path: absent boolean -> false)", () => {
  it("treats an omitted flag as OFF, accepting FormData strings and JSON booleans", () => {
    // The DANGEROUS nuance: a partial body must NOT silently enable a reminder.
    const written = sanitizeReminderSettings(
      { appointment_reminder_enabled: "true" },
      { absentBooleans: "false" },
    );
    expect(written.appointment_reminder_enabled).toBe(true); // "true" string
    expect(written.deposit_overdue_enabled).toBe(false); // omitted -> OFF
    expect(written.reconfirmation_enabled).toBe(false);

    expect(
      sanitizeReminderSettings(
        { deposit_overdue_enabled: true },
        { absentBooleans: "false" },
      ).deposit_overdue_enabled,
    ).toBe(true); // JSON boolean
    expect(
      sanitizeReminderSettings(
        { deposit_overdue_enabled: "false" },
        { absentBooleans: "false" },
      ).deposit_overdue_enabled,
    ).toBe(false);
  });

  it("clamps day counts the same way for the write path", () => {
    const w = sanitizeReminderSettings(
      { appointment_reminder_days: "99", reconfirmation_days: "2" },
      { absentBooleans: "false" },
    );
    expect(w.appointment_reminder_days).toBe(14);
    expect(w.reconfirmation_days).toBe(3);
  });

  it("the SAME partial body resolves opposite per mode (write OFF, read ON)", () => {
    const body = { appointment_reminder_days: 5 }; // no boolean flags
    expect(
      sanitizeReminderSettings(body, { absentBooleans: "false" })
        .deposit_overdue_enabled,
    ).toBe(false);
    expect(parseReminderSettings(body).deposit_overdue_enabled).toBe(true);
  });
});
