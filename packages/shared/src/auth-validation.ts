// Single source for the password policy used by every password entry point: the
// web signup / reset-password / change-password Server Actions and the mobile
// sign-up / reset-password screens. The min length was hardcoded in 5+ places.
// Pure + Intl-free. (ME-10 D24)
//
// The policy applies to NEW passwords only — sign-in never runs it, so accounts
// created under the old rules keep working until they next change their
// password. Supabase mirrors these rules server-side (password_min_length +
// password_required_characters, set 2026-07-04), which also covers app builds
// that predate a rule change.

export const PASSWORD_MIN_LENGTH = 8;

/** One human-readable summary of the full rule set, for the helper text under
 *  password fields on both surfaces. Keep in sync with validatePassword. */
export const PASSWORD_RULES_HINT = `At least ${PASSWORD_MIN_LENGTH} characters, with an uppercase letter, a lowercase letter, and a number.`;

/**
 * Validate a new password. Returns a ready-to-show error string, or null when
 * valid. `label` lets the change-password surface say "New password" while
 * signup/reset say "Password"; the rule itself is single-sourced.
 */
export function validatePassword(
  password: string,
  opts: { label?: string } = {},
): string | null {
  const label = opts.label ?? "Password";
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `${label} must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (!/[a-z]/.test(password)) {
    return `${label} must include a lowercase letter.`;
  }
  if (!/[A-Z]/.test(password)) {
    return `${label} must include an uppercase letter.`;
  }
  if (!/[0-9]/.test(password)) {
    return `${label} must include a number.`;
  }
  return null;
}
