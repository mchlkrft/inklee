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
