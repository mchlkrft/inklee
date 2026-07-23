import type { ApprovalGroup, BillingMode } from "@/lib/billing";

// Billing mode + the activation-approval registry. Server-only config; no IO.
//
// MODE: subscriptions run in `live` mode whenever the Stripe key is a live key
// OR the deployment is production. That makes production ALWAYS enforce the
// activation gate (founder amendment: prod is always live-mode), and any live
// key anywhere enforce it too. Only a non-production deployment on a test key
// runs in `test` mode, where the gate is a deliberate no-op so the flow can be
// dogfooded end to end with the gate still closed for real money.
export function resolveBillingMode(): BillingMode {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  const isLiveKey = key.startsWith("sk_live_") || key.startsWith("rk_live_");
  const isProd = process.env.NODE_ENV === "production";
  return isLiveKey || isProd ? "live" : "test";
}

// The approval keys each activation group requires, mirroring
// docs/legal/billing-decision-pack.md section F. Groups are additive
// (technical < b2b < b2c) in the pure gate. A live charge for a group is
// impossible until every key here has an approved, artifact-bound row in
// billing_activation_approvals. Founder/dev cannot self-approve the
// accountant/counsel keys; that boundary lives in the approval process, and the
// bound_artifact check makes a stale approval fail closed.
export const REQUIRED_APPROVAL_KEYS: Record<ApprovalGroup, string[]> = {
  technical: [
    "schema_deployed",
    "webhook_tested",
    "reconciliation_tested",
    "isolation_tested",
  ],
  b2b: [
    "tax_policy_approved", // accountant
    "business_declaration_approved", // counsel
    "terms_approved", // counsel
    "invoice_config_approved", // accountant
    "pricing_display_approved", // founder + accountant
    "stripe_prod_verified", // founder
    "refund_handling_tested", // eng
  ],
  b2c: [
    "consumer_classification_approved", // counsel
    "consumer_withdrawal_copy_approved", // counsel
    "withdrawal_function_operational", // eng
    "durable_confirmation_operational", // eng
    "proration_policy_approved", // accountant + counsel
    "consumer_refund_creditnote_tested", // eng
    "consumer_pricing_display_approved", // founder + accountant
  ],
};
