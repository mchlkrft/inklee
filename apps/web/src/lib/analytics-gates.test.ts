import { describe, expect, it } from "vitest";
import {
  attributionFieldName,
  attributionPropsFromForm,
  evaluateSignupCompletion,
  shouldFireBookingLinkCreated,
} from "./analytics-gates";

describe("evaluateSignupCompletion", () => {
  it("fires exactly once on the genuine first completion", () => {
    const gate = evaluateSignupCompletion({ some_key: "kept" }, false);
    expect(gate.completesNow).toBe(true);
    expect(gate.fire).toBe(true);
    expect(gate.nextSettings).toMatchObject({
      some_key: "kept",
      onboarding_completed: true,
      signup_event_fired: true,
    });
  });

  it("does not fire on repeated route access after completion", () => {
    const settings = { onboarding_completed: true, signup_event_fired: true };
    const gate = evaluateSignupCompletion(settings, false);
    expect(gate.completesNow).toBe(false);
    expect(gate.fire).toBe(false);
  });

  it("does not re-fire after an admin onboarding reset", () => {
    // resetOnboardingAction flips onboarding_completed to false but preserves
    // the permanent signup_event_fired flag.
    const afterReset = {
      onboarding_completed: false,
      signup_event_fired: true,
    };
    const gate = evaluateSignupCompletion(afterReset, false);
    expect(gate.completesNow).toBe(true); // the flip write still happens
    expect(gate.fire).toBe(false); // but the event does not
    expect(gate.nextSettings.signup_event_fired).toBe(true);
  });

  it("never fires retroactively for accounts completed before instrumentation", () => {
    const legacy = { onboarding_completed: true }; // no signup_event_fired key
    const gate = evaluateSignupCompletion(legacy, false);
    expect(gate.completesNow).toBe(false);
    expect(gate.fire).toBe(false);
  });

  it("suppresses the event for internal users but still persists the flag", () => {
    const gate = evaluateSignupCompletion({}, true);
    expect(gate.completesNow).toBe(true);
    expect(gate.fire).toBe(false);
    expect(gate.nextSettings.signup_event_fired).toBe(true);
  });

  it("handles null and undefined settings", () => {
    expect(evaluateSignupCompletion(null, false).fire).toBe(true);
    expect(evaluateSignupCompletion(undefined, false).fire).toBe(true);
  });

  it("web/mobile double completion cannot double-fire (second sees the flag)", () => {
    const first = evaluateSignupCompletion({}, false);
    expect(first.fire).toBe(true);
    const second = evaluateSignupCompletion(first.nextSettings, false);
    expect(second.completesNow).toBe(false);
    expect(second.fire).toBe(false);
  });
});

describe("shouldFireBookingLinkCreated", () => {
  it("fires on the first null -> slug transition", () => {
    expect(shouldFireBookingLinkCreated(null, false)).toBe(true);
    expect(shouldFireBookingLinkCreated(undefined, false)).toBe(true);
    expect(shouldFireBookingLinkCreated("", false)).toBe(true);
  });

  it("does not fire when a slug already exists (retry / own re-claim)", () => {
    expect(shouldFireBookingLinkCreated("ouch370", false)).toBe(false);
  });

  it("does not fire for internal users", () => {
    expect(shouldFireBookingLinkCreated(null, true)).toBe(false);
  });
});

describe("attributionPropsFromForm", () => {
  function form(entries: Record<string, unknown>) {
    return { get: (name: string) => entries[name] ?? null };
  }

  it("reads only the expected keys and drops empties", () => {
    const props = attributionPropsFromForm(
      form({
        [attributionFieldName("entry_path")]: "/tattoo-booking-software",
        [attributionFieldName("source")]: "instagram",
        [attributionFieldName("medium")]: "",
        unrelated_field: "ignored",
      }),
    );
    expect(props).toEqual({
      entry_path: "/tattoo-booking-software",
      source: "instagram",
    });
  });

  it("clamps oversized values instead of forwarding them", () => {
    const props = attributionPropsFromForm(
      form({ [attributionFieldName("campaign")]: "x".repeat(1000) }),
    );
    expect(props.campaign).toHaveLength(200);
  });

  it("ignores non-string values", () => {
    const props = attributionPropsFromForm(
      form({ [attributionFieldName("referrer")]: 42 }),
    );
    expect(props).toEqual({});
  });
});
