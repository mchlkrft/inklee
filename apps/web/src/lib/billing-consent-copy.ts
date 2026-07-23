// Single source for the B2B pre-checkout consent copy (counsel C3). Imported by
// BOTH the client confirmation control and the server action that records the
// declaration, so the text a buyer sees and the evidence we store never diverge.
// The declaration is a SEPARATE, unchecked, required control (not bundled with
// Terms acceptance). Versioned so the recorded consent binds to the exact wording.
export const BUSINESS_DECLARATION_VERSION =
  "c3-business-declaration-2026-07-23";
export const BUSINESS_DECLARATION_TEXT =
  "I confirm that I am purchasing Inklee Plus for my trade, business, craft or profession, and not as a consumer.";
