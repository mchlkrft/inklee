// Pure auth-state derivations shared by web (settings/account) and mobile
// (/api/mobile/account) so a security-state pill like "2FA on/off" is computed
// identically on both surfaces (ME-10 one-source-of-truth). Intl-free, no
// platform deps.

/** A factor as returned by Supabase listFactors() / getUser().factors — only
 *  the two fields the derivations read are required. */
export type AuthFactorLike = {
  factor_type?: string | null;
  status?: string | null;
};

/**
 * True when the artist has at least one VERIFIED TOTP factor. Scans the WHOLE
 * factor list rather than the first entry, so an abandoned unverified factor
 * created before the real one can't make the two surfaces disagree (the BUG-7
 * divergence: web read factors.totp[0], mobile scanned all).
 */
export function isMfaEnabled(
  factors: readonly AuthFactorLike[] | null | undefined,
): boolean {
  return (factors ?? []).some(
    (f) => f.factor_type === "totp" && f.status === "verified",
  );
}

/** A linked identity as returned by Supabase getUser().identities — only the
 *  provider field is read. */
export type AuthIdentityLike = { provider?: string | null };

export type SignInIdentity = {
  /** The account has an email/password identity (can re-auth with a password). */
  hasPassword: boolean;
  /** For OAuth-only accounts, the provider to re-verify with (e.g. "google",
   *  "apple"); null when the account has a password. */
  oauthProvider: string | null;
};

/**
 * Derive the sign-in identity from the user's linked identities. Scans the
 * identity LIST — not `app_metadata.provider`, which records only the most-recent
 * provider and made the mobile delete screen disagree with web (an email+google
 * account showed the Google re-auth instead of the password field). An account
 * with an "email" identity is password-capable; otherwise the first non-email
 * provider is the one to re-verify with. (ME-10 D23)
 */
export function deriveSignInIdentity(
  identities: readonly AuthIdentityLike[] | null | undefined,
): SignInIdentity {
  const list = identities ?? [];
  const hasPassword = list.some((i) => i.provider === "email");
  const oauthProvider = hasPassword
    ? null
    : (list.find((i) => i.provider !== "email")?.provider ?? null);
  return { hasPassword, oauthProvider };
}
