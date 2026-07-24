// v1 Plus launch posture (docs/legal/plus-launch-strategy-decisions.md, D1):
// CONSUMER-FIRST. Every v1 buyer takes the consumer path; there is no business-use
// declaration at checkout. The B2B declaration control + its gating are DEFERRED
// (kept, not deleted) behind this flag for a future explicit business/studio tier.
export const PLUS_BUSINESS_TIER_ENABLED = false;

// The consumer purchase + withdrawal UI carries DRAFT consumer-protection copy
// (the immediate-performance request and the withdrawal explainer) that counsel
// has not yet cleared (consumer_withdrawal_copy_approved is unrecorded). Until
// that copy is approved and the b2c gate is ready to open, do NOT publish it to
// real users: keep the plan page on a neutral "coming soon" state. Flip this on
// only together with counsel's copy approval + the consumer launch.
export const PLUS_CONSUMER_LAUNCH_ENABLED = false;
