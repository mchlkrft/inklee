/** Tri-state result of checking whether an AAL1 session must complete an
 *  MFA challenge before reaching a gated artist path.
 *
 *  MFA-GATE-001: `getAuthenticatorAssuranceLevel()` can fail two ways — it can
 *  throw, or it can resolve with `{ data: null, error }` — and the proxy used
 *  to treat both the same as "no step-up needed", silently letting an
 *  un-stepped-up AAL1 session reach every artist path with no signal anywhere.
 *  A failed check is a different fact than "this user has no factor
 *  enrolled": the former must fail CLOSED, the latter must not block the
 *  majority of users who never enrolled MFA at all. This type makes the two
 *  outcomes impossible to collapse into each other again. */
export type MfaStepUpResult =
  | "step-up-required"
  | "no-step-up-required"
  | "unknown";

type AalCheckResult = {
  data: { currentLevel: string | null; nextLevel: string | null } | null;
  error: unknown;
};

/** Resolves the tri-state above from a caller-supplied AAL lookup.
 *
 *  Retries once before giving up. `getAuthenticatorAssuranceLevel()` mostly
 *  re-reads a session already fetched moments earlier by `getUser()`, so an
 *  isolated failure is expected to be a rare, momentary blip rather than a
 *  sustained outage; one retry absorbs that blip without weakening the
 *  fail-closed guarantee — a genuinely down auth service still exhausts both
 *  attempts and correctly resolves to "unknown". No backoff delay: this runs
 *  in edge middleware on every gated request, and the failures worth
 *  absorbing are expected to clear within the same tick, not seconds later. */
export async function resolveMfaStepUp(
  getAal: () => Promise<AalCheckResult>,
): Promise<MfaStepUpResult> {
  const attempts = 2;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const { data, error } = await getAal();
      if (!error && data) {
        return data.currentLevel === "aal1" && data.nextLevel === "aal2"
          ? "step-up-required"
          : "no-step-up-required";
      }
    } catch {
      // Fall through to the retry, or to "unknown" after the last attempt.
    }
  }
  return "unknown";
}
