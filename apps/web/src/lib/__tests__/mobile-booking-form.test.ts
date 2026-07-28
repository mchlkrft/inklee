import { describe, it, expect } from "vitest";
import { normalizeFieldInput } from "../mobile-booking-form";

// The absent-vs-null distinction is the whole reason this shaping exists for
// conditions: a build shipped before P3 never sends the key and never renders
// a condition, so it must not be able to clear one.
describe("normalizeFieldInput conditions", () => {
  const base = { label: "Colour notes", type: "short_text", required: false };

  it("omits condition entirely when the client did not send the key", () => {
    const out = normalizeFieldInput(base);
    expect("condition" in out).toBe(false);
  });

  it("keeps an explicit null, which clears the stored condition", () => {
    const out = normalizeFieldInput({ ...base, condition: null });
    expect("condition" in out).toBe(true);
    expect(out.condition).toBeNull();
  });

  it("parses a valid condition", () => {
    const out = normalizeFieldInput({
      ...base,
      condition: { fieldKey: "style", operator: "equals", value: "colour" },
    });
    expect(out.condition).toEqual({
      fieldKey: "style",
      operator: "equals",
      value: "colour",
    });
  });

  it("turns a malformed condition into null, never into a hidden question", () => {
    const out = normalizeFieldInput({
      ...base,
      condition: { fieldKey: "style", operator: "matches", value: "colour" },
    });
    expect(out.condition).toBeNull();
  });

  it("derives the key from the label like the web hidden input", () => {
    expect(normalizeFieldInput({ ...base, label: "Skin type" }).key).toBe(
      "skin_type",
    );
  });
});
