import { describe, expect, it } from "vitest";
import { extractArtistSlug } from "../artist-slug-resolver";

describe("extractArtistSlug", () => {
  describe("subdomain routes (*.l.inkl.ee)", () => {
    it("extracts slug from link-hub subdomain", () => {
      expect(extractArtistSlug("/", "mikey.l.inkl.ee")).toEqual({
        slug: "mikey",
        surface: "hub",
      });
    });

    it("extracts slug from any path on the subdomain", () => {
      expect(extractArtistSlug("/anything", "mikey.l.inkl.ee")).toEqual({
        slug: "mikey",
        surface: "hub",
      });
    });

    it("is case-insensitive on hostname", () => {
      expect(extractArtistSlug("/", "MIKEY.L.INKL.EE")).toEqual({
        slug: "mikey",
        surface: "hub",
      });
    });

    it("returns null for bare l.inkl.ee (no artist subdomain)", () => {
      expect(extractArtistSlug("/", "l.inkl.ee")).toBeNull();
    });
  });

  describe("path-based routes on main hosts", () => {
    it("extracts hub surface from /<slug>/hub", () => {
      expect(extractArtistSlug("/mikeyink/hub", "inklee.app")).toEqual({
        slug: "mikeyink",
        surface: "hub",
      });
    });

    it("extracts booking_form from bare /<slug>", () => {
      expect(extractArtistSlug("/mikeyink", "inklee.app")).toEqual({
        slug: "mikeyink",
        surface: "booking_form",
      });
    });

    it("extracts shop from /<slug>/shop", () => {
      expect(extractArtistSlug("/mikeyink/shop", "inklee.app")).toEqual({
        slug: "mikeyink",
        surface: "shop",
      });
    });

    it("extracts large_project from /<slug>/project", () => {
      expect(extractArtistSlug("/mikeyink/project", "inklee.app")).toEqual({
        slug: "mikeyink",
        surface: "large_project",
      });
    });
  });

  describe("slug validation", () => {
    it("requires slug to start with alphanumeric", () => {
      expect(extractArtistSlug("/-invalid/hub", "inklee.app")).toBeNull();
      expect(extractArtistSlug("/_invalid/hub", "inklee.app")).toBeNull();
    });

    it("allows hyphens and underscores in slug body", () => {
      expect(extractArtistSlug("/my-artist_name/hub", "inklee.app")).toEqual({
        slug: "my-artist_name",
        surface: "hub",
      });
    });

    it("enforces 2-40 character slug length", () => {
      expect(extractArtistSlug("/a", "inklee.app")).toBeNull();
      const tooLong = "/" + "a".repeat(41);
      expect(extractArtistSlug(tooLong, "inklee.app")).toBeNull();
    });

    it("allows exactly 40-char slugs", () => {
      const slug40 = "a" + "b".repeat(39);
      expect(extractArtistSlug(`/${slug40}`, "inklee.app")).toEqual({
        slug: slug40,
        surface: "booking_form",
      });
    });
  });

  describe("non-artist paths", () => {
    it("returns null for root", () => {
      expect(extractArtistSlug("/", "inklee.app")).toBeNull();
    });

    it("returns null for multi-segment non-artist paths", () => {
      expect(extractArtistSlug("/admin/settings", "inklee.app")).toBeNull();
      expect(extractArtistSlug("/api/something", "inklee.app")).toBeNull();
    });

    it("returns null for unrecognized sub-paths", () => {
      expect(extractArtistSlug("/mikeyink/flash", "inklee.app")).toBeNull();
      expect(extractArtistSlug("/mikeyink/unknown", "inklee.app")).toBeNull();
    });
  });
});
