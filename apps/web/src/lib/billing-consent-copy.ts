// Single source for the B2B pre-checkout consent copy (counsel C3). Imported by
// BOTH the client confirmation control and the server action that records the
// declaration, so the text a buyer sees and the evidence we store never diverge.
// The declaration is a SEPARATE, unchecked, required control (not bundled with
// Terms acceptance). Versioned so the recorded consent binds to the exact wording.
// Each text has a pre-computed SHA-256 hash stored alongside it; consent records
// write the hash into consent_hash so an edit to the text without a version bump
// is detectable by audit (the recorded hash won't match a re-computed one).
export const BUSINESS_DECLARATION_VERSION =
  "c3-business-declaration-2026-07-23";
export const BUSINESS_DECLARATION_TEXT =
  "I confirm that I am purchasing Inklee Plus for my trade, business, craft or profession, and not as a consumer.";
export const BUSINESS_DECLARATION_HASH =
  "a91fdf68f9e1ed1ca06012583bbd5cf3456dd04245cb9d4cf25b5e99233042ef";

// Consumer immediate-performance request (P3, docs/legal/eu-consumer-withdrawal-flow.md
// section 2). A SEPARATE, unchecked, OPTIONAL control (never pre-selected, never
// bundled with Terms). It contains NO blanket rights-waiver: the consumer keeps
// the 14-day withdrawal right; requesting immediate start only means a mid-period
// withdrawal is prorated rather than fully refunded (F4(b)). DRAFT wording,
// gated by consumer_withdrawal_copy_approved until counsel clears it.
export const IMMEDIATE_PERFORMANCE_VERSION =
  "p3-immediate-performance-2026-07-24";
export const IMMEDIATE_PERFORMANCE_TEXT =
  "I request that Inklee start my subscription immediately, before the 14-day withdrawal period ends. I understand that if I withdraw during this period, I pay a proportionate amount for the service already provided. I keep my right to withdraw.";
export const IMMEDIATE_PERFORMANCE_HASH =
  "4d398156f5ee6c369882c29af24e58eb13620b06644ee809c91591eed2649421";
