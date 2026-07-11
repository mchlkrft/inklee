import { describe, expect, it } from "vitest";
import {
  GROWTH_EVENT_NAMES,
  ONBOARDING_STEPS,
  dedupeKeyFor,
  validateGrowthEvent,
  type GrowthEventName,
} from "../event-catalogue";

/** One valid props sample per catalogued event. The Record type forces this
 *  map to grow whenever a new event is added, so the acceptance loop below
 *  always covers the full catalogue. */
const VALID_PROPS: Record<GrowthEventName, Record<string, string>> = {
  onboarding_step_completed: { step: "claim_slug" },
  onboarding_completed: {},
  page_published: {},
  booking_link_copied: { surface: "dashboard" },
};

const LINK_COPY_SURFACES = [
  "onboarding_done",
  "dashboard",
  "link_hub",
  "mobile_app",
] as const;

describe("validateGrowthEvent", () => {
  it("accepts every catalogued event with valid props", () => {
    for (const name of GROWTH_EVENT_NAMES) {
      const result = validateGrowthEvent(name, VALID_PROPS[name]);
      expect(result, `expected ${name} to validate`).not.toBeNull();
      expect(result!.event).toBe(name);
      expect(result!.props).toEqual(VALID_PROPS[name]);
    }
  });

  it("accepts every onboarding step", () => {
    for (const step of ONBOARDING_STEPS) {
      const result = validateGrowthEvent("onboarding_step_completed", { step });
      expect(result, `expected step ${step} to validate`).not.toBeNull();
      expect(result!.props).toEqual({ step });
    }
  });

  it("accepts every link copy surface", () => {
    for (const surface of LINK_COPY_SURFACES) {
      const result = validateGrowthEvent("booking_link_copied", { surface });
      expect(result, `expected surface ${surface} to validate`).not.toBeNull();
    }
  });

  it("treats missing props as an empty object for prop-less events", () => {
    expect(validateGrowthEvent("page_published", undefined)).toEqual({
      event: "page_published",
      props: {},
    });
    expect(validateGrowthEvent("onboarding_completed", null)).toEqual({
      event: "onboarding_completed",
      props: {},
    });
  });

  it("rejects unknown event names", () => {
    expect(validateGrowthEvent("made_up_event", {})).toBeNull();
    expect(validateGrowthEvent("", {})).toBeNull();
    expect(validateGrowthEvent("ONBOARDING_COMPLETED", {})).toBeNull();
  });

  it("rejects extra props (strict schemas)", () => {
    expect(
      validateGrowthEvent("onboarding_completed", { extra: "x" }),
    ).toBeNull();
    expect(validateGrowthEvent("page_published", { anything: 1 })).toBeNull();
    expect(
      validateGrowthEvent("onboarding_step_completed", {
        step: "form",
        extra: "x",
      }),
    ).toBeNull();
    expect(
      validateGrowthEvent("booking_link_copied", {
        surface: "dashboard",
        email: "leak@example.com",
      }),
    ).toBeNull();
  });

  it("rejects bad enum values and missing required props", () => {
    expect(
      validateGrowthEvent("onboarding_step_completed", { step: "not_a_step" }),
    ).toBeNull();
    expect(validateGrowthEvent("onboarding_step_completed", {})).toBeNull();
    expect(
      validateGrowthEvent("booking_link_copied", { surface: "twitter" }),
    ).toBeNull();
    expect(validateGrowthEvent("booking_link_copied", {})).toBeNull();
  });

  it("rejects non-object props for events that require props", () => {
    expect(
      validateGrowthEvent("onboarding_step_completed", "claim_slug"),
    ).toBeNull();
    expect(validateGrowthEvent("booking_link_copied", 42)).toBeNull();
  });
});

describe("dedupeKeyFor", () => {
  it("includes the step in the onboarding step key", () => {
    expect(
      dedupeKeyFor("onboarding_step_completed", "artist-1", { step: "form" }),
    ).toBe("artist-1:form");
    expect(
      dedupeKeyFor("onboarding_step_completed", "artist-1", {
        step: "booking",
      }),
    ).toBe("artist-1:booking");
  });

  it("uses the artist id alone for milestone events", () => {
    expect(dedupeKeyFor("onboarding_completed", "artist-1", {})).toBe(
      "artist-1",
    );
    expect(dedupeKeyFor("page_published", "artist-1", {})).toBe("artist-1");
  });

  it("returns null for the repeatable link copy event", () => {
    expect(
      dedupeKeyFor("booking_link_copied", "artist-1", { surface: "dashboard" }),
    ).toBeNull();
  });
});
