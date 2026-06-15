import { describe, it, expect } from "vitest";
import {
  RESERVED_SLUGS,
  SLUG_FORMAT_REGEX,
  isReservedSlug,
  isValidSlugFormat,
  validateSlug,
} from "../slug";

describe("RESERVED_SLUGS", () => {
  it.each([
    // Infrastructure / hostnames
    "www",
    "app",
    "api",
    "auth",
    "admin",
    "mail",
    "docs",
    "status",
    "static",
    "assets",
    "cdn",
    "stripe",
    "webhook",
    "dev",
    "staging",
    // Auth + product routes
    "login",
    "logout",
    "signup",
    "onboarding",
    "dashboard",
    "settings",
    "billing",
    "pricing",
    "support",
    "help",
    "request",
    "requests",
    "calendar",
    "clients",
    "waitlist",
    "flash",
    "studio",
    "studios",
    "booking",
    "bookings",
    "analytics",
    "travel",
    // Legal
    "legal",
    "terms",
    "privacy",
    "imprint",
    "impressum",
    // Marketing routes
    "about",
    "download",
    "start",
    "dm-chaos",
    "tattoo-booking-software",
    "tattoo-booking-form",
    "guest-spot-booking",
    "guest-spots",
    "best-booking-app-for-tattoo-artists",
    "tattoo-booking-software-vs-calendly",
    "tattoo-booking-software-vs-google-forms",
    "tattoo-booking-software-vs-instagram-dms",
    // Framework / sentinels
    "404",
    "500",
    "null",
    "undefined",
  ])("reserves %s", (name) => {
    expect(RESERVED_SLUGS.has(name)).toBe(true);
  });

  it("does not reserve common artist slugs", () => {
    expect(RESERVED_SLUGS.has("bert-grimm")).toBe(false);
    expect(RESERVED_SLUGS.has("ouch370")).toBe(false);
    expect(RESERVED_SLUGS.has("alice")).toBe(false);
  });
});

describe("SLUG_FORMAT_REGEX", () => {
  it("matches a basic slug", () => {
    expect(SLUG_FORMAT_REGEX.test("alice")).toBe(true);
  });

  it("rejects uppercase", () => {
    expect(SLUG_FORMAT_REGEX.test("Alice")).toBe(false);
  });
});

describe("isValidSlugFormat", () => {
  it("accepts a basic slug", () => {
    expect(isValidSlugFormat("alice")).toBe(true);
  });

  it("accepts a slug with digits", () => {
    expect(isValidSlugFormat("ouch370")).toBe(true);
  });

  it("accepts a slug with single dashes", () => {
    expect(isValidSlugFormat("a-b-c")).toBe(true);
  });

  it("rejects a slug starting with a digit", () => {
    expect(isValidSlugFormat("370ouch")).toBe(false);
  });

  it("rejects a slug starting with a dash", () => {
    expect(isValidSlugFormat("-foo")).toBe(false);
  });

  it("rejects a slug ending with a dash", () => {
    expect(isValidSlugFormat("foo-")).toBe(false);
  });

  it("rejects double dashes", () => {
    expect(isValidSlugFormat("foo--bar")).toBe(false);
  });

  it("rejects uppercase letters", () => {
    expect(isValidSlugFormat("Alice")).toBe(false);
  });

  it("rejects under-minimum length", () => {
    expect(isValidSlugFormat("ab")).toBe(false);
  });

  it("accepts exactly 3 characters", () => {
    expect(isValidSlugFormat("abc")).toBe(true);
  });

  it("rejects over-maximum length", () => {
    expect(isValidSlugFormat("a".repeat(31))).toBe(false);
  });

  it("accepts exactly 30 characters", () => {
    expect(isValidSlugFormat("a".repeat(30))).toBe(true);
  });
});

describe("isReservedSlug", () => {
  it("returns true for reserved names", () => {
    expect(isReservedSlug("app")).toBe(true);
    expect(isReservedSlug("dashboard")).toBe(true);
  });

  it("returns false for non-reserved names", () => {
    expect(isReservedSlug("alice")).toBe(false);
    expect(isReservedSlug("ouch370")).toBe(false);
  });
});

describe("validateSlug", () => {
  it("returns null for a valid non-reserved slug", () => {
    expect(validateSlug("alice")).toBeNull();
  });

  it("returns an error for too-short", () => {
    expect(validateSlug("ab")).toMatch(/at least 3/);
  });

  it("returns an error for too-long", () => {
    expect(validateSlug("a".repeat(31))).toMatch(/at most 30/);
  });

  it("returns an error for bad format", () => {
    expect(validateSlug("370ouch")).toMatch(/lowercase/);
  });

  it("returns an error for reserved", () => {
    expect(validateSlug("app")).toMatch(/reserved/);
  });

  it("returns an error for reserved marketing route", () => {
    expect(validateSlug("dm-chaos")).toMatch(/reserved/);
  });
});
