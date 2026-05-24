// Maps the `?error=` codes the auth callback/confirm routes redirect with
// into human-readable messages. Centralised so /login can render the right
// copy and we never silently drop a redirected error on the floor.

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  "auth-failed":
    "We couldn’t finish signing you in. Please try again, or sign up if you don’t have an account yet.",
  "invalid-link":
    "That confirmation link wasn’t valid. Sign in below, or request a new link.",
  "link-expired":
    "That link has expired. Sign in below, or request a new confirmation link.",
};

export function authErrorMessage(
  code: string | null | undefined,
): string | null {
  if (!code) return null;
  return AUTH_ERROR_MESSAGES[code] ?? null;
}
