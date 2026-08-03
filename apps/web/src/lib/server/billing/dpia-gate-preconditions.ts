import "server-only";
import { getActivationApprovals } from "./activation";

/**
 * LO-5 DPIA §7 gate wiring.
 *
 * The controller's §7 decision is explicit about the FORM this takes, not just
 * the content: "R3, R4, and R6 are recorded as named preconditions in the
 * activation-gate ledger for the gallery and goods gates - not as document
 * conditions. This project's own record shows prose conditions drift; gate
 * keys do not."
 *
 * That instruction is the whole reason this module exists. Every previous
 * attempt to hold a launch condition lived in a markdown table, and this
 * repository has a documented history of exactly that failing: a conditional
 * counsel permission implemented without its condition (Q7), a "scheduled
 * fast-follow" that was nowhere scheduled (Q5), a "dated" signed-URL item with
 * no date, no owner and no ticket, and a DPIA that went three counsel rounds
 * without an owner. Prose does not refuse.
 *
 * So the DPIA's mitigations are recorded the same way the founder's launch
 * decisions already are: as rows in `billing_activation_approvals`, absent by
 * default, and asserted by a throwing guard BEFORE the gate opens.
 *
 * WHAT THIS IS NOT. It does not decide whether a mitigation is built - a human
 * records the key once the work is done and verified. It makes the gate refuse
 * to open while the key is absent, which is the property prose lacked.
 */

/** DPIA §7 mitigations that must be recorded before a gate may open. The key
 *  strings are the contract; changing one silently un-gates its precondition,
 *  which is why the table below is asserted by name in the tests. */
export const DPIA_PRECONDITION_KEYS = {
  /** R3 - direct-upload rights attestation at parity with URL import (Q15). */
  uploadAttestation: "dpia_r3_direct_upload_attestation_built",
  /** R4 - signed expiring URLs for gallery objects, resolved by the controller
   *  as required BEFORE the capability is granted to anyone (Q18). */
  signedGalleryUrls: "dpia_r4_signed_gallery_urls_built",
  /** R6 - the 90-day intake retention purge. The form is LIVE and the gap arms
   *  on first submission, which is why it gates both rather than one. */
  intakePurge: "dpia_r6_intake_retention_purge_built",
} as const;

export type DpiaGate = "gallery" | "goods";

/**
 * Which mitigations gate which flag, per the §7 table verbatim.
 *
 * R3 and R4 are gallery-only: both concern hosted portfolio images. R6 gates
 * BOTH, because the controller's disposition says so in terms - the intake
 * form is already live and the retention gap becomes real on the first
 * submission, independently of which commercial surface opens.
 */
export const DPIA_GATE_PRECONDITIONS: Record<DpiaGate, readonly string[]> = {
  gallery: [
    DPIA_PRECONDITION_KEYS.uploadAttestation,
    DPIA_PRECONDITION_KEYS.signedGalleryUrls,
    DPIA_PRECONDITION_KEYS.intakePurge,
  ],
  goods: [DPIA_PRECONDITION_KEYS.intakePurge],
} as const;

export class DpiaPreconditionError extends Error {
  readonly gate: DpiaGate;
  readonly missing: readonly string[];
  constructor(gate: DpiaGate, missing: readonly string[]) {
    super(
      `LO-5 DPIA precondition not met for the ${gate} gate. Missing: ${missing.join(", ")}. ` +
        `These are §7 mitigations adopted by the controller on 2026-08-03; record each with ` +
        `scripts/billing/record-approval.cjs once the work is built and independently verified.`,
    );
    this.name = "DpiaPreconditionError";
    this.gate = gate;
    this.missing = missing;
  }
}

/** Unmet DPIA preconditions for a gate. Empty array means the gate is clear. */
export async function missingDpiaPreconditions(
  gate: DpiaGate,
): Promise<string[]> {
  const required = DPIA_GATE_PRECONDITIONS[gate];
  // Reads through getActivationApprovals, which THROWS on a read failure by
  // design. That is the behaviour we want and the reason this does not catch:
  // a database blip must not read as "no preconditions missing". The whole
  // failure class this repository spent 2026-08-02 removing was a failed read
  // resolving to a permissive default.
  const approvals = await getActivationApprovals();
  return required.filter(
    (key) => !approvals.find((a) => a.approvalKey === key)?.approved,
  );
}

/**
 * Throwing guard. Call BEFORE opening a gate, never after.
 *
 * NOT a test-mode no-op, unlike `assertSalesLaunchApproved`. That one is
 * relaxed in test mode so the billing flow can dogfood itself. This one must
 * not be, because its subject is not a commercial decision that can be
 * rehearsed - it is whether a data-protection mitigation physically exists.
 * A staging environment that opens the gallery without signed URLs is hosting
 * the same images at the same kind of URL as production would.
 */
export async function assertDpiaPreconditionsMet(
  gate: DpiaGate,
): Promise<void> {
  const missing = await missingDpiaPreconditions(gate);
  if (missing.length > 0) throw new DpiaPreconditionError(gate, missing);
}
