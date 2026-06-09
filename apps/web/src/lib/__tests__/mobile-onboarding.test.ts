import { describe, it, expect } from "vitest";
import {
  BOOKING_MODES,
  DEFAULT_TIMEZONE,
  DISPLAY_NAME_MAX,
  INSTAGRAM_MAX,
  isBookingMode,
  isClaimedProfile,
  normalizeBookingInput,
  normalizeProfileInput,
  resolveSlugAvailability,
} from "../mobile-onboarding";

describe("normalizeProfileInput", () => {
  it("accepts a valid payload and normalizes the fields", () => {
    const result = normalizeProfileInput({
      slug: "  Jane-Doe ",
      displayName: "  Jane Doe  ",
      instagramHandle: " @jane.doe ",
      location: "  Berlin ",
      timezone: "Europe/Lisbon",
    });
    expect(result).toEqual({
      ok: true,
      value: {
        slug: "jane-doe",
        displayName: "Jane Doe",
        instagramHandle: "jane.doe",
        location: "Berlin",
        timezone: "Europe/Lisbon",
      },
    });
  });

  it("defaults a missing/blank timezone to Europe/Berlin", () => {
    const result = normalizeProfileInput({
      slug: "janedoe",
      displayName: "Jane",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.timezone).toBe(DEFAULT_TIMEZONE);
  });

  it("collapses empty optional fields to null", () => {
    const result = normalizeProfileInput({
      slug: "janedoe",
      displayName: "Jane",
      instagramHandle: "   ",
      location: "",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.instagramHandle).toBeNull();
      expect(result.value.location).toBeNull();
    }
  });

  it("rejects a missing display name", () => {
    const result = normalizeProfileInput({
      slug: "janedoe",
      displayName: "   ",
    });
    expect(result).toEqual({ ok: false, error: "Display name is required." });
  });

  it("rejects a too-short slug with the validateSlug message", () => {
    const result = normalizeProfileInput({ slug: "ab", displayName: "Jane" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/too short/);
  });

  it("rejects a reserved slug", () => {
    const result = normalizeProfileInput({
      slug: "admin",
      displayName: "Jane",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/reserved/);
  });

  it("tolerates a non-object / null body without throwing", () => {
    expect(normalizeProfileInput(null).ok).toBe(false);
    expect(normalizeProfileInput(undefined).ok).toBe(false);
    expect(normalizeProfileInput("nope").ok).toBe(false);
  });

  it("rejects an over-long display name", () => {
    const result = normalizeProfileInput({
      slug: "janedoe",
      displayName: "x".repeat(DISPLAY_NAME_MAX + 1),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/too long/);
  });

  it("rejects an over-long instagram handle (after stripping @)", () => {
    const result = normalizeProfileInput({
      slug: "janedoe",
      displayName: "Jane",
      instagramHandle: "@" + "x".repeat(INSTAGRAM_MAX + 1),
    });
    expect(result.ok).toBe(false);
  });
});

describe("isClaimedProfile", () => {
  it("is false for a null/undefined or slug-less profile", () => {
    expect(isClaimedProfile(null)).toBe(false);
    expect(isClaimedProfile(undefined)).toBe(false);
    expect(isClaimedProfile({ slug: null })).toBe(false);
    expect(isClaimedProfile({ slug: "" })).toBe(false);
  });

  it("is true once a slug is present (the booking/complete guard)", () => {
    expect(isClaimedProfile({ slug: "janedoe" })).toBe(true);
    expect(isClaimedProfile({ slug: "janedoe", settings: {} })).toBe(true);
  });
});

describe("resolveSlugAvailability", () => {
  it("is available + not owned when no row holds the slug", () => {
    expect(resolveSlugAvailability(null, "user-1")).toEqual({
      available: true,
      owned: false,
    });
  });

  it("is available + owned when the requester already holds it", () => {
    expect(resolveSlugAvailability({ id: "user-1" }, "user-1")).toEqual({
      available: true,
      owned: true,
    });
  });

  it("is unavailable when someone else holds it", () => {
    expect(resolveSlugAvailability({ id: "user-2" }, "user-1")).toEqual({
      available: false,
      owned: false,
    });
  });
});

describe("isBookingMode", () => {
  it("accepts the known modes and rejects everything else", () => {
    for (const mode of BOOKING_MODES) expect(isBookingMode(mode)).toBe(true);
    expect(isBookingMode("walk_in")).toBe(false);
    expect(isBookingMode("")).toBe(false);
    expect(isBookingMode(undefined)).toBe(false);
  });
});

describe("normalizeBookingInput", () => {
  it("accepts a valid open payload", () => {
    expect(
      normalizeBookingInput({ bookingMode: "preferred_date", booksOpen: true }),
    ).toEqual({
      ok: true,
      value: {
        bookingMode: "preferred_date",
        booksOpen: true,
        booksClosedMessage: null,
      },
    });
  });

  it("keeps a trimmed closed message when closed", () => {
    const result = normalizeBookingInput({
      bookingMode: "fixed_slots",
      booksOpen: false,
      booksClosedMessage: "  Back in July  ",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.booksClosedMessage).toBe("Back in July");
  });

  it("rejects an unknown booking mode", () => {
    const result = normalizeBookingInput({
      bookingMode: "walk_in",
      booksOpen: true,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a non-boolean booksOpen", () => {
    const result = normalizeBookingInput({
      bookingMode: "preferred_date",
      booksOpen: "yes",
    });
    expect(result.ok).toBe(false);
  });
});
