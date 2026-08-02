/** Tri-state result of looking up whether the current session has a verified
 *  TOTP factor enrolled.
 *
 *  MFA-GATE-001, half two: a failed `listFactors()` call is indistinguishable
 *  from "no TOTP enrolled" once you only check `factors?.totp?.[0]` — this
 *  page used to send both cases to /dashboard, so a transient failure of the
 *  factor lookup let a session that still owed a step-up through anyway.
 *  "Could not determine" and "genuinely not enrolled" must resolve
 *  differently: the former must hold the session here, the latter must still
 *  release the (majority of) users who never enrolled MFA straight to
 *  /dashboard without a dead-end. */
export type TotpLookupResult =
  | { status: "enrolled"; factorId: string }
  | { status: "not-enrolled" }
  | { status: "unknown" };

type ListFactorsResult = {
  data: { totp?: { id: string }[] } | null;
  error: unknown;
};

/** Mirrors `resolveMfaStepUp`'s shape (tri-state + one retry) for the
 *  companion lookup this page owns. See that function for why one retry and
 *  no backoff. */
export async function resolveTotpStatus(
  listFactors: () => Promise<ListFactorsResult>,
): Promise<TotpLookupResult> {
  const attempts = 2;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const { data, error } = await listFactors();
      if (!error && data) {
        const totp = data.totp?.[0];
        return totp
          ? { status: "enrolled", factorId: totp.id }
          : { status: "not-enrolled" };
      }
    } catch {
      // Fall through to the retry, or to "unknown" after the last attempt.
    }
  }
  return { status: "unknown" };
}
