// Maps the `?error=` codes the auth callback/confirm routes redirect with
// into human-readable messages. Centralised so /login can render the right
// copy and we never silently drop a redirected error on the floor.

// Copy points at the in-page affordances on /login (the Sign up link and the
// Forgot password link). Earlier versions promised a "request a new link"
// action that doesn't exist — Slice 61 explicitly punted resend-confirmation.
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  "auth-failed":
    "We couldn’t finish signing you in. Please try again, or sign up below if you don’t have an account yet.",
  "invalid-link":
    "That confirmation link wasn’t valid. Sign up again below to get a fresh link, or use Forgot password if you were resetting yours.",
  "link-expired":
    "That link has expired. Sign up again below to get a fresh link, or use Forgot password if you were resetting yours.",
};

export function authErrorMessage(
  code: string | null | undefined,
): string | null {
  if (!code) return null;
  return AUTH_ERROR_MESSAGES[code] ?? null;
}
