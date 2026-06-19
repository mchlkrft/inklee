// Single source for the password policy used by every password entry point: the
// web signup / reset-password / change-password Server Actions and the mobile
// sign-up / reset-password screens. The min length was hardcoded in 5+ places.
// Pure + Intl-free. (ME-10 D24)

export const PASSWORD_MIN_LENGTH = 8;

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
  return null;
}
