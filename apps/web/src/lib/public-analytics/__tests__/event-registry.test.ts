import { describe, expect, it } from "vitest";
import {
  PUBLIC_EVENTS,
  PUBLIC_EVENT_NAMES,
  isClientEmittable,
  isConversionEvent,
  validatePublicEvent,
} from "../event-registry";

/** A valid sample value for every declared property of an event. */
function validPropsFor(
  name: keyof typeof PUBLIC_EVENTS,
): Record<string, string> {
  const props: Record<string, string> = {};
  const properties = PUBLIC_EVENTS[name].properties as Record<
    string,
    readonly string[] | "*"
  >;
  for (const [key, allowed] of Object.entries(properties)) {
    props[key] = allowed === "*" ? "sample" : allowed[0];
  }
  return props;
}

describe("isClientEmittable", () => {
  it("blocks server-truth conversions from client submission", () => {
    expect(isClientEmittable("artist_signup_completed")).toBe(false);
    expect(isClientEmittable("booking_request_completed")).toBe(false);
    expect(isClientEmittable("beta_invite_requested")).toBe(false);
  });

  it("allows client-observed events", () => {
    expect(isClientEmittable("pageview")).toBe(true);
    expect(isClientEmittable("booking_page_viewed")).toBe(true);
    expect(isClientEmittable("booking_request_started")).toBe(true);
    expect(isClientEmittable("artist_signup_started")).toBe(true);
  });

  it("marks exactly the server-truth conversions non-client-emittable", () => {
    for (const name of PUBLIC_EVENT_NAMES) {
      const isServerConversion =
        PUBLIC_EVENTS[name].isConversion &&
        !PUBLIC_EVENTS[name].clientEmittable;
      // Every conversion is server-recorded and thus not client-emittable.
      if (PUBLIC_EVENTS[name].isConversion) {
        expect(
          isServerConversion,
          `${name} conversion should be server-only`,
        ).toBe(true);
      }
    }
  });
});

describe("validatePublicEvent", () => {
  it("accepts every catalogued event with valid props", () => {
    for (const name of PUBLIC_EVENT_NAMES) {
      const result = validatePublicEvent(name, validPropsFor(name));
      expect(result, `event ${name} should validate`).not.toBeNull();
      expect(result?.event).toBe(name);
    }
  });

  it("rejects prototype-chain prop keys cleanly (no throw)", () => {
    // A payload prop key like "constructor" or "__proto__" must return null,
    // not resolve an inherited value and crash on allowed.includes().
    expect(validatePublicEvent("pageview", { constructor: "x" })).toBeNull();
    expect(validatePublicEvent("pageview", { toString: "x" })).toBeNull();
    expect(
      validatePublicEvent("pageview", JSON.parse('{"__proto__":"x"}')),
    ).toBeNull();
  });

  it("accepts events with props omitted entirely", () => {
    expect(validatePublicEvent("pageview", undefined)).toEqual({
      event: "pageview",
      props: {},
    });
    expect(validatePublicEvent("pageview", null)).toEqual({
      event: "pageview",
      props: {},
    });
  });

  it("returns the cleaned enum props", () => {
    expect(
      validatePublicEvent("artist_signup_started", { method: "email" }),
    ).toEqual({
      event: "artist_signup_started",
      props: { method: "email" },
    });
    expect(
      validatePublicEvent("artist_signup_completed", { method: "google" }),
    ).toEqual({
      event: "artist_signup_completed",
      props: { method: "google" },
    });
  });

  it("rejects unknown event names", () => {
    expect(validatePublicEvent("made_up_event", {})).toBeNull();
    expect(validatePublicEvent("", {})).toBeNull();
    expect(validatePublicEvent("PAGEVIEW", {})).toBeNull();
  });

  it("rejects prototype-chain names (hasOwnProperty guard)", () => {
    expect(validatePublicEvent("toString", {})).toBeNull();
    expect(validatePublicEvent("hasOwnProperty", {})).toBeNull();
    expect(validatePublicEvent("constructor", {})).toBeNull();
  });

  it("rejects props that are not allowlisted for the event", () => {
    expect(validatePublicEvent("pageview", { smuggled: "value" })).toBeNull();
    expect(
      validatePublicEvent("artist_signup_started", {
        method: "email",
        extra: "nope",
      }),
    ).toBeNull();
  });

  it("rejects values outside a property's enum", () => {
    expect(
      validatePublicEvent("artist_signup_started", {
        method: "carrier-pigeon",
      }),
    ).toBeNull();
    expect(
      validatePublicEvent("artist_signup_completed", { method: "EMAIL" }),
    ).toBeNull();
  });

  it("rejects oversized prop values", () => {
    expect(
      validatePublicEvent("artist_signup_started", { method: "x".repeat(81) }),
    ).toBeNull();
  });

  it("rejects empty and non-string prop values", () => {
    expect(
      validatePublicEvent("artist_signup_started", { method: "" }),
    ).toBeNull();
    expect(
      validatePublicEvent("artist_signup_started", { method: 42 }),
    ).toBeNull();
    expect(
      validatePublicEvent("artist_signup_started", { method: ["email"] }),
    ).toBeNull();
  });

  it("rejects arrays and non-object props", () => {
    expect(validatePublicEvent("pageview", [])).toBeNull();
    expect(validatePublicEvent("pageview", ["a"])).toBeNull();
    expect(validatePublicEvent("pageview", "props")).toBeNull();
    expect(validatePublicEvent("pageview", 42)).toBeNull();
    expect(validatePublicEvent("pageview", true)).toBeNull();
  });
});

describe("isConversionEvent", () => {
  it("matches the registry flag for every event", () => {
    for (const name of PUBLIC_EVENT_NAMES) {
      expect(isConversionEvent(name)).toBe(PUBLIC_EVENTS[name].isConversion);
    }
  });

  it("flags exactly the three conversion moments", () => {
    const conversions = PUBLIC_EVENT_NAMES.filter((name) =>
      isConversionEvent(name),
    );
    expect(conversions.sort()).toEqual([
      "artist_signup_completed",
      "beta_invite_requested",
      "booking_request_completed",
    ]);
  });

  it("does not flag plain acquisition events", () => {
    expect(isConversionEvent("pageview")).toBe(false);
    expect(isConversionEvent("booking_page_viewed")).toBe(false);
    expect(isConversionEvent("artist_signup_started")).toBe(false);
  });
});
