// Plan-boundary messages served to the MOBILE app (P0 review fix 2026-07-28).
//
// Surface policy: the web may steer toward Plus ("Upgrade to Plus to add
// more."), the APP MUST NOT (D17 / store steering rules), and installed builds
// render server messages verbatim with no OTA to patch them. So every string a
// /api/mobile/* route can serve is steering-free AT THE SOURCE; the app's
// plan-errors.ts stripper stays as belt-and-braces only. Web-only actions keep
// their own steering copy deliberately (a per-surface policy, not drift).
//
// plan-limit-messages.test.ts pins the no-steering invariant over these exact
// strings, so a copy edit cannot silently reintroduce steering.

// `cap` mirrors capState's `number | null` (null = unlimited). A null cap can
// never block, so the null wording is unreachable in practice; it exists so
// the types match the gate instead of asserting around it.
const capNoun = (cap: number | null, noun: string) =>
  cap === null ? `${noun}` : `${cap}-${noun}`;

export const MOBILE_PLAN_LIMIT_MESSAGES = {
  customFields: (cap: number | null) =>
    `You've reached the ${capNoun(cap, "field")} limit on your current plan. Remove a field to add more.`,
  activeTrips: (cap: number | null) =>
    `You've reached the ${capNoun(cap, "active trip")} limit on your current plan. A trip frees up once it has ended.`,
  studioLibrary: (cap: number | null) =>
    `You've reached the ${capNoun(cap, "studio")} limit on your current plan. Remove a studio to make room.`,
  activeProducts: (cap: number | null) =>
    `You've reached the ${capNoun(cap, "product")} limit on your current plan. Archive a product to make room.`,
  templatesNotEntitled:
    "Custom email templates aren't included in your current plan.",
} as const;
