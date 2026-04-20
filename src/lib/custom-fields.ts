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

export const fieldConfigSchema = z.object({
  key: z
    .string()
    .min(2, "key must be at least 2 characters")
    .max(50, "key must be at most 50 characters")
    .regex(KEY_RE, "key must start with a letter and use only a–z, 0–9, _"),
  label: z.string().min(1, "label is required").max(100, "max 100 characters"),
  type: z.enum(CUSTOM_FIELD_TYPES),
  required: z.boolean().default(false),
  placeholder: z.string().max(200).optional(),
  help_text: z.string().max(500).optional(),
  options: z
    .array(z.string().min(1, "option cannot be empty").max(100))
    .default([]),
});

export type FieldConfigInput = z.infer<typeof fieldConfigSchema>;

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
