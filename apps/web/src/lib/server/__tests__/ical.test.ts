import { describe, it, expect } from "vitest";
import { readIcalToken, icalFeedUrl } from "../ical";

describe("readIcalToken", () => {
  it("returns the stored token or null", () => {
    expect(readIcalToken({ ical_token: "abc" })).toBe("abc");
    expect(readIcalToken({})).toBe(null);
    expect(readIcalToken(null)).toBe(null);
    expect(readIcalToken({ ical_token: 123 })).toBe(null);
  });
});

describe("icalFeedUrl", () => {
  it("builds the capability URL for a token, null otherwise", () => {
    expect(icalFeedUrl(null)).toBe(null);
    const url = icalFeedUrl("tok123");
    expect(url).toContain("/api/ical/tok123");
  });
});
