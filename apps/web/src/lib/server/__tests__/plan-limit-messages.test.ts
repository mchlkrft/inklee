import { describe, it, expect } from "vitest";
import { MOBILE_PLAN_LIMIT_MESSAGES } from "@/lib/server/plan-limit-messages";

// The no-steering invariant (P0 review 2026-07-28). Installed app builds
// render these server strings verbatim (no OTA), so purchase steering must be
// impossible AT THE SOURCE, not stripped client-side. If this test fails, a
// copy edit reintroduced steering into a string a /api/mobile/* route serves.

const STEERING = /upgrade|subscribe|purchase|buy|plus feature/i;

describe("mobile plan-limit messages carry no purchase steering", () => {
  it.each(
    Object.entries(MOBILE_PLAN_LIMIT_MESSAGES).map(([key, v]) => [
      key,
      typeof v === "function" ? v(3) : v,
    ]),
  )("%s", (_key, message) => {
    expect(message).not.toMatch(STEERING);
    // Copy rules: sentence case start, terminal punctuation, no em-dashes.
    expect(message).toMatch(/^[A-Z]/);
    expect(message).toMatch(/\.$/);
    expect(message).not.toContain("—");
  });
});
