import * as Sentry from "@sentry/nextjs";
import { serviceClient } from "@/lib/supabase/service";
import {
  assertLiveBillingAllowed,
  evaluateActivationGate,
  BillingActivationError,
  type ActivationApproval,
  type ActivationResult,
  type ApprovalGroup,
} from "@/lib/billing";
import { REQUIRED_APPROVAL_KEYS, resolveBillingMode } from "./config";
import { getCurrentBillingArtifacts } from "./artifacts";

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
  const [approvals, currentArtifacts] = await Promise.all([
    getActivationApprovals(),
    getCurrentBillingArtifacts(),
  ]);
  return evaluateActivationGate(group, {
    mode,
    approvals,
    requiredKeys: REQUIRED_APPROVAL_KEYS,
    currentArtifacts,
  });
}

/** The per-contract-type LAUNCH keys (founder direction 2026-07-28): distinct
 *  from the compliance sets, these are the recorded go-live decisions. The
 *  consumer key also sits inside the b2c required set, so the b2c group is
 *  "allowed AND on"; the business key is deliberately STANDALONE — the
 *  activation chain is additive (b2c requires every b2b key), so putting a
 *  business launch key into the b2b group would force a business launch
 *  decision before any consumer sale, which is backwards (the business tier is
 *  deferred under D1 while consumer launches first). */
const SALES_LAUNCH_KEYS = {
  consumer: "consumer_sales_launch_approved",
  business: "business_sales_launch_approved",
} as const;

export type SalesContractType = keyof typeof SALES_LAUNCH_KEYS;

/** Throwing guard for OPENING a sales path (creating a new paid contract),
 *  asserted BEFORE the consent write and before any Stripe object. Distinct
 *  from assertLiveBillingAllowedFor: that one answers "is charging this group
 *  compliant", this one answers "has the founder recorded the decision to
 *  SELL this contract type". Fails closed on read errors (the reader throws),
 *  and is a test-mode no-op like the group gate so the flow still dogfoods. */
export async function assertSalesLaunchApproved(
  contractType: SalesContractType,
): Promise<void> {
  const mode = resolveBillingMode();
  if (mode === "test") return;
  const key = SALES_LAUNCH_KEYS[contractType];
  const approvals = await getActivationApprovals();
  const row = approvals.find((a) => a.approvalKey === key);
  if (!row?.approved) {
    const group: ApprovalGroup = contractType === "consumer" ? "b2c" : "b2b";
    throw new BillingActivationError(
      group,
      [key],
      `${contractType} sales are not launched: '${key}' is not recorded.`,
    );
  }
}

/** A7 (counsel-accountant-handoff-2026-08.md PART 4): whether the founder has
 *  recorded the per-transaction Stripe-processing subsidy as intended policy —
 *  the second, independent half of `noSeparateCardProcessingFeesClaimVisible`
 *  (@inklee/shared/platform-fee). This is a COPY decision, not a money gate,
 *  so unlike `assertLiveBillingAllowedFor` it is NOT a test-mode no-op: the
 *  payouts page must show the same copy in dev/staging as it will in
 *  production once this is recorded, so a preview environment can actually
 *  preview the flip. Recorded the same way as the standalone launch keys
 *  (`scripts/billing/record-approval.cjs` — no separate script needed): a
 *  single `billing_activation_approvals` row, `approved = true`, absent by
 *  default, which is what keeps the claim suppressed until the founder acts. */
const FEE_PROCESSING_SUBSIDY_CLAIM_KEY =
  "fee_processing_subsidy_claim_approved";

export async function isFeeProcessingSubsidyClaimApproved(): Promise<boolean> {
  const approvals = await getActivationApprovals();
  return approvals.some(
    (a) => a.approvalKey === FEE_PROCESSING_SUBSIDY_CLAIM_KEY && a.approved,
  );
}

/** Throwing guard for the money path. Call before any live charge. In test
 *  mode it is a deliberate no-op (no live money), so the flow dogfoods with the
 *  gate still closed for real billing. */
export async function assertLiveBillingAllowedFor(
  group: ApprovalGroup,
): Promise<void> {
  const mode = resolveBillingMode();
  if (mode === "test") return;
  // Resolve the CURRENT artifact versions so a stale approval (a rolled Terms
  // hash / superseded tax policy) re-closes the gate. Fails closed: an
  // unresolvable version becomes a sentinel no bound_artifact can match.
  const [approvals, currentArtifacts] = await Promise.all([
    getActivationApprovals(),
    getCurrentBillingArtifacts(),
  ]);
  assertLiveBillingAllowed(group, {
    mode,
    approvals,
    requiredKeys: REQUIRED_APPROVAL_KEYS,
    currentArtifacts,
  });
}
