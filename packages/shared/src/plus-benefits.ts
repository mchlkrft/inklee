// The canonical Inklee Plus USP list (founder-reviewed wording, 2026-07-25).
// ONE source for every surface that lists what Plus includes: the public
// /pricing page, the web /settings/plan page, and the mobile plan screen
// (one-source-of-truth rule). Single-line by design: each entry must render on
// one line in the pricing card; two lines is the tolerated maximum.
//
// NOTE: the web plan page filters the email-templates entry for grandfathered
// artists via `.includes("email templates")` — keep that substring stable (or
// update the filter) when editing.
// CLAIMS CORRECTED 2026-07-28 (founder direction). Two entries described
// behaviour that does not exist and were removed rather than softened:
//
//   "Take full appointment payments by card" - there is NO code path for full
//   appointment payments today (grep-empty). It is approved Plus launch scope
//   and returns as the combined claim below once the flow is operational.
//
//   "Fully customisable booking template" - backed only by the custom-field
//   COUNT. The booking-form customization scope (templates, colours, cover
//   image, typography, conditional questions, custom confirmation, custom
//   email templates, custom slug, branding removal, large-project intake,
//   shared appearance defaults) is being built in P2/P3; the claim may only be
//   activated when that scope is complete.
//
// PENDING CLAIMS, do not publish until genuinely operational:
//   "Collect deposits, remaining balances, and full tattoo payments by card."
//   "Fully customisable booking form"
export const PLUS_BENEFITS = [
  "Collect card deposits in-app",
  "Your branding only, no Inklee footer",
  "Custom booking email templates",
  "Manage all your guest spots and studios",
  "Advanced booking analytics",
] as const;
