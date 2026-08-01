// The canonical Inklee Plus USP list (founder-reviewed wording, 2026-07-25).
// ONE source for every surface that lists what Plus includes: the public
// /pricing page, the web /settings/plan page, and the mobile plan screen
// (one-source-of-truth rule). Single-line by design: each entry must render on
// one line in the pricing card; two lines is the tolerated maximum.
//
// NOTE: the web plan page filters the email-templates entry for grandfathered
// artists via `.includes("email templates")` — keep that substring stable (or
// update the filter) when editing.
//
// CLAIMS CORRECTED 2026-07-28 (founder direction). Two entries described
// behaviour that did not exist yet and were removed rather than softened:
//
//   "Take full appointment payments by card" - there was NO code path for full
//   appointment payments then (grep-empty).
//
//   "Fully customisable booking template" - backed only by the custom-field
//   COUNT, not the real scope (templates, colours, cover image, typography,
//   conditional questions, custom confirmation, custom email templates,
//   custom slug, branding removal, large-project intake, shared appearance
//   defaults, image galleries), which was still being built across P2/P3.
//
// RESTORED 2026-08-01 (founder ruling FD13, FINAL wording,
// docs/product/plus-build-time-decisions.md). Both claims are now true in
// code and were release-state-verified against
// packages/shared/src/plus-capability-registry.ts BEFORE adding (both ship
// dark: fully enforced, but inert today with zero Plus artists, same as every
// other Plus capability pre-launch):
//
//   - Payments: appointment payment requests (create, revise, send, pay,
//     settle, refund) are fully built (A1-A8, migrations 0125-0128; registry
//     row "Appointment payment requests", launchReadiness "ready").
//   - Customization: booking-page templates (form_custom/appearance_custom,
//     registry row "Booking-form customization", launchReadiness "ready") +
//     image galleries (the new `rich_content_blocks` capability, founder
//     ruling FD1, this slice) + the pre-existing Hub block arrangement.
//
// FD13 also approved supporting (longer) copy for a future detail surface,
// not yet wired anywhere: "Take a deposit first or collect the complete
// tattoo price when the appointment is ready." / "Shape your page around
// your style with custom templates, image galleries and flexible content
// layouts." Use those verbatim if/when such a surface is built; do not
// paraphrase.
//
// FORBIDDEN, never reintroduce: "fully customisable" / "fully customizable",
// any page-builder implication (drag-and-drop, arbitrary columns, breakpoint
// composition, visual website builder), or a claim for a parked/incomplete
// capability.
export const PLUS_BENEFITS = [
  "Collect deposits and full appointment payments",
  "Your branding only, no Inklee footer",
  "Custom booking email templates",
  "Customise your booking page with templates, galleries and flexible sections",
  "Manage all your guest spots and studios",
  "Advanced booking analytics",
] as const;
