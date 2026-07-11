/**
 * Pure decision logic for the conversion events (Plausible custom events).
 * Kept free of IO so the duplicate-prevention rules are unit-testable.
 *
 * Invariants enforced here:
 * - `signup_completed` fires at most once per account. The permanent
 *   `settings.signup_event_fired` flag is set on the genuine completion
 *   transition and is intentionally NEVER cleared (the admin
 *   resetOnboardingAction only flips `onboarding_completed`, preserving other
 *   keys), so a reset + re-completed onboarding does not re-fire.
 * - Accounts that completed onboarding before this instrumentation existed
 *   never fire retroactively (the completion transition already happened).
 * - Internal traffic (ADMIN_EMAILS admins, `profiles.is_tester` accounts)
 *   never produces conversion events, but the fired flag is still persisted so
 *   un-flagging a tester later cannot retro-fire.
 * - `booking_link_created` fires only on the first null -> slug transition;
 *   re-claiming or re-submitting the same slug is a no-op.
 */

export type ProfileSettings = Record<string, unknown> | null | undefined;

export type SignupCompletionGate = {
  /** This call is the genuine first completion transition (flag was unset). */
  completesNow: boolean;
  /** Send the signup_completed event. */
  fire: boolean;
  /** Settings object to persist when completesNow is true. */
  nextSettings: Record<string, unknown>;
};

export function evaluateSignupCompletion(
  settings: ProfileSettings,
  isInternal: boolean,
): SignupCompletionGate {
  const current = (settings ?? {}) as Record<string, unknown>;
  const alreadyCompleted = current.onboarding_completed === true;
  const alreadyFired = current.signup_event_fired === true;
  const completesNow = !alreadyCompleted;

  return {
    completesNow,
    fire: completesNow && !alreadyFired && !isInternal,
    nextSettings: {
      ...current,
      onboarding_completed: true,
      signup_event_fired: true,
    },
  };
}

/** booking_link_created: only the first successful null -> slug transition. */
export function shouldFireBookingLinkCreated(
  previousSlug: string | null | undefined,
  isInternal: boolean,
): boolean {
  return !previousSlug && !isInternal;
}

/**
 * First-touch marketing attribution, shared between the client capture
 * (localStorage), the hidden form fields on the claim-slug step, and the
 * server-side event senders. Values are paths/hosts/campaign labels only —
 * never personal data.
 */
export const ATTRIBUTION_PROP_KEYS = [
  "entry_path",
  "referrer",
  "source",
  "medium",
  "campaign",
  "content",
  "term",
] as const;

export type AttributionProps = Partial<
  Record<(typeof ATTRIBUTION_PROP_KEYS)[number], string>
>;

/** Hidden-input name for an attribution key (claim-slug form). */
export function attributionFieldName(
  key: (typeof ATTRIBUTION_PROP_KEYS)[number],
): string {
  return `attr_${key}`;
}

const MAX_ATTR_VALUE_LENGTH = 200;

/**
 * Attribution values are arbitrary URL input; besides length-clamping, drop
 * anything that looks like personal data or a full URL (an email address in
 * utm_source, a referrer with a query string). Campaign labels never need
 * "@" or "://".
 */
export function sanitizeAttributionValue(raw: string): string | null {
  const value = raw.trim().slice(0, MAX_ATTR_VALUE_LENGTH);
  if (!value) return null;
  if (value.includes("@") || value.includes("://")) return null;
  return value;
}

/**
 * Read attribution props back out of a submitted form. Only the expected keys
 * are accepted and values are length-clamped and content-filtered, so a
 * tampered form cannot inject arbitrary analytics payloads or personal data.
 */
export function attributionPropsFromForm(formData: {
  get(name: string): unknown;
}): AttributionProps {
  const props: AttributionProps = {};
  for (const key of ATTRIBUTION_PROP_KEYS) {
    const raw = formData.get(attributionFieldName(key));
    if (typeof raw !== "string") continue;
    const value = sanitizeAttributionValue(raw);
    if (value) props[key] = value;
  }
  return props;
}
