import { z } from "zod";

export const CUSTOM_FIELD_TYPES = [
  "short_text",
  "long_text",
  "number",
  "select",
  "radio",
  "checkbox",
  "date",
] as const;

export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

// Conditional questions (Plus build P3). A field may declare ONE condition on
// an earlier field; when the condition is not met the field is not shown and,
// critically, is not required.
//
// Deliberately a single condition rather than a boolean tree: an artist
// building a booking form is not writing logic, and a tree would need a
// grouping UI, an evaluation order and a cycle story for a case nobody asked
// for. One condition covers "if you picked cover-up, tell me about the
// existing tattoo", which is the actual need.
export const FIELD_CONDITION_OPERATORS = [
  "equals",
  "not_equals",
  "answered",
  "not_answered",
] as const;
export type FieldConditionOperator = (typeof FIELD_CONDITION_OPERATORS)[number];

export type FieldCondition = {
  /** The KEY of the controlling field (not its id: keys are what answers are
   *  submitted under, and what the snapshot preserves). */
  fieldKey: string;
  operator: FieldConditionOperator;
  /** Compared value; ignored by the answered / not_answered operators. */
  value: string | null;
};

export interface CustomFieldDef {
  id: string;
  artist_id: string;
  key: string;
  label: string;
  type: CustomFieldType;
  required: boolean;
  placeholder: string | null;
  help_text: string | null;
  options: string[];
  active: boolean;
  position: number;
  /** Null = always shown (every field before P3). */
  condition: FieldCondition | null;
  deleted_at: string | null;
  created_at: string;
}

export interface CustomAnswerSnapshot {
  key: string;
  label: string;
  type: CustomFieldType;
  value: string | boolean | number;
}

// Key format: lowercase letters, digits, underscores; must start with a letter
const KEY_RE = /^[a-z][a-z0-9_]*$/;

export const fieldConfigSchema = z
  .object({
    key: z
      .string()
      .min(2, "key must be at least 2 characters")
      .max(50, "key must be at most 50 characters")
      .regex(KEY_RE, "key must start with a letter and use only a–z, 0–9, _"),
    label: z
      .string()
      .min(1, "label is required")
      .max(100, "max 100 characters"),
    type: z.enum(CUSTOM_FIELD_TYPES),
    required: z.boolean().default(false),
    placeholder: z.string().max(200).optional(),
    help_text: z.string().max(500).optional(),
    options: z
      .array(z.string().min(1, "option cannot be empty").max(100))
      .default([]),
    // Conditional questions (P3). Nullable so every existing field stays
    // valid without a backfill.
    condition: z
      .object({
        fieldKey: z.string().regex(KEY_RE, "invalid controlling field"),
        operator: z.enum(FIELD_CONDITION_OPERATORS),
        value: z.string().max(200).nullable().optional(),
      })
      .nullable()
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (
      (data.type === "select" || data.type === "radio") &&
      data.options.length < 2
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${data.type} fields require at least 2 options`,
        path: ["options"],
      });
    }
    if (data.condition) {
      // A field cannot depend on itself: that is unsatisfiable, and it is an
      // easy slip when duplicating a field in the editor.
      if (data.condition.fieldKey === data.key) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "A question cannot depend on itself",
          path: ["condition", "fieldKey"],
        });
      }
      const needsValue =
        data.condition.operator === "equals" ||
        data.condition.operator === "not_equals";
      if (needsValue && !data.condition.value) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Choose the answer this question depends on",
          path: ["condition", "value"],
        });
      }
    }
  });

export type FieldConfigInput = z.infer<typeof fieldConfigSchema>;

/** Parse an untrusted stored condition. Unknown shapes become null (always
 *  shown), never an error: a malformed condition must not hide a field or
 *  break a public booking form. */
export function parseFieldCondition(raw: unknown): FieldCondition | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const fieldKey = typeof o.fieldKey === "string" ? o.fieldKey.trim() : "";
  if (!fieldKey || !KEY_RE.test(fieldKey)) return null;
  const operator = o.operator;
  if (
    typeof operator !== "string" ||
    !(FIELD_CONDITION_OPERATORS as readonly string[]).includes(operator)
  ) {
    return null;
  }
  const needsValue = operator === "equals" || operator === "not_equals";
  const value = typeof o.value === "string" ? o.value.slice(0, 200) : null;
  if (needsValue && (value === null || value === "")) return null;
  return {
    fieldKey,
    operator: operator as FieldConditionOperator,
    value: needsValue ? value : null,
  };
}

/**
 * Normalize a raw DB row into a CustomFieldDef, parsing the stored condition.
 *
 * Every read path must go through this: the column is jsonb, so an unparsed
 * row would carry an arbitrary object where a FieldCondition is expected, and
 * `isFieldVisible` would then evaluate against a shape it never validated.
 */
export function normalizeFieldRow(
  row: Record<string, unknown>,
): CustomFieldDef {
  return {
    ...(row as unknown as CustomFieldDef),
    condition: parseFieldCondition(row.condition),
  };
}

/** Normalize a submitted answer for comparison. Checkbox answers arrive as
 *  "on"/"true", so `answered` on an UNTICKED checkbox must be false rather
 *  than "the string 'false' is present". */
function answerIsPresent(raw: string | undefined, type?: CustomFieldType) {
  if (raw === undefined || raw === null || raw === "") return false;
  if (type === "checkbox") return raw === "on" || raw === "true";
  return true;
}

/**
 * Whether a field is visible given the current answers.
 *
 * FAIL-OPEN by design: a condition pointing at a missing, inactive or later
 * field resolves to VISIBLE. Hiding a field on a malformed condition would
 * silently drop a question the artist believes they are asking, and a hidden
 * question cannot be answered; showing an extra one is recoverable.
 */
export function isFieldVisible(
  field: CustomFieldDef,
  answers: Record<string, string>,
  allFields: CustomFieldDef[],
): boolean {
  const cond = field.condition;
  if (!cond) return true;

  const controller = allFields.find(
    (f) => f.key === cond.fieldKey && f.active && !f.deleted_at,
  );
  if (!controller) return true; // fail open
  // A field can only depend on one that comes BEFORE it, so evaluation is a
  // single ordered pass and a cycle is impossible by construction.
  if (controller.position >= field.position) return true;

  const raw = answers[cond.fieldKey];
  const present = answerIsPresent(raw, controller.type);

  switch (cond.operator) {
    case "answered":
      return present;
    case "not_answered":
      return !present;
    case "equals":
      return present && raw === cond.value;
    case "not_equals":
      return !present || raw !== cond.value;
  }
}

/**
 * Resolve visibility for a whole field list in ONE ordered pass.
 *
 * Chains matter: with A controlling B and B controlling C, evaluating each
 * field against the raw submitted answers would keep C visible off a stale
 * answer to a B that is itself hidden. Walking in position order and carrying
 * only the answers of fields already resolved visible removes that: a hidden
 * field contributes nothing downstream, on both the client and the server.
 *
 * `effectiveAnswers` is that carried map, and is exactly the set of answers
 * worth storing.
 */
export function resolveFieldVisibility(
  fields: CustomFieldDef[],
  answers: Record<string, string>,
): { visible: Set<string>; effectiveAnswers: Record<string, string> } {
  const ordered = [...fields].sort((a, b) => a.position - b.position);
  const visible = new Set<string>();
  const effectiveAnswers: Record<string, string> = {};
  for (const field of ordered) {
    if (!isFieldVisible(field, effectiveAnswers, fields)) continue;
    visible.add(field.key);
    const raw = answers[field.key];
    if (raw !== undefined) effectiveAnswers[field.key] = raw;
  }
  return { visible, effectiveAnswers };
}

/**
 * One-line artist-facing summary of a condition, for the field lists on both
 * editors. Resolves the controller so the summary states the same fail-open
 * outcome the renderer will actually produce.
 */
export function conditionSummary(
  field: CustomFieldDef,
  allFields: CustomFieldDef[],
): string | null {
  const condition = field.condition;
  if (!condition) return null;
  const controller = allFields.find(
    (f) => f.key === condition.fieldKey && f.active && !f.deleted_at,
  );
  if (!controller) {
    return "Always shown now, because the question it depended on is gone";
  }
  // Same rule the renderer applies: a condition on a question that no longer
  // comes first is inert, and saying "shown when" there would be a lie the
  // artist can only discover from their own live form.
  if (controller.position >= field.position) {
    return "Always shown now, because it no longer comes after the question it depends on";
  }
  const isCheckbox = controller.type === "checkbox";
  const name = `"${controller.label}"`;
  switch (condition.operator) {
    case "answered":
      return isCheckbox
        ? `Shown when ${name} is ticked`
        : `Shown when ${name} is answered`;
    case "not_answered":
      return isCheckbox
        ? `Shown when ${name} is not ticked`
        : `Shown when ${name} is not answered`;
    case "equals":
      return `Shown when ${name} is ${condition.value}`;
    case "not_equals":
      return `Shown when ${name} is not ${condition.value}`;
  }
}

export function labelToKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/^[^a-z]+/, "")
    .slice(0, 50);
}

/** Validate a map of raw custom answers against active field definitions.
 * Returns the snapshot array on success or an error object. */
export function validateCustomAnswers(
  rawValues: Record<string, string>,
  fields: CustomFieldDef[],
):
  | { ok: true; answers: CustomAnswerSnapshot[] }
  | { ok: false; error: string; field: string } {
  const answers: CustomAnswerSnapshot[] = [];
  const knownKeys = new Set(fields.map((f) => f.key));
  const { visible } = resolveFieldVisibility(fields, rawValues);

  // Reject unknown submitted keys
  for (const submittedKey of Object.keys(rawValues)) {
    if (!knownKeys.has(submittedKey)) {
      return {
        ok: false,
        error: `unknown field: ${submittedKey}`,
        field: `cf_${submittedKey}`,
      };
    }
  }

  for (const field of fields) {
    const raw = rawValues[field.key];
    const isEmpty = raw === undefined || raw === null || raw === "";

    // Conditional questions (P3). Visibility is resolved SERVER-SIDE in one
    // ordered pass over the submitted answers, never trusted from the client,
    // and it gates BOTH halves of the contract:
    //
    //   - a hidden field is never required, else a conditional question would
    //     block every submission that legitimately skipped it;
    //   - a hidden field's answer is DISCARDED rather than stored, so a stale
    //     client (or a crafted payload) cannot smuggle an answer to a question
    //     the client was never shown.
    if (!visible.has(field.key)) continue;

    if (field.required && isEmpty) {
      return {
        ok: false,
        error: `${field.label} is required`,
        field: `cf_${field.key}`,
      };
    }

    if (isEmpty) continue;

    // Type-specific validation
    let value: string | boolean | number = raw;

    if (field.type === "number") {
      const n = Number(raw);
      if (isNaN(n)) {
        return {
          ok: false,
          error: `${field.label} must be a number`,
          field: `cf_${field.key}`,
        };
      }
      value = n;
    } else if (field.type === "checkbox") {
      value = raw === "on" || raw === "true";
    } else if (field.type === "select" || field.type === "radio") {
      if (!field.options.includes(raw)) {
        return {
          ok: false,
          error: `invalid value for ${field.label}`,
          field: `cf_${field.key}`,
        };
      }
    }

    answers.push({
      key: field.key,
      label: field.label,
      type: field.type,
      value,
    });
  }

  return { ok: true, answers };
}

export function formatCustomAnswer(answer: CustomAnswerSnapshot): string {
  if (typeof answer.value === "boolean") return answer.value ? "yes" : "no";
  if (answer.type === "date" && typeof answer.value === "string") {
    const d = new Date(answer.value);
    return isNaN(d.getTime())
      ? answer.value
      : d.toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        });
  }
  return String(answer.value);
}
