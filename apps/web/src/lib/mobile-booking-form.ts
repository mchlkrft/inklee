// Input shaping for the mobile booking-form mutation routes
// (/api/mobile/booking-form/*). Mirrors how the web form actions build their
// raw object from FormData before fieldConfigSchema validation (trim strings,
// empty optional -> undefined, drop non-string / empty options) so the shared
// zod schema sees identical input from both clients.

import { labelToKey } from "@/lib/custom-fields";

// Path params land in uuid-typed .eq() filters; a non-UUID would surface a raw
// Postgres 22P02 as a 500. Guard first and 404 instead.
export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Map a zod issue from fieldConfigSchema to mobile-facing copy. The key is
 *  derived server-side from the label (the app never shows a key field), so
 *  key-path issues must talk about the label instead. */
export function fieldErrorMessage(issue: {
  path: PropertyKey[];
  message: string;
}): string {
  return issue.path[0] === "key"
    ? "Label must start with a letter and be at least 2 characters."
    : issue.message;
}

/** Shape a JSON body into the raw object fieldConfigSchema validates. An
 *  omitted/empty key derives from the label exactly like the web form's hidden
 *  key input does (labelToKey runs before zod there too), so the app never
 *  bundles the derivation. */
export function normalizeFieldInput(body: unknown): Record<string, unknown> {
  const b = (body ?? {}) as Record<string, unknown>;
  const key = typeof b.key === "string" ? b.key.trim() : "";
  const label = typeof b.label === "string" ? b.label.trim() : "";
  return {
    key: key || labelToKey(label),
    label,
    type: b.type,
    required: b.required === true,
    placeholder:
      typeof b.placeholder === "string"
        ? b.placeholder.trim() || undefined
        : undefined,
    help_text:
      typeof b.help_text === "string"
        ? b.help_text.trim() || undefined
        : undefined,
    options: Array.isArray(b.options)
      ? b.options.filter(
          (o): o is string => typeof o === "string" && o.trim() !== "",
        )
      : [],
  };
}

// Bounds for the field_order write — the web action writes verbatim with no
// runtime validation (TS-only server-action boundary); the JSON route needs a
// minimum so a hostile client can't scramble the public form's render order
// with garbage. Generous: 8 standard ids + a realistic custom-field ceiling.
export const FIELD_ORDER_MAX_LENGTH = 200;
export const FIELD_ORDER_KEY_MAX = 64;

/** Validate a field_order payload: a bounded array of non-empty short strings. */
export function normalizeFieldOrder(
  value: unknown,
): { ok: true; order: string[] } | { ok: false; error: string } {
  if (!Array.isArray(value) || value.length > FIELD_ORDER_MAX_LENGTH) {
    return { ok: false, error: "Invalid field order." };
  }
  for (const key of value) {
    if (
      typeof key !== "string" ||
      key.trim() === "" ||
      key.length > FIELD_ORDER_KEY_MAX
    ) {
      return { ok: false, error: "Invalid field order." };
    }
  }
  return { ok: true, order: value as string[] };
}
