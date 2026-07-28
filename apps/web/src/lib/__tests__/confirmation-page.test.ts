import { describe, it, expect } from "vitest";
import {
  parseConfirmationPage,
  hasCustomConfirmation,
  DEFAULT_CONFIRMATION_PAGE,
  CONFIRMATION_HEADLINE_MAX,
  CONFIRMATION_MESSAGE_MAX,
} from "@inklee/shared/confirmation-page";

describe("parseConfirmationPage", () => {
  it("returns the default for junk", () => {
    expect(parseConfirmationPage(undefined)).toEqual(DEFAULT_CONFIRMATION_PAGE);
    expect(parseConfirmationPage("nope")).toEqual(DEFAULT_CONFIRMATION_PAGE);
    expect(parseConfirmationPage(42)).toEqual(DEFAULT_CONFIRMATION_PAGE);
  });

  it("treats blank strings as unset", () => {
    const r = parseConfirmationPage({ headline: "   ", message: "" });
    expect(r.headline).toBeNull();
    expect(r.message).toBeNull();
  });

  it("keeps the artist's wording", () => {
    const r = parseConfirmationPage({
      headline: "  You're in  ",
      message: "I answer on Mondays.",
    });
    expect(r.headline).toBe("You're in");
    expect(r.message).toBe("I answer on Mondays.");
  });

  it("truncates rather than rejecting", () => {
    const r = parseConfirmationPage({
      headline: "x".repeat(500),
      message: "y".repeat(5000),
    });
    expect(r.headline).toHaveLength(CONFIRMATION_HEADLINE_MAX);
    expect(r.message).toHaveLength(CONFIRMATION_MESSAGE_MAX);
  });

  // This page is reached by a stranger seconds after they submitted a form, so
  // a stored scheme that is not http(s) must never render as a link.
  it("drops a non-http link", () => {
    for (const bad of [
      "javascript:alert(1)",
      "data:text/html,<script>",
      "//evil.example",
      "ftp://x.example",
    ]) {
      const r = parseConfirmationPage({ linkUrl: bad, linkLabel: "Click" });
      expect(r.linkUrl, bad).toBeNull();
      expect(r.linkLabel, bad).toBeNull();
    }
  });

  it("keeps an https link and defaults its label", () => {
    const r = parseConfirmationPage({ linkUrl: "https://x.example/aftercare" });
    expect(r.linkUrl).toBe("https://x.example/aftercare");
    expect(r.linkLabel).toBe("Learn more");
  });

  it("drops a label with no link, so a half-set pair never renders", () => {
    const r = parseConfirmationPage({ linkLabel: "Click me" });
    expect(r.linkLabel).toBeNull();
    expect(r.linkUrl).toBeNull();
  });
});

describe("hasCustomConfirmation", () => {
  it("is false for the default", () => {
    expect(hasCustomConfirmation(DEFAULT_CONFIRMATION_PAGE)).toBe(false);
  });
  it("is true when any one field is set", () => {
    expect(
      hasCustomConfirmation(parseConfirmationPage({ headline: "Hi" })),
    ).toBe(true);
    expect(
      hasCustomConfirmation(parseConfirmationPage({ message: "Hi" })),
    ).toBe(true);
    expect(
      hasCustomConfirmation(
        parseConfirmationPage({ linkUrl: "https://x.example" }),
      ),
    ).toBe(true);
  });
  it("stays false when only an unusable link was stored", () => {
    expect(
      hasCustomConfirmation(parseConfirmationPage({ linkUrl: "javascript:1" })),
    ).toBe(false);
  });
});
