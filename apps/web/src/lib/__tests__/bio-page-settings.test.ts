import { describe, it, expect } from "vitest";
import {
  sanitizeBioLinkUrl,
  parseBioPageSettings,
  visibleModules,
  isModuleVisible,
  DEFAULT_BIO_PAGE,
  MAX_BOOKING_POLICY,
  MAX_LINKS,
} from "../bio-page-settings";

describe("sanitizeBioLinkUrl", () => {
  it("accepts https and http URLs", () => {
    expect(sanitizeBioLinkUrl("https://instagram.com/artist")).toBe(
      "https://instagram.com/artist",
    );
    expect(sanitizeBioLinkUrl("http://example.com/")).toBe(
      "http://example.com/",
    );
  });

  it("prepends https:// to bare domains", () => {
    expect(sanitizeBioLinkUrl("instagram.com/artist")).toBe(
      "https://instagram.com/artist",
    );
  });

  it("accepts a well-formed mailto address", () => {
    expect(sanitizeBioLinkUrl("mailto:hi@artist.com")).toBe(
      "mailto:hi@artist.com",
    );
  });

  it("rejects malformed mailto", () => {
    expect(sanitizeBioLinkUrl("mailto:not-an-email")).toBeNull();
  });

  it("rejects unsafe schemes", () => {
    expect(sanitizeBioLinkUrl("javascript:alert(1)")).toBeNull();
    expect(sanitizeBioLinkUrl("  javascript:alert(1)")).toBeNull();
    expect(sanitizeBioLinkUrl("JavaScript:alert(1)")).toBeNull();
    expect(sanitizeBioLinkUrl("data:text/html,<script>")).toBeNull();
    expect(sanitizeBioLinkUrl("file:///etc/passwd")).toBeNull();
    expect(sanitizeBioLinkUrl("ftp://example.com")).toBeNull();
  });

  it("rejects empty / non-string input", () => {
    expect(sanitizeBioLinkUrl("")).toBeNull();
    expect(sanitizeBioLinkUrl("   ")).toBeNull();
    expect(sanitizeBioLinkUrl(null)).toBeNull();
    expect(sanitizeBioLinkUrl(42)).toBeNull();
  });
});

describe("parseBioPageSettings", () => {
  it("returns defaults for empty / invalid input", () => {
    expect(parseBioPageSettings(null)).toEqual(DEFAULT_BIO_PAGE);
    expect(parseBioPageSettings(undefined)).toEqual(DEFAULT_BIO_PAGE);
    expect(parseBioPageSettings("nope")).toEqual(DEFAULT_BIO_PAGE);
    expect(parseBioPageSettings({})).toEqual(DEFAULT_BIO_PAGE);
  });

  it("trims and caps the booking policy", () => {
    expect(
      parseBioPageSettings({ bookingPolicy: "  hi  " }).bookingPolicy,
    ).toBe("hi");
    const long = "x".repeat(MAX_BOOKING_POLICY + 50);
    expect(
      parseBioPageSettings({ bookingPolicy: long }).bookingPolicy?.length,
    ).toBe(MAX_BOOKING_POLICY);
    expect(
      parseBioPageSettings({ bookingPolicy: "   " }).bookingPolicy,
    ).toBeNull();
  });

  it("drops links with unsafe URLs but keeps safe ones", () => {
    const result = parseBioPageSettings({
      customLinks: [
        { id: "a", label: "IG", url: "instagram.com/x", isActive: true },
        { id: "b", label: "evil", url: "javascript:alert(1)", isActive: true },
        { id: "c", label: "Site", url: "https://site.com", isActive: false },
      ],
    });
    expect(result.customLinks).toHaveLength(2);
    expect(result.customLinks[0]).toMatchObject({
      label: "IG",
      url: "https://instagram.com/x",
      isActive: true,
    });
    expect(result.customLinks[1]).toMatchObject({
      label: "Site",
      isActive: false,
    });
  });

  it("falls back to the URL as label when label is missing", () => {
    const result = parseBioPageSettings({
      customLinks: [{ url: "https://x.com" }],
    });
    expect(result.customLinks[0].label).toBe("https://x.com/");
    expect(result.customLinks[0].id).toBe("link-0");
    expect(result.customLinks[0].isActive).toBe(true);
  });

  it("caps the number of links", () => {
    const many = Array.from({ length: MAX_LINKS + 5 }, (_, i) => ({
      url: `https://x${i}.com`,
    }));
    expect(
      parseBioPageSettings({ customLinks: many }).customLinks,
    ).toHaveLength(MAX_LINKS);
  });

  it("keeps only known module keys in hidden and dedupes", () => {
    expect(
      parseBioPageSettings({ hidden: ["links", "links", "bogus", "shop"] })
        .hidden,
    ).toEqual(["links", "shop"]);
  });

  it("defaults socials to an empty array", () => {
    expect(parseBioPageSettings({}).socials).toEqual([]);
  });

  it("parses valid socials, sanitizes URLs, and drops unknown platforms", () => {
    const result = parseBioPageSettings({
      socials: [
        { platform: "instagram", url: "instagram.com/jane" },
        { platform: "email", url: "mailto:hi@jane.com" },
        { platform: "myspace", url: "https://myspace.com/jane" }, // unknown → drop
        { platform: "tiktok", url: "javascript:alert(1)" }, // unsafe → drop
      ],
    });
    expect(result.socials).toEqual([
      { platform: "instagram", url: "https://instagram.com/jane" },
      { platform: "email", url: "mailto:hi@jane.com" },
    ]);
  });

  it("keeps only the first entry per platform", () => {
    const result = parseBioPageSettings({
      socials: [
        { platform: "x", url: "https://x.com/a" },
        { platform: "x", url: "https://x.com/b" },
      ],
    });
    expect(result.socials).toEqual([{ platform: "x", url: "https://x.com/a" }]);
  });
});

describe("visibleModules / isModuleVisible", () => {
  it("returns all modules in order when nothing is hidden", () => {
    expect(visibleModules(DEFAULT_BIO_PAGE)).toEqual([
      "links",
      "policy",
      "shop",
    ]);
  });

  it("filters hidden modules but preserves order", () => {
    const s = parseBioPageSettings({ hidden: ["policy"] });
    expect(visibleModules(s)).toEqual(["links", "shop"]);
    expect(isModuleVisible(s, "policy")).toBe(false);
    expect(isModuleVisible(s, "links")).toBe(true);
  });
});
