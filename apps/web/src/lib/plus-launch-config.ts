// v1 Plus launch posture (docs/legal/plus-launch-strategy-decisions.md, D1):
// CONSUMER-FIRST. Every v1 buyer takes the consumer path; there is no business-use
// declaration at checkout. The B2B declaration control + its gating are DEFERRED
// (kept, not deleted) behind this flag for a future explicit business/studio tier.
export const PLUS_BUSINESS_TIER_ENABLED = false;

// Consumer Plus sales LAUNCHED 2026-08-04. The consumer purchase + withdrawal UI
// copy is counsel-approved (C1 final sign-off; Terms + Privacy version 2026-08-04),
// and the server-side b2c activation gate is fully open: all REQUIRED_APPROVAL_KEYS.b2c
// are recorded, including consumer_sales_launch_approved (the founder go-live
// decision), and the marketed capabilities are unparked. This compile-time flag
// publishes the /pricing + plan-page upgrade UI. To pull the launch: set false +
// redeploy AND void the launch key (scripts/billing/close-sales.cjs) — the server
// gate blocks new consumer contracts independently of this flag.
export const PLUS_CONSUMER_LAUNCH_ENABLED = true;

// Yearly Plus (docs/product/pricing-model.md row 3: 24 EUR first year via the
// auto-applied first-year coupon, then 30 EUR per year). ENABLED 2026-07-25:
// counsel approved yearly billing (annual proration cleared); the
// inklee_plus_yearly_eur Prices + the first-year coupon exist in both modes.
// Tracked follow-up, due BEFORE the first yearly renewals (mid-2027): the
// renewal-reminder email for the FR/AT/RO/SE annual tacit-renewal rules.
export const PLUS_YEARLY_ENABLED = true;

// Fee-refund policy v1 activation (PAY-RFD-002). v1's `retain_non_recoverable`
// artist-cancellation case retains only the actual non-recoverable Stripe cost.
// The settlement path stamps a collection with v1 ONLY when this is enabled, so
// v1 never enters live behaviour by accident. It is a HARD activation gate, not
// a UI flag: keep it off until the migration (0131) is deployed, settlement is
// capturing the per-transaction processor cost, the real-core v1 tests pass, and
// the fee-refund approval key is current against the final implementation. Env
// driven so activation is a deliberate deploy-time change, not a code edit.
export const FEE_REFUND_V1_ACTIVATION_ENABLED =
  process.env.FEE_REFUND_V1_ACTIVATION === "true";
