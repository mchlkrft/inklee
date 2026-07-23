import * as Sentry from "@sentry/nextjs";
import { serviceClient } from "@/lib/supabase/service";
import {
  assertLiveBillingAllowed,
  evaluateActivationGate,
  type ActivationApproval,
  type ActivationResult,
  type ApprovalGroup,
} from "@/lib/billing";
import { REQUIRED_APPROVAL_KEYS, resolveBillingMode } from "./config";

// Server-authoritative activation gate (execution item 3), wiring the pure gate
// in @inklee/shared/billing to the service-role billing_activation_approvals
// table. Every live-charge entry point calls assertLiveBillingAllowedFor first.
//
// This is the ONLY thing standing between the built subscription code and live
// money: with an empty approvals table (its current state), the live gate is
// closed for every group.

export async function getActivationApprovals(): Promise<ActivationApproval[]> {
  const { data, error } = await serviceClient
    .from("billing_activation_approvals")
    .select("approval_key, approval_group, approved, bound_artifact");

  if (error) {
    Sentry.captureException(error, {
      tags: { action: "get_activation_approvals" },
    });
    // Fail CLOSED: a read failure must never be read as "approved". The pure
    // gate treats an empty/partial set as blocked, so re-throwing (money path)
    // or returning [] both keep live billing shut. We throw so the caller sees
    // the real cause rather than a misleading "not approved yet".
    throw new Error(`Failed to read activation approvals: ${error.message}`);
  }

  return (data ?? []).map((r) => ({
    approvalKey: r.approval_key as string,
    approvalGroup: r.approval_group as ApprovalGroup,
    approved: (r.approved as boolean) ?? false,
    boundArtifact: (r.bound_artifact as string | null) ?? null,
  }));
}

/** Non-throwing evaluation, for an admin readiness view. */
export async function evaluateLiveBilling(
  group: ApprovalGroup,
): Promise<ActivationResult> {
  const mode = resolveBillingMode();
  if (mode === "test") {
    return evaluateActivationGate(group, {
      mode,
      approvals: [],
      requiredKeys: REQUIRED_APPROVAL_KEYS,
    });
  }
  const approvals = await getActivationApprovals();
  return evaluateActivationGate(group, {
    mode,
    approvals,
    requiredKeys: REQUIRED_APPROVAL_KEYS,
  });
}

/** Throwing guard for the money path. Call before any live charge. In test
 *  mode it is a deliberate no-op (no live money), so the flow dogfoods with the
 *  gate still closed for real billing. */
export async function assertLiveBillingAllowedFor(
  group: ApprovalGroup,
): Promise<void> {
  const mode = resolveBillingMode();
  if (mode === "test") return;
  const approvals = await getActivationApprovals();
  // TODO (hard pre-live requirement, see config.ts): resolve and pass
  // `currentArtifacts` (terms/privacy versionHash, active tax-policy version) so
  // a stale approval re-closes the gate. Not wired yet; must land, failing
  // closed, before any b2b/b2c approval row is recorded.
  assertLiveBillingAllowed(group, {
    mode,
    approvals,
    requiredKeys: REQUIRED_APPROVAL_KEYS,
  });
}
