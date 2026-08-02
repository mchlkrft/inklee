import { getLegalDoc } from "./documents";

/**
 * The applicable Terms text, reproduced for a buyer receipt (C1.3, and
 * counsel Q6(b), 2026-08-02: "A confirmation with no Terms text is
 * non-compliant on its face for the same reason; checkout acceptance of terms
 * on a mutable web page does not cure it.").
 *
 * Single-sourced because there are TWO goods receipts and only one of them
 * had this: the standalone shop's built the section inline, and the
 * appointment add-on lane's carried no Terms at all. Two send sites reading
 * one function is what stops that from recurring on the third.
 *
 * The FULL Terms body is reproduced, unmodified. Counsel's C1.3 wording is
 * "the applicable terms text"; picking which clauses are "applicable" is a
 * legal call, and a superset discharges the duty while a subset chosen by
 * engineering does not. The version is stated so a later dispute can be
 * resolved against a specific document.
 *
 * Header shape ("Terms of Service (version X):") matches the approved Plus E2
 * confirmation in `lib/server/billing/withdrawal.ts` exactly.
 */
export function receiptTermsSection():
  | { section: string; error: null }
  | { section: null; error: string } {
  try {
    const terms = getLegalDoc("terms");
    return {
      section: `Terms of Service (version ${terms.version}):\n\n${terms.body.trim()}`,
      error: null,
    };
  } catch (err) {
    // Never throws: a receipt that fails to send is worse than a receipt
    // missing its Terms text. The caller MUST report the null, though. This
    // is a compliance defect the moment it happens, not a tolerated mode.
    return { section: null, error: String(err) };
  }
}
