// collector.ts is safe to import under node: its module scope holds only
// imports, constants and function declarations; window/document/process.env
// are touched inside function bodies the tests never call.
import { describe, expect, it } from "vitest";
import { isBookingPagePath } from "../booking-paths";
import { isTrackablePath } from "../collector";

describe("isTrackablePath", () => {
  it.each([
    "/",
    "/about",
    "/start",
    "/download",
    "/guides/deposits",
    "/tattoo-booking-software",
    "/mikeyink",
  ])("tracks the public path %s", (pathname) => {
    expect(isTrackablePath(pathname)).toBe(true);
  });

  it.each([
    "/dashboard",
    "/dashboard/requests",
    "/admin/x",
    "/api/y",
    "/onboarding/z",
    "/settings",
    "/auth/callback",
    "/request/some-token",
  ])("never tracks the private path %s", (pathname) => {
    expect(isTrackablePath(pathname)).toBe(false);
  });

  it("blocks whole segments only, not lookalike prefixes", () => {
    expect(isTrackablePath("/apiary")).toBe(true);
    expect(isTrackablePath("/dashboard-tips")).toBe(true);
    expect(isTrackablePath("/api")).toBe(false);
  });
});

describe("isBookingPagePath", () => {
  it("treats any path on an artist subdomain as a booking page", () => {
    expect(isBookingPagePath("/", "mikey.inkl.ee")).toBe(true);
    expect(isBookingPagePath("/flash", "mikey.inkl.ee")).toBe(true);
  });

  it("excludes the apex inkl.ee redirect host", () => {
    expect(isBookingPagePath("/", "inkl.ee")).toBe(false);
  });

  it("excludes link hub pages on *.l.inkl.ee", () => {
    expect(isBookingPagePath("/", "hub.l.inkl.ee")).toBe(false);
    expect(isBookingPagePath("/anything", "hub.l.inkl.ee")).toBe(false);
  });

  it("counts a single-segment slug on the main host", () => {
    expect(isBookingPagePath("/mikeyink", "inklee.app")).toBe(true);
  });

  it("excludes known marketing and app routes", () => {
    expect(isBookingPagePath("/about", "inklee.app")).toBe(false);
    expect(isBookingPagePath("/download", "inklee.app")).toBe(false);
    expect(isBookingPagePath("/dashboard", "inklee.app")).toBe(false);
  });

  it("excludes real reserved marketing routes", () => {
    // Every shippable top-level route is a reserved slug, so it can never be
    // an artist booking page. Well-formed non-reserved slugs, by contrast, are
    // valid artist slugs and DO count (an artist could claim "best-tattoo").
    expect(isBookingPagePath("/tattoo-booking-software", "inklee.app")).toBe(
      false,
    );
    expect(isBookingPagePath("/guest-spot-booking", "inklee.app")).toBe(false);
    expect(
      isBookingPagePath("/best-booking-app-for-tattoo-artists", "inklee.app"),
    ).toBe(false);
    // A non-reserved, validly-shaped slug is a potential artist page.
    expect(isBookingPagePath("/mikeyink", "inklee.app")).toBe(true);
  });

  it("excludes malformed junk single-segment paths (404s)", () => {
    expect(isBookingPagePath("/Not_A_Slug!", "inklee.app")).toBe(false);
    expect(isBookingPagePath("/a", "inklee.app")).toBe(false);
  });

  it("excludes multi-segment and root paths on the main host", () => {
    expect(isBookingPagePath("/mikeyink/flash", "inklee.app")).toBe(false);
    expect(isBookingPagePath("/", "inklee.app")).toBe(false);
  });

  it("is case insensitive on host and path", () => {
    expect(isBookingPagePath("/", "MIKEY.INKL.EE")).toBe(true);
    expect(isBookingPagePath("/About", "inklee.app")).toBe(false);
  });
});
