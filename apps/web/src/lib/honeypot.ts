/**
 * Public-form honeypot: a single shared field name + the bot-detection rule.
 *
 * The field name avoids common autofill targets ("website", "email", "phone",
 * "address", etc.) so browser password managers and address autofill don't
 * write into it and trigger false positives. We also tighten the server-side
 * check: an empty value is fine, but so is a short, non-URL-shaped value —
 * only obvious bot fills (URLs, very long strings) trip the trap.
 */
export const HONEYPOT_FIELD = "inklee_hp_check";

const BOT_PATTERNS = [/https?:\/\//i, /www\./i, /\.com|\.net|\.org|\.ru|\.cn/i];

export function isHoneypotTriggered(value: FormDataEntryValue | null): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.length > 80) return true;
  return BOT_PATTERNS.some((pattern) => pattern.test(trimmed));
}
