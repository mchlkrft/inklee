// The canonical Inklee Plus USP list (founder-reviewed wording, 2026-07-25).
// ONE source for every surface that lists what Plus includes: the public
// /pricing page, the web /settings/plan page, and the mobile plan screen
// (one-source-of-truth rule). Single-line by design: each entry must render on
// one line in the pricing card; two lines is the tolerated maximum.
//
// NOTE: the web plan page filters the email-templates entry for grandfathered
// artists via `.includes("email templates")` — keep that substring stable (or
// update the filter) when editing.
export const PLUS_BENEFITS = [
  "Collect card deposits in-app",
  "Take full appointment payments by card",
  "Fully customisable booking template",
  "Your branding only, no Inklee footer",
  "Custom booking email templates",
  "Manage all your guest spots and studios",
  "Advanced booking analytics",
] as const;
