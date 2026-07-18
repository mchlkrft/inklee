import { describe, expect, it } from "vitest";
import {
  DATE_FLEXIBILITIES,
  GUEST_SPOT_OPEN_STATUSES,
  GUEST_SPOT_REQUEST_STATUSES,
  GUEST_SPOT_REQUEST_STATUS_LABELS,
  GUEST_SPOT_STAY_STATUSES,
  GS_INTRO_MAX,
  GS_SOCIAL_LINK_MAX,
  canTransitionGuestSpotRequest,
  canTransitionStay,
  guestSpotRequestStatusLabel,
  isGuestSpotRequestTerminal,
  isStayTerminal,
  validateGuestSpotRequestInput,
  type GuestSpotRequestInput,
} from "@inklee/shared/guest-spots";

const TODAY = "2026-07-18";

function input(
  over: Partial<GuestSpotRequestInput> = {},
): GuestSpotRequestInput {
  return {
    startDate: "2026-08-01",
    endDate: "2026-08-07",
    dateFlexibility: "exact",
    socialLink: "https://instagram.com/artist",
    introduction: "I tattoo fine line and want to guest for a week.",
    ...over,
  };
}

describe("guest spot request FSM", () => {
  it("covers the streamlined v1 happy path (direct accept)", () => {
    expect(canTransitionGuestSpotRequest("submitted", "accepted").ok).toBe(
      true,
    );
    expect(canTransitionGuestSpotRequest("accepted", "confirmed").ok).toBe(
      true,
    );
    expect(canTransitionGuestSpotRequest("confirmed", "completed").ok).toBe(
      true,
    );
  });

  it("covers the proposal round trip", () => {
    expect(
      canTransitionGuestSpotRequest("submitted", "alternative_dates_proposed")
        .ok,
    ).toBe(true);
    expect(
      canTransitionGuestSpotRequest("alternative_dates_proposed", "accepted")
        .ok,
    ).toBe(true);
    expect(
      canTransitionGuestSpotRequest("artist_reviewing_proposal", "accepted").ok,
    ).toBe(true);
    // Self-loop: the studio revises its own open suggestion.
    expect(
      canTransitionGuestSpotRequest(
        "alternative_dates_proposed",
        "alternative_dates_proposed",
      ).ok,
    ).toBe(true);
  });

  it("lets the studio pass from every reviewable state", () => {
    for (const from of [
      "submitted",
      "under_review",
      "information_requested",
      "alternative_dates_proposed",
      "artist_reviewing_proposal",
    ] as const) {
      expect(canTransitionGuestSpotRequest(from, "declined").ok).toBe(true);
    }
    expect(canTransitionGuestSpotRequest("confirmed", "declined").ok).toBe(
      false,
    );
  });

  it("lets the artist withdraw from every review state, not after", () => {
    for (const from of [
      "submitted",
      "under_review",
      "information_requested",
      "alternative_dates_proposed",
      "artist_reviewing_proposal",
    ] as const) {
      expect(canTransitionGuestSpotRequest(from, "withdrawn").ok).toBe(true);
    }
    expect(canTransitionGuestSpotRequest("confirmed", "withdrawn").ok).toBe(
      false,
    );
    expect(canTransitionGuestSpotRequest("accepted", "withdrawn").ok).toBe(
      false,
    );
  });

  it("keeps terminal states terminal", () => {
    for (const status of [
      "declined",
      "withdrawn",
      "cancelled",
      "completed",
      "no_show",
    ] as const) {
      expect(isGuestSpotRequestTerminal(status)).toBe(true);
      for (const to of GUEST_SPOT_REQUEST_STATUSES) {
        expect(canTransitionGuestSpotRequest(status, to).ok).toBe(false);
      }
    }
  });

  it("rejects unknown source states", () => {
    const res = canTransitionGuestSpotRequest("nonsense", "accepted");
    expect(res.ok).toBe(false);
  });

  it("open statuses are all non-terminal and label-covered", () => {
    for (const s of GUEST_SPOT_OPEN_STATUSES) {
      expect(isGuestSpotRequestTerminal(s)).toBe(false);
    }
    // Lockstep with the one-open-request partial index in migration 0080.
    expect(GUEST_SPOT_OPEN_STATUSES).toContain("awaiting_confirmation");
    for (const s of GUEST_SPOT_REQUEST_STATUSES) {
      expect(GUEST_SPOT_REQUEST_STATUS_LABELS[s]).toBeTruthy();
    }
    // Founder verb rule: declined shows as Passed.
    expect(guestSpotRequestStatusLabel("declined")).toBe("Passed");
    expect(guestSpotRequestStatusLabel("made_up")).toBe("made_up");
  });
});

describe("stay FSM", () => {
  it("walks confirmed -> active -> completed", () => {
    expect(canTransitionStay("confirmed", "active").ok).toBe(true);
    expect(canTransitionStay("active", "completed").ok).toBe(true);
  });

  it("cancels from confirmed and active only", () => {
    expect(canTransitionStay("confirmed", "cancelled").ok).toBe(true);
    expect(canTransitionStay("active", "cancelled").ok).toBe(true);
    expect(canTransitionStay("completed", "cancelled").ok).toBe(false);
  });

  it("keeps terminal stays terminal", () => {
    for (const s of ["completed", "cancelled", "no_show"] as const) {
      expect(isStayTerminal(s)).toBe(true);
      for (const to of GUEST_SPOT_STAY_STATUSES) {
        expect(canTransitionStay(s, to).ok).toBe(false);
      }
    }
  });
});

describe("validateGuestSpotRequestInput", () => {
  it("accepts a complete valid input", () => {
    expect(validateGuestSpotRequestInput(input(), TODAY)).toBeNull();
  });

  it("accepts a single-day request (start === end)", () => {
    expect(
      validateGuestSpotRequestInput(
        input({ startDate: "2026-08-01", endDate: "2026-08-01" }),
        TODAY,
      ),
    ).toBeNull();
  });

  it("rejects malformed and inverted dates", () => {
    expect(
      validateGuestSpotRequestInput(input({ startDate: "01.08.2026" }), TODAY),
    ).toBe("Pick your dates.");
    expect(
      validateGuestSpotRequestInput(
        input({ startDate: "2026-08-07", endDate: "2026-08-01" }),
        TODAY,
      ),
    ).toMatch(/end date/);
  });

  it("rejects past start dates but allows today", () => {
    expect(
      validateGuestSpotRequestInput(
        input({ startDate: "2026-07-17", endDate: "2026-07-19" }),
        TODAY,
      ),
    ).toMatch(/future/);
    expect(
      validateGuestSpotRequestInput(
        input({ startDate: TODAY, endDate: "2026-07-19" }),
        TODAY,
      ),
    ).toBeNull();
  });

  it("rejects unknown flexibility values", () => {
    expect(DATE_FLEXIBILITIES).toContain("exact");
    expect(
      validateGuestSpotRequestInput(
        input({ dateFlexibility: "whenever" }),
        TODAY,
      ),
    ).toMatch(/fixed/);
  });

  it("requires the social link and the introduction", () => {
    expect(
      validateGuestSpotRequestInput(input({ socialLink: "  " }), TODAY),
    ).toMatch(/link/);
    expect(
      validateGuestSpotRequestInput(input({ introduction: "" }), TODAY),
    ).toMatch(/in mind/);
  });

  it("enforces the length caps", () => {
    expect(
      validateGuestSpotRequestInput(
        input({
          socialLink: `https://x.com/${"a".repeat(GS_SOCIAL_LINK_MAX)}`,
        }),
        TODAY,
      ),
    ).toMatch(/too long/);
    expect(
      validateGuestSpotRequestInput(
        input({ introduction: "a".repeat(GS_INTRO_MAX + 1) }),
        TODAY,
      ),
    ).toMatch(/introduction/);
  });
});
