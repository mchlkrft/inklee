import { describe, it, expect } from "vitest";
import { DEFAULT_BOOKS_SETTINGS } from "../books-settings";
import {
  CONNECT_LINK_ALLOWED_NEXT,
  DISPLAY_NAME_MAX,
  normalizeBookingMode,
  normalizeBooksConfig,
  normalizeDepositDefaults,
  normalizeProfileUpdate,
  resolveConnectNext,
} from "../mobile-settings";

describe("normalizeBookingMode", () => {
  it("accepts the two valid modes", () => {
    expect(normalizeBookingMode("preferred_date")).toEqual({
      ok: true,
      value: "preferred_date",
    });
    expect(normalizeBookingMode("fixed_slots")).toEqual({
      ok: true,
      value: "fixed_slots",
    });
  });

  it("rejects anything else with the web action's error copy", () => {
    for (const bad of ["slots", "", null, undefined, 1, {}]) {
      expect(normalizeBookingMode(bad)).toEqual({
        ok: false,
        error: "Invalid booking mode.",
      });
    }
  });
});

describe("normalizeProfileUpdate", () => {
  it("normalizes the text fields and omits absent optional columns", () => {
    const r = normalizeProfileUpdate({
      displayName: "  Jane  ",
      bio: "  inkslinger  ",
      instagramHandle: " @jane ",
      location: "  Berlin ",
    });
    expect(r).toEqual({
      ok: true,
      value: {
        displayName: "Jane",
        bio: "inkslinger",
        instagramHandle: "jane",
        location: "Berlin",
      },
    });
  });

  it("includes timezone + bookingMode only when provided and valid", () => {
    const r = normalizeProfileUpdate({
      displayName: "Jane",
      timezone: "Europe/Lisbon",
      bookingMode: "fixed_slots",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.timezone).toBe("Europe/Lisbon");
      expect(r.value.bookingMode).toBe("fixed_slots");
    }
  });

  it("rejects a missing display name, an over-long bio, and a bad booking mode", () => {
    expect(normalizeProfileUpdate({ displayName: " " }).ok).toBe(false);
    expect(
      normalizeProfileUpdate({ displayName: "Jane", bio: "x".repeat(281) }).ok,
    ).toBe(false);
    expect(
      normalizeProfileUpdate({ displayName: "Jane", bookingMode: "walk_in" })
        .ok,
    ).toBe(false);
    expect(
      normalizeProfileUpdate({ displayName: "x".repeat(DISPLAY_NAME_MAX + 1) })
        .ok,
    ).toBe(false);
  });
});

describe("normalizeBooksConfig", () => {
  it("builds the full settings and preserves form_appearance from current", () => {
    const current = {
      ...DEFAULT_BOOKS_SETTINGS,
      form_appearance: "light" as const,
    };
    const r = normalizeBooksConfig(
      {
        open: false,
        bookingCap: 5,
        bookingWindowEndsAt: "2026-08-01",
        booksClosedMessage: "  Back in August ",
      },
      current,
    );
    expect(r).toEqual({
      ok: true,
      value: {
        books_open: false,
        booking_cap: 5,
        booking_window_ends_at: "2026-08-01",
        books_closed_message: "Back in August",
        form_appearance: "light",
      },
    });
  });

  it("clears a field on explicit null but preserves an omitted one (merge)", () => {
    const current = {
      ...DEFAULT_BOOKS_SETTINGS,
      booking_cap: 5,
      books_closed_message: "On break",
      booking_window_ends_at: "2026-09-01",
    };
    const r = normalizeBooksConfig({ open: true, bookingCap: null }, current);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.booking_cap).toBeNull(); // explicit null clears
      expect(r.value.books_closed_message).toBe("On break"); // omitted → preserved
      expect(r.value.booking_window_ends_at).toBe("2026-09-01"); // omitted → preserved
      expect(r.value.books_open).toBe(true);
    }
  });

  it("rejects a non-boolean open, a non-positive cap, and an over-long message", () => {
    expect(
      normalizeBooksConfig({ open: "yes" }, DEFAULT_BOOKS_SETTINGS).ok,
    ).toBe(false);
    expect(
      normalizeBooksConfig(
        { open: true, bookingCap: 0 },
        DEFAULT_BOOKS_SETTINGS,
      ).ok,
    ).toBe(false);
    expect(
      normalizeBooksConfig(
        { open: true, booksClosedMessage: "x".repeat(281) },
        DEFAULT_BOOKS_SETTINGS,
      ).ok,
    ).toBe(false);
  });
});

describe("normalizeDepositDefaults", () => {
  it("accepts a valid payload and rounds the amount to cents", () => {
    const r = normalizeDepositDefaults({
      amount: 49.999,
      dueDays: 7,
      note: "  Thanks  ",
    });
    expect(r).toEqual({
      ok: true,
      value: { amount: 50, due_days: 7, note: "Thanks" },
    });
  });

  it("treats a 0/absent amount as null (no default)", () => {
    const r = normalizeDepositDefaults({ amount: 0, dueDays: 14 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.amount).toBeNull();
  });

  it("rejects a negative amount and an out-of-range due window", () => {
    expect(normalizeDepositDefaults({ amount: -1, dueDays: 7 }).ok).toBe(false);
    expect(normalizeDepositDefaults({ dueDays: 0 }).ok).toBe(false);
    expect(normalizeDepositDefaults({ dueDays: 91 }).ok).toBe(false);
  });
});

describe("resolveConnectNext", () => {
  it("passes through an allowlisted path and defaults everything else to payouts", () => {
    for (const path of CONNECT_LINK_ALLOWED_NEXT) {
      expect(resolveConnectNext(path)).toBe(path);
    }
    expect(resolveConnectNext("/admin")).toBe("/settings/payouts");
    expect(resolveConnectNext("https://evil.example")).toBe(
      "/settings/payouts",
    );
    expect(resolveConnectNext(undefined)).toBe("/settings/payouts");
  });
});
