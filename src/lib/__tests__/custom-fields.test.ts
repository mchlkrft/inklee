import { describe, it, expect } from "vitest";
import {
  validateCustomAnswers,
  labelToKey,
  formatCustomAnswer,
  fieldConfigSchema,
} from "../custom-fields";
import type { CustomFieldDef, CustomAnswerSnapshot } from "../custom-fields";

const makeField = (
  overrides: Partial<CustomFieldDef> = {},
): CustomFieldDef => ({
  id: "field-1",
  artist_id: "artist-1",
  key: "skin_type",
  label: "Skin type",
  type: "select",
  required: false,
  placeholder: null,
  help_text: null,
  options: ["fair", "medium", "dark"],
  active: true,
  position: 0,
  deleted_at: null,
  created_at: new Date().toISOString(),
  ...overrides,
});

describe("labelToKey", () => {
  it("converts label to snake_case key", () => {
    expect(labelToKey("Skin Type")).toBe("skin_type");
  });
  it("strips non-alphanumeric characters", () => {
    expect(labelToKey("Budget (€)")).toBe("budget_");
  });
  it("removes leading non-letter characters", () => {
    expect(labelToKey("123 Budget")).toBe("budget");
  });
  it("truncates at 50 characters", () => {
    expect(labelToKey("a".repeat(60))).toHaveLength(50);
  });
});

describe("fieldConfigSchema", () => {
  it("accepts valid field config", () => {
    const result = fieldConfigSchema.safeParse({
      key: "skin_type",
      label: "Skin type",
      type: "select",
      required: false,
      options: ["fair", "medium"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects key starting with a digit", () => {
    const result = fieldConfigSchema.safeParse({
      key: "1_bad",
      label: "Bad",
      type: "short_text",
    });
    expect(result.success).toBe(false);
  });

  it("rejects key with uppercase", () => {
    const result = fieldConfigSchema.safeParse({
      key: "SkinType",
      label: "Skin Type",
      type: "short_text",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty label", () => {
    const result = fieldConfigSchema.safeParse({
      key: "valid_key",
      label: "",
      type: "short_text",
    });
    expect(result.success).toBe(false);
  });
});

describe("validateCustomAnswers", () => {
  it("returns ok for empty answers when no fields are required", () => {
    const fields = [makeField({ required: false })];
    const result = validateCustomAnswers({}, fields);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.answers).toHaveLength(0);
  });

  it("returns error for missing required field", () => {
    const fields = [makeField({ required: true })];
    const result = validateCustomAnswers({}, fields);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe("cf_skin_type");
  });

  it("rejects unknown submitted key", () => {
    const fields = [makeField()];
    const result = validateCustomAnswers({ unknown_key: "value" }, fields);
    expect(result.ok).toBe(false);
  });

  it("rejects invalid select option", () => {
    const fields = [makeField({ required: true })];
    const result = validateCustomAnswers(
      { skin_type: "invalid_option" },
      fields,
    );
    expect(result.ok).toBe(false);
  });

  it("accepts valid select option", () => {
    const fields = [makeField({ required: true })];
    const result = validateCustomAnswers({ skin_type: "fair" }, fields);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.answers[0].value).toBe("fair");
      expect(result.answers[0].key).toBe("skin_type");
      expect(result.answers[0].label).toBe("Skin type");
      expect(result.answers[0].type).toBe("select");
    }
  });

  it("coerces number fields to number type", () => {
    const fields = [
      makeField({
        key: "budget",
        label: "Budget",
        type: "number",
        options: [],
      }),
    ];
    const result = validateCustomAnswers({ budget: "500" }, fields);
    expect(result.ok).toBe(true);
    if (result.ok) expect(typeof result.answers[0].value).toBe("number");
  });

  it("coerces checkbox 'on' to true", () => {
    const fields = [
      makeField({
        key: "consent",
        label: "Consent",
        type: "checkbox",
        options: [],
      }),
    ];
    const result = validateCustomAnswers({ consent: "on" }, fields);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.answers[0].value).toBe(true);
  });

  it("snapshot includes label and type for historical readability", () => {
    const fields = [makeField({ required: true })];
    const result = validateCustomAnswers({ skin_type: "medium" }, fields);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.answers[0]).toMatchObject({
        key: "skin_type",
        label: "Skin type",
        type: "select",
        value: "medium",
      });
    }
  });

  it("snapshot is stable after field definition changes", () => {
    // Once stored, snapshot contains label+type+value, readable without field def
    const snapshot = {
      key: "skin_type",
      label: "Skin type",
      type: "select" as const,
      value: "fair",
    };
    expect(formatCustomAnswer(snapshot)).toBe("fair");
  });
});

describe("fieldConfigSchema — options constraint", () => {
  it("rejects select field with 0 options", () => {
    const result = fieldConfigSchema.safeParse({
      key: "style",
      label: "Style",
      type: "select",
      options: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects select field with 1 option", () => {
    const result = fieldConfigSchema.safeParse({
      key: "style",
      label: "Style",
      type: "select",
      options: ["only one"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects radio field with fewer than 2 options", () => {
    const result = fieldConfigSchema.safeParse({
      key: "style",
      label: "Style",
      type: "radio",
      options: ["one"],
    });
    expect(result.success).toBe(false);
  });

  it("accepts select field with 2+ options", () => {
    const result = fieldConfigSchema.safeParse({
      key: "style",
      label: "Style",
      type: "select",
      options: ["black & grey", "colour"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts short_text with no options", () => {
    const result = fieldConfigSchema.safeParse({
      key: "notes",
      label: "Notes",
      type: "short_text",
      options: [],
    });
    expect(result.success).toBe(true);
  });
});

describe("validateCustomAnswers — hardening", () => {
  it("only validates fields that are active (caller responsibility)", () => {
    // validateCustomAnswers trusts the fields list it receives.
    // The caller (booking action) must pass only active fields.
    // If an inactive field is accidentally passed, it still validates.
    const inactiveField = makeField({ active: false, required: true });
    const result = validateCustomAnswers({}, [inactiveField]);
    // Still enforces required — the guard is in the action layer
    expect(result.ok).toBe(false);
  });

  it("accepts empty submission when field list is empty", () => {
    const result = validateCustomAnswers({}, []);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.answers).toHaveLength(0);
  });

  it("rejects submission with keys not in field list", () => {
    const result = validateCustomAnswers({ injected_key: "bad" }, []);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/unknown field/);
  });

  it("skips optional empty field — no snapshot entry", () => {
    const fields = [makeField({ required: false })];
    const result = validateCustomAnswers({ skin_type: "" }, fields);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.answers).toHaveLength(0);
  });

  it("includes only fields with submitted values in snapshot", () => {
    const fields = [
      makeField({ key: "a", label: "A", required: false }),
      makeField({ key: "b", label: "B", required: false, options: ["x", "y"] }),
    ];
    const result = validateCustomAnswers({ b: "x" }, fields);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.answers).toHaveLength(1);
      expect(result.answers[0].key).toBe("b");
    }
  });

  it("snapshot remains readable if field is later archived", () => {
    // Snapshot captures label and type at submission time.
    // Simulates reading an old snapshot after the field def changes.
    const oldSnapshot: CustomAnswerSnapshot = {
      key: "skin_type",
      label: "Skin type (archived)",
      type: "select",
      value: "fair",
    };
    expect(formatCustomAnswer(oldSnapshot)).toBe("fair");
  });
});

describe("formatCustomAnswer", () => {
  it("formats boolean true as 'yes'", () => {
    expect(
      formatCustomAnswer({
        key: "k",
        label: "L",
        type: "checkbox",
        value: true,
      }),
    ).toBe("yes");
  });
  it("formats boolean false as 'no'", () => {
    expect(
      formatCustomAnswer({
        key: "k",
        label: "L",
        type: "checkbox",
        value: false,
      }),
    ).toBe("no");
  });
  it("formats string value as-is", () => {
    expect(
      formatCustomAnswer({
        key: "k",
        label: "L",
        type: "short_text",
        value: "hello",
      }),
    ).toBe("hello");
  });
  it("formats number as string", () => {
    expect(
      formatCustomAnswer({ key: "k", label: "L", type: "number", value: 42 }),
    ).toBe("42");
  });
});
