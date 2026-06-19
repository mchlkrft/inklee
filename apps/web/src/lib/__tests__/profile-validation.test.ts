import { describe, it, expect } from "vitest";
import {
  normalizeProfileFields,
  normalizeInstagramHandle,
  DISPLAY_NAME_MAX,
  BIO_MAX,
  INSTAGRAM_MAX,
  LOCATION_MAX,
} from "@inklee/shared/profile-validation";
import { sanitizeCoverColor, COVER_COLORS } from "@inklee/shared/cover-colors";

describe("normalizeProfileFields", () => {
  it("trims and normalizes a valid profile", () => {
    const r = normalizeProfileFields({
      displayName: "  Bert Grimm  ",
      bio: "  Traditional  ",
      instagramHandle: "  @bert  ",
      location: " Portland ",
    });
    expect(r).toEqual({
      ok: true,
      value: {
        displayName: "Bert Grimm",
        bio: "Traditional",
        instagramHandle: "bert",
        location: "Portland",
      },
    });
  });

  it("strips ALL leading @ (mobile-canonical, not just one)", () => {
    const r = normalizeProfileFields({
      displayName: "x",
      instagramHandle: "@@@jane",
    });
    expect(r.ok && r.value.instagramHandle).toBe("jane");
  });

  it("collapses empty optional fields to null", () => {
    const r = normalizeProfileFields({
      displayName: "x",
      bio: "  ",
      instagramHandle: "",
      location: "",
    });
    expect(r.ok && r.value).toMatchObject({
      bio: null,
      instagramHandle: null,
      location: null,
    });
  });

  it("requires a display name by default", () => {
    expect(normalizeProfileFields({ displayName: "   " })).toEqual({
      ok: false,
      error: "Display name is required.",
    });
  });

  it("honors a custom required-name error (claim step)", () => {
    expect(
      normalizeProfileFields(
        { displayName: "" },
        { displayNameRequiredError: "Artist name is required." },
      ),
    ).toEqual({ ok: false, error: "Artist name is required." });
  });

  it("skips the required check when requireDisplayName is false (onboarding-profile)", () => {
    const r = normalizeProfileFields(
      { bio: "hi" },
      { requireDisplayName: false },
    );
    expect(r.ok).toBe(true);
    expect(r.ok && r.value.bio).toBe("hi");
  });

  it("enforces the canonical length caps", () => {
    expect(
      normalizeProfileFields({ displayName: "x".repeat(DISPLAY_NAME_MAX + 1) })
        .ok,
    ).toBe(false);
    expect(
      normalizeProfileFields({ displayName: "x", bio: "b".repeat(BIO_MAX + 1) })
        .ok,
    ).toBe(false);
    expect(
      normalizeProfileFields({
        displayName: "x",
        instagramHandle: "i".repeat(INSTAGRAM_MAX + 1),
      }).ok,
    ).toBe(false);
    expect(
      normalizeProfileFields({
        displayName: "x",
        location: "l".repeat(LOCATION_MAX + 1),
      }).ok,
    ).toBe(false);
    // exactly at the cap is accepted
    expect(
      normalizeProfileFields({ displayName: "x".repeat(DISPLAY_NAME_MAX) }).ok,
    ).toBe(true);
  });

  it("counts the handle length AFTER stripping @ (cap is on the stored value)", () => {
    const r = normalizeProfileFields({
      displayName: "x",
      instagramHandle: "@" + "i".repeat(INSTAGRAM_MAX),
    });
    expect(r.ok).toBe(true);
  });
});

describe("normalizeInstagramHandle", () => {
  it("strips all @ and empties to null", () => {
    expect(normalizeInstagramHandle("@@x")).toBe("x");
    expect(normalizeInstagramHandle("   ")).toBe(null);
    expect(normalizeInstagramHandle(123)).toBe(null);
  });
});

describe("sanitizeCoverColor", () => {
  it("accepts brand swatch ids", () => {
    for (const c of COVER_COLORS) expect(sanitizeCoverColor(c.id)).toBe(c.id);
  });
  it("accepts a lowercase #hex and lowercases input", () => {
    expect(sanitizeCoverColor("#ABC")).toBe("#abc");
    expect(sanitizeCoverColor("  MUSTARD ")).toBe("mustard");
  });
  it("rejects unknown values without throwing", () => {
    expect(sanitizeCoverColor("chartreuse")).toBe(null);
    expect(sanitizeCoverColor("")).toBe(null);
    expect(sanitizeCoverColor(null)).toBe(null);
    expect(sanitizeCoverColor("#zzzz")).toBe(null);
  });
  it("exposes the five canonical swatches", () => {
    expect(COVER_COLORS.map((c) => c.id)).toEqual([
      "mustard",
      "rosa",
      "cobalt",
      "red",
      "green",
    ]);
  });
});
