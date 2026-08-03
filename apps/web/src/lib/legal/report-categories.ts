// Single source of truth for the /legal/report category vocabulary, shared by
// the server action (`app/legal/report/actions.ts`) and the client form
// (`report-form.tsx`) so the two lists cannot drift. It lives in a `.ts` (not
// `.tsx`) deliberately: vitest's include is `src/**/*.test.ts`, so only a `.ts`
// module can be asserted, which is what lets the drift test exist.
//
// `image_without_consent` is counsel round-2 Q16's notice-and-action route for
// a person depicted in a hosted gallery image (DPIA mitigation R1). It doubles
// as that person's GDPR erasure route for the image
// (docs/lo-5-dpia.md). `directory_listing` is the separate GDPR Art. 21
// objection / map-delisting route for a studio Inklee listed from open data
// (counsel §7.7); it lives here because the in-product map report requires an
// account the studio owner almost never has. Both are triaged outside the pure
// notice-and-action path, per docs/dsa-moderation-procedure.md §2a/§2b.

export const REPORT_CATEGORIES: readonly { value: string; label: string }[] = [
  { value: "illegal_content", label: "Illegal content" },
  { value: "ip_infringement", label: "Intellectual property infringement" },
  { value: "impersonation", label: "Impersonation" },
  { value: "harassment", label: "Harassment or hate" },
  { value: "image_without_consent", label: "Image of me without consent" },
  { value: "spam_fraud", label: "Spam or fraud" },
  {
    value: "directory_listing",
    label: "Remove or correct a studio listing on the tattoo map",
  },
  { value: "other", label: "Other" },
] as const;

/** Label lookup, derived from REPORT_CATEGORIES so it can never disagree with
 *  the form's option order or set. Server validation keys off membership here. */
export const REPORT_CATEGORY_LABELS: Record<string, string> =
  Object.fromEntries(REPORT_CATEGORIES.map((c) => [c.value, c.label]));
