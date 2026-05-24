# Slice 61 — Auth UI audit + targeted fix pass

**Scope.** Audit the auth-only surfaces and ship visual + copy fixes. No
redesign, no new features. As recorded in `docs/roadmap.md` §3.2.

**Surfaces audited.**

- `src/app/(auth)/login/page.tsx` + `actions.ts`
- `src/app/(auth)/signup/page.tsx` + `actions.ts`
- `src/app/(auth)/forgot-password/page.tsx` + `actions.ts`
- `src/app/(auth)/reset-password/page.tsx` + `actions.ts`
- `src/app/(auth)/layout.tsx`
- `src/app/auth/mfa/page.tsx` (challenge)
- `src/app/(artist)/settings/account/two-factor-section.tsx` (enrol)

---

## Findings

| #   | Finding                                                                                                                                                                                                                                                                                                                                                      | Severity | Decision                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | -------------------------------------- |
| A1  | Login does not surface URL `?error=` query params. `/auth/callback` and `/auth/confirm` redirect failed sign-ins to `/login?error=auth-failed`, `?error=invalid-link`, `?error=link-expired` — none of these render anything on the login page. **Standout issue:** users clicking an expired confirmation link silently land on /login with no explanation. | High     | Fix                                    |
| A5  | Signup success state ("Check your email") is plain text with no email shown back, no spam-folder note, no escape hatch if the address was wrong.                                                                                                                                                                                                             | Medium   | Fix                                    |
| A8  | Forgot-password page heading reads "Reset password" — confusing since this is only the email step; the actual password reset happens on `/reset-password`.                                                                                                                                                                                                   | Medium   | Fix                                    |
| A9  | Forgot-password page has no body copy explaining what happens after submit.                                                                                                                                                                                                                                                                                  | Medium   | Fix                                    |
| A10 | Reset-password page has no descriptive text — only the bare heading "Set new password".                                                                                                                                                                                                                                                                      | Medium   | Fix                                    |
| A16 | All auth error messages are lowercased ("invalid email or password", "passwords don't match"). Rest of the app uses sentence-case, post the 2026-05-21 microcopy pass.                                                                                                                                                                                       | Low      | Fix                                    |
| A17 | No show/hide password toggle on any password field (login, signup, reset). Standard UX expectation, especially on mobile where typos are common.                                                                                                                                                                                                             | Medium   | Fix                                    |
| A12 | `/auth/mfa` re-implements the auth shell (logo + centered card) instead of being inside the `(auth)` route group.                                                                                                                                                                                                                                            | Low      | Skip — works fine; pure refactor cost. |
| A13 | TwoFactorSection recovery-codes grid is functional but utilitarian (plain monospace text).                                                                                                                                                                                                                                                                   | Low      | Skip — works correctly.                |
| A15 | After disabling 2FA, the "done" state is shown, but re-clicking "Re-enable" goes back to idle without resetting the disable-flow internal state.                                                                                                                                                                                                             | Trivial  | Skip — no observable bug.              |
| A20 | No CapsLock warning on password fields.                                                                                                                                                                                                                                                                                                                      | Trivial  | Skip — adds JS, niche.                 |

---

## What shipped

- **A1.** `src/lib/auth-error.ts` maps `?error=auth-failed | invalid-link | link-expired` to friendly copy. Login page reads `window.location.search` on mount and renders the message as a banner above the form. The action error supersedes the URL error once the user has tried to submit.
- **A5.** Signup "Check your email" success view now renders a mustard mail icon, shows the email the link was sent to, a spam-folder hint, and a "Use a different email" button that returns to the form.
- **A8/A9.** Forgot-password heading renamed to "Forgot password?" with a one-sentence body explaining the email-link step. The back-to-sign-in link stays.
- **A10.** Reset-password gets a sentence above the form: "Enter a new password for your account. You'll be signed in afterwards."
- **A16.** Auth action error strings (login + signup + forgot + reset) updated to sentence case with terminal punctuation, matching the rest of the app.
- **A17.** New `src/components/password-input.tsx` — controlled show/hide toggle (lucide `Eye` / `EyeOff`) on all password fields across login, signup, and reset.

---

## Out of scope (left as-is)

- MFA enrol/challenge flows function correctly and were not redesigned.
- "Resend confirmation email" — a feature addition, not a fix. Track separately if it comes up in Phase D.
- Password strength meter beyond the existing "Minimum 8 characters" hint — feature addition.
