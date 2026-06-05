// Mobile-app launch waitlist — types + validation for the /download form.
// Storage: `mobile_waitlist` table (migration 0034). Service-role writes
// only; no client-side reads. See src/app/download/actions.ts for the
// server action that owns the insert.

export const MOBILE_WAITLIST_SOURCE_DOWNLOAD = "download_page";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export type MobileWaitlistFormResult =
  | { success: true; alreadyOnList: boolean }
  | { error: string };

/** Normalise + validate a submitted email. Returns the normalised value
 *  (trimmed + lowercased) on success, or an error string on failure. */
export function parseMobileWaitlistEmail(
  raw: unknown,
): { email: string } | { error: string } {
  if (typeof raw !== "string") return { error: "Please enter your email." };
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return { error: "Please enter your email." };
  if (trimmed.length > 320) return { error: "That email looks too long." };
  if (!EMAIL_RE.test(trimmed)) {
    return { error: "That email does not look right." };
  }
  return { email: trimmed };
}
