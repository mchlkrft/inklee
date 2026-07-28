import { describe, it, expect } from "vitest";
import {
  validateCustomAnswers,
  labelToKey,
  formatCustomAnswer,
  fieldConfigSchema,
  parseFieldCondition,
  isFieldVisible,
  resolveFieldVisibility,
  conditionSummary,
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
  condition: null,
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

// --- Conditional questions (P3) ---------------------------------------------
// The contract these pin: a hidden field is not required AND its answer is not
// stored, and any condition that cannot be resolved leaves the field VISIBLE.

const controller = makeField({
  id: "ctrl",
  key: "style",
  label: "Style",
  type: "select",
  options: ["colour", "blackwork"],
  position: 0,
});

const dependent = (condition: CustomFieldDef["condition"], extra = {}) =>
  makeField({
    id: "dep",
    key: "colour_notes",
    label: "Colour notes",
    type: "short_text",
    options: [],
    position: 1,
    condition,
    ...extra,
  });

describe("parseFieldCondition", () => {
  it("returns null for junk", () => {
    expect(parseFieldCondition(null)).toBeNull();
    expect(parseFieldCondition("nope")).toBeNull();
    expect(
      parseFieldCondition({ fieldKey: "9bad", operator: "equals" }),
    ).toBeNull();
    expect(
      parseFieldCondition({ fieldKey: "style", operator: "gt" }),
    ).toBeNull();
  });
  it("rejects equals without a value rather than defaulting one", () => {
    expect(
      parseFieldCondition({ fieldKey: "style", operator: "equals", value: "" }),
    ).toBeNull();
  });
  it("drops the value for value-less operators", () => {
    expect(
      parseFieldCondition({
        fieldKey: "style",
        operator: "answered",
        value: "colour",
      }),
    ).toEqual({ fieldKey: "style", operator: "answered", value: null });
  });
});

describe("isFieldVisible", () => {
  const fields = (c: CustomFieldDef["condition"]) => [controller, dependent(c)];

  it("shows a field with no condition", () => {
    expect(isFieldVisible(dependent(null), {}, fields(null))).toBe(true);
  });

  it("equals matches only the chosen answer", () => {
    const c = {
      fieldKey: "style",
      operator: "equals" as const,
      value: "colour",
    };
    expect(isFieldVisible(dependent(c), { style: "colour" }, fields(c))).toBe(
      true,
    );
    expect(
      isFieldVisible(dependent(c), { style: "blackwork" }, fields(c)),
    ).toBe(false);
    expect(isFieldVisible(dependent(c), {}, fields(c))).toBe(false);
  });

  it("not_equals treats an unanswered controller as not-equal", () => {
    const c = {
      fieldKey: "style",
      operator: "not_equals" as const,
      value: "colour",
    };
    expect(isFieldVisible(dependent(c), {}, fields(c))).toBe(true);
    expect(isFieldVisible(dependent(c), { style: "colour" }, fields(c))).toBe(
      false,
    );
  });

  it("reads an unticked checkbox as not answered", () => {
    const box = makeField({
      id: "ctrl",
      key: "consent",
      label: "Consent",
      type: "checkbox",
      options: [],
      position: 0,
    });
    const c = {
      fieldKey: "consent",
      operator: "answered" as const,
      value: null,
    };
    const all = [box, dependent(c)];
    expect(isFieldVisible(dependent(c), { consent: "on" }, all)).toBe(true);
    expect(isFieldVisible(dependent(c), { consent: "false" }, all)).toBe(false);
  });

  it("fails OPEN when the controller is missing, archived or not earlier", () => {
    const c = { fieldKey: "gone", operator: "equals" as const, value: "x" };
    expect(isFieldVisible(dependent(c), {}, [controller, dependent(c)])).toBe(
      true,
    );

    const archived = { ...controller, active: false };
    const c2 = {
      fieldKey: "style",
      operator: "equals" as const,
      value: "colour",
    };
    expect(isFieldVisible(dependent(c2), {}, [archived, dependent(c2)])).toBe(
      true,
    );

    const later = { ...controller, position: 5 };
    expect(isFieldVisible(dependent(c2), {}, [later, dependent(c2)])).toBe(
      true,
    );
  });
});

describe("validateCustomAnswers with conditions", () => {
  const cond = {
    fieldKey: "style",
    operator: "equals" as const,
    value: "colour",
  };

  it("does not require a hidden field", () => {
    const dep = dependent(cond, { required: true });
    const res = validateCustomAnswers({ style: "blackwork" }, [
      controller,
      dep,
    ]);
    expect(res.ok).toBe(true);
  });

  it("still requires a visible field", () => {
    const dep = dependent(cond, { required: true });
    const res = validateCustomAnswers({ style: "colour" }, [controller, dep]);
    expect(res).toMatchObject({ ok: false, field: "cf_colour_notes" });
  });

  it("discards an answer submitted for a hidden field", () => {
    const dep = dependent(cond);
    const res = validateCustomAnswers(
      { style: "blackwork", colour_notes: "smuggled" },
      [controller, dep],
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.answers.map((a: CustomAnswerSnapshot) => a.key)).toEqual([
      "style",
    ]);
  });

  it("keeps the answer when the condition is met", () => {
    const dep = dependent(cond);
    const res = validateCustomAnswers(
      { style: "colour", colour_notes: "warm reds" },
      [controller, dep],
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.answers.map((a: CustomAnswerSnapshot) => a.key)).toEqual([
      "style",
      "colour_notes",
    ]);
  });
});

describe("fieldConfigSchema conditions", () => {
  const base = {
    key: "colour_notes",
    label: "Colour notes",
    type: "short_text" as const,
    required: false,
    options: [],
  };
  it("rejects a self-dependency", () => {
    const r = fieldConfigSchema.safeParse({
      ...base,
      condition: { fieldKey: "colour_notes", operator: "equals", value: "x" },
    });
    expect(r.success).toBe(false);
  });
  it("rejects equals with no value", () => {
    const r = fieldConfigSchema.safeParse({
      ...base,
      condition: { fieldKey: "style", operator: "equals", value: null },
    });
    expect(r.success).toBe(false);
  });
  it("accepts answered with no value", () => {
    const r = fieldConfigSchema.safeParse({
      ...base,
      condition: { fieldKey: "style", operator: "answered", value: null },
    });
    expect(r.success).toBe(true);
  });
});

describe("resolveFieldVisibility chains", () => {
  // A -> B -> C. B's answer must not count while B itself is hidden, or a
  // stale answer would keep C on screen and diverge from the server.
  const a = makeField({
    id: "a",
    key: "style",
    label: "Style",
    type: "select",
    options: ["colour", "blackwork"],
    position: 0,
  });
  const b = makeField({
    id: "b",
    key: "shading",
    label: "Shading",
    type: "select",
    options: ["soft", "hard"],
    position: 1,
    condition: { fieldKey: "style", operator: "equals", value: "colour" },
  });
  const c = makeField({
    id: "c",
    key: "shading_notes",
    label: "Shading notes",
    type: "short_text",
    options: [],
    position: 2,
    condition: { fieldKey: "shading", operator: "equals", value: "soft" },
  });
  const all = [a, b, c];

  it("hides C when B is hidden, even with a stale B answer present", () => {
    const { visible } = resolveFieldVisibility(all, {
      style: "blackwork",
      shading: "soft",
    });
    expect(visible.has("shading")).toBe(false);
    expect(visible.has("shading_notes")).toBe(false);
  });

  it("shows the whole chain when each link holds", () => {
    const { visible } = resolveFieldVisibility(all, {
      style: "colour",
      shading: "soft",
    });
    expect(visible.has("shading")).toBe(true);
    expect(visible.has("shading_notes")).toBe(true);
  });

  it("validateCustomAnswers discards the whole hidden chain", () => {
    const res = validateCustomAnswers(
      { style: "blackwork", shading: "soft", shading_notes: "smuggled" },
      all,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.answers.map((x: CustomAnswerSnapshot) => x.key)).toEqual([
      "style",
    ]);
  });
});

describe("conditionSummary", () => {
  const style = makeField({
    id: "a",
    key: "style",
    label: "Style",
    type: "select",
    options: ["colour"],
    position: 0,
  });
  const consent = makeField({
    id: "b",
    key: "consent",
    label: "Consent",
    type: "checkbox",
    options: [],
    position: 0,
  });
  const dep = (condition: CustomFieldDef["condition"], position = 1) =>
    makeField({
      id: "dep",
      key: "notes",
      label: "Notes",
      type: "short_text",
      options: [],
      position,
      condition,
    });

  it("returns null when there is no condition", () => {
    expect(conditionSummary(dep(null), [style])).toBeNull();
  });

  it("names the controller and the answer", () => {
    expect(
      conditionSummary(
        dep({ fieldKey: "style", operator: "equals", value: "colour" }),
        [style],
      ),
    ).toBe('Shown when "Style" is colour');
  });

  it("says ticked for a checkbox controller", () => {
    expect(
      conditionSummary(
        dep({ fieldKey: "consent", operator: "answered", value: null }),
        [consent],
      ),
    ).toBe('Shown when "Consent" is ticked');
  });

  it("states the fail-open outcome when the controller is gone", () => {
    expect(
      conditionSummary(
        dep({ fieldKey: "missing", operator: "equals", value: "x" }),
        [style],
      ),
    ).toBe("Always shown now, because the question it depended on is gone");
  });

  it("states the fail-open outcome after a reorder puts it first", () => {
    const d = dep(
      { fieldKey: "style", operator: "equals", value: "colour" },
      0,
    );
    expect(conditionSummary(d, [{ ...style, position: 1 }, d])).toBe(
      "Always shown now, because it no longer comes after the question it depends on",
    );
  });

  it("contains no em-dash (founder copy rule)", () => {
    const all = [
      conditionSummary(
        dep({ fieldKey: "style", operator: "equals", value: "c" }),
        [style],
      ),
      conditionSummary(
        dep({ fieldKey: "style", operator: "not_equals", value: "c" }),
        [style],
      ),
      conditionSummary(
        dep({ fieldKey: "style", operator: "answered", value: null }),
        [style],
      ),
      conditionSummary(
        dep({ fieldKey: "gone", operator: "answered", value: null }),
        [style],
      ),
    ];
    for (const s of all) expect(s).not.toContain("—");
  });
});

describe("resolveFieldVisibility effectiveAnswers", () => {
  // The public form prunes its captured answers to this map, so a question the
  // client stops showing cannot keep a downstream question alive.
  const a = makeField({
    id: "a",
    key: "style",
    label: "Style",
    type: "select",
    options: ["colour", "blackwork"],
    position: 0,
  });
  const b = makeField({
    id: "b",
    key: "shading",
    label: "Shading",
    type: "select",
    options: ["soft"],
    position: 1,
    condition: { fieldKey: "style", operator: "equals", value: "colour" },
  });

  it("drops the answers of hidden fields", () => {
    const { effectiveAnswers } = resolveFieldVisibility([a, b], {
      style: "blackwork",
      shading: "soft",
    });
    expect(effectiveAnswers).toEqual({ style: "blackwork" });
  });

  it("keeps them while the field is visible", () => {
    const { effectiveAnswers } = resolveFieldVisibility([a, b], {
      style: "colour",
      shading: "soft",
    });
    expect(effectiveAnswers).toEqual({ style: "colour", shading: "soft" });
  });
});
