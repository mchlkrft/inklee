// The canonical Plus capability registry (founder directive 2026-07-28).
//
// ONE machine-checkable description of every sellable Plus capability, used to
// detect divergence between marketing, pricing, Terms, checkout, entitlements,
// production capability flags, server enforcement, and mobile behavior. The
// commercial-readiness script and future divergence checks consume this; the
// human view lives in docs/product/plus-product-spec.md.
//
// State fields describe CURRENT implementation truth (audited 2026-07-28,
// 12-agent adversarial pass), not aspiration. Update rows in the SAME change
// that alters a capability's state; a stale row here is a bug exactly like a
// stale parity-register row.

export type ImplState = "exists" | "partial" | "absent";
export type LaunchReadiness = "ready" | "build" | "blocked-decision";

export type PlusCapability = {
  /** Customer-facing name (spec language: style/identity/presentation, no brand-speak). */
  name: string;
  /** Internal entitlement key; (proposed) keys do not exist in code yet. */
  entitlementKey: string;
  productArea:
    | "inklee-page"
    | "booking-form"
    | "large-projects"
    | "goods"
    | "fees"
    | "insights"
    | "platform";
  freeBehavior: string;
  plusBehavior: string;
  /** What legacy_free_v1 keeps (grandfather grant); "none" = not granted. */
  legacyBehavior: string;
  scope: "artist" | "studio" | "transaction";
  /** Server-side enforcement truth. */
  serverEnforcement: ImplState;
  /** Database-level enforcement (RLS, constraints, caps in SQL). */
  databaseEnforcement: ImplState;
  frontendBehavior: ImplState;
  mobileSupport: ImplState;
  downgradeBehavior: string;
  /** How this capability touches money, if at all. */
  feeImpact: string;
  /** Analytics events that exist or are required for this capability. */
  analyticsEvents: string;
  /** What /pricing + PLUS_BENEFITS currently claim ("none" = not marketed yet). */
  pricingPageClaim: string;
  /** What the Terms currently promise ("none" = silent). */
  termsClaim: string;
  /** Operational state in production (parked in DISABLED_CAPABILITIES etc.). */
  operationalState: string;
  testCoverage: ImplState;
  launchReadiness: LaunchReadiness;
};

export const PLUS_CAPABILITY_REGISTRY: PlusCapability[] = [
  // ------------------------------------------------------------ Inklee page
  {
    name: "Inklee branding removal",
    entitlementKey: "branding",
    productArea: "inklee-page",
    freeBehavior: "Made with Inklee footer visible on all public surfaces",
    plusBehavior: "Footer removable",
    legacyBehavior: "none (deliberately excluded from legacy_free_v1)",
    scope: "artist",
    serverEnforcement: "exists", // server-rendered, fail-safe, verified 2026-07-28 across booking page, hub, 5 flash pages
    databaseEnforcement: "exists", // account_overrides grant
    frontendBehavior: "exists",
    mobileSupport: "exists", // public pages are web; app previews follow
    downgradeBehavior: "Footer returns on next render; nothing deleted",
    feeImpact: "none",
    analyticsEvents: "none required",
    pricingPageClaim: "Your branding only, no Inklee footer",
    termsClaim: "Terms section 11 names footer removal",
    operationalState:
      "UN-PARKED 2026-07-28 after the e2e verification pass (branding-entitlement.spec.ts, served-HTML both directions)",
    testCoverage: "exists", // gate shape + served-HTML e2e both directions
    launchReadiness: "ready",
  },
  {
    name: "Linkhub layout templates (Clean, Portfolio, Bold, Editorial)",
    entitlementKey: "page_templates (proposed)",
    productArea: "inklee-page",
    freeBehavior: "One fixed professionally designed layout",
    plusBehavior: "Four templates",
    legacyBehavior: "none",
    scope: "artist",
    serverEnforcement: "absent",
    databaseEnforcement: "absent",
    frontendBehavior: "absent", // one hardcoded layout today
    mobileSupport: "absent",
    downgradeBehavior: "Reverts to the fixed layout; settings retained",
    feeImpact: "none",
    analyticsEvents: "template_selected (required)",
    pricingPageClaim: "none yet",
    termsClaim: "none",
    operationalState: "unbuilt",
    testCoverage: "absent",
    launchReadiness: "build",
  },
  {
    name: "Custom colors, typography, backgrounds, buttons, section layouts",
    entitlementKey: "appearance_custom (proposed)",
    productArea: "inklee-page",
    freeBehavior: "Preset cover colors (5 swatches) and cover image",
    plusBehavior:
      "Full palette, curated font library, background images per surface, button styles, orderable sections",
    legacyBehavior: "none",
    scope: "artist",
    serverEnforcement: "partial", // P1a: model + resolver + `appearance_custom` gate live and enforced at render; only the hub surface wired so far
    databaseEnforcement: "exists", // settings.appearance JSONB, parser-validated (closed vocabularies, http-only URLs)
    frontendBehavior: "partial", // hub consumes the tokens; 5 surfaces + both editors remain (P1b)
    mobileSupport: "absent", // native editor is P1b
    downgradeBehavior:
      "Drops ONLY the custom layer (typography, buttons, per-surface overrides); theme + preset accent + background survive as Free features, so a downgrade never blanks a page. Stored config retained for re-upgrade.",
    feeImpact: "none",
    analyticsEvents: "appearance_changed (required, P1b with the editor)",
    pricingPageClaim: "none yet",
    termsClaim: "none",
    operationalState:
      "P1a foundation shipped dark (capability parked; emits zero css vars until an artist customizes)",
    testCoverage: "exists", // 23 tests: parser incl. hostile input, override precedence, entitlement boundary, fail-safe
    launchReadiness: "build",
  },
  {
    name: "Custom SEO title and description",
    entitlementKey: "page_seo (proposed)",
    productArea: "inklee-page",
    freeBehavior: "Auto-composed metadata",
    plusBehavior: "Custom title and description",
    legacyBehavior: "none",
    scope: "artist",
    serverEnforcement: "absent",
    databaseEnforcement: "absent",
    frontendBehavior: "absent",
    mobileSupport: "absent",
    downgradeBehavior: "Reverts to auto-composed",
    feeImpact: "none",
    analyticsEvents: "none required",
    pricingPageClaim: "none yet",
    termsClaim: "none",
    operationalState:
      "BLOCKED-DECISION: artist pages are noindex by default; SEO strategy is ChatGPT-owned (CLAUDE.md)",
    testCoverage: "absent",
    launchReadiness: "blocked-decision",
  },
  {
    name: "Plus Linkhub blocks (booking form, goods, guest spots, flash, books-open, gallery)",
    entitlementKey: "page_blocks (proposed)",
    productArea: "inklee-page",
    freeBehavior:
      "Standard links + custom text sections (text sections shipped free, stays free)",
    plusBehavior: "Six rich blocks",
    legacyBehavior: "none",
    scope: "artist",
    serverEnforcement: "absent", // block-kind plumbing absent; underlying components exist on the booking page
    databaseEnforcement: "absent",
    frontendBehavior: "partial", // ShopTeaser/TravelCard/deriveBooksOpen/flash exist as booking-page components
    mobileSupport: "partial", // hub editor native twin exists; new kinds need both editors
    downgradeBehavior: "Blocks hidden, configuration retained",
    feeImpact: "none",
    analyticsEvents: "block_added, block_clicked (required)",
    pricingPageClaim: "none yet",
    termsClaim: "none",
    operationalState:
      "unbuilt; NOTE hub is PERMANENTLY FREE by founder decision (features.ts) - gating needs that revisited",
    testCoverage: "absent",
    launchReadiness: "build", // hub-free reconciliation closed 2026-07-28 (features.ts)
  },
  {
    name: "Linkhub analytics",
    entitlementKey: "analytics (existing key, widened)",
    productArea: "insights",
    freeBehavior: "None",
    plusBehavior:
      "Views, link clicks, CTR, sources, booking + goods conversions, 12-month detail, lifetime aggregates",
    legacyBehavior:
      "none (analytics deliberately excluded from legacy_free_v1)",
    scope: "artist",
    serverEnforcement: "absent", // canSeeAdvancedAnalytics has ZERO call sites
    databaseEnforcement: "absent", // no artist-keyed events, no click tables
    frontendBehavior: "absent",
    mobileSupport: "absent",
    downgradeBehavior: "Access ends; aggregates retained per retention policy",
    feeImpact: "none",
    analyticsEvents:
      "page_view (hostname substrate exists), link_click (ABSENT, needs beacon + table)",
    pricingPageClaim: "Advanced booking analytics (overclaims today)",
    termsClaim: "Terms section 11 names deeper analytics",
    operationalState:
      "capability paused AND unwired; near-parallel data plane required",
    testCoverage: "absent",
    launchReadiness: "build",
  },
  // ------------------------------------------------------------ booking form
  {
    name: "Booking-form customization (colors, templates, cover image, confirmation page, custom slug)",
    entitlementKey: "form_custom (+ appearance_custom for the visual layer)",
    productArea: "booking-form",
    freeBehavior:
      "Preset themes, artist logo, the clean layout, existing cover image (grandfathered, see below)",
    plusBehavior:
      "Custom colors, visual templates, cover image, custom confirmation page, custom URL slug",
    legacyBehavior: "none",
    scope: "artist",
    serverEnforcement: "exists", // P3b-P3f: templates via surfaceAppearance, confirmation + slug via formCustomAllowed, both refused server-side
    databaseEnforcement: "absent", // settings-JSONB family; no DB-level rule, same as every sibling
    frontendBehavior: "exists",
    mobileSupport: "exists", // confirmation + slug have native screens and shared cores; the public renderer is web by design
    downgradeBehavior:
      "Clean layout, default confirmation page, slug frozen at its current value (never reset); all settings retained",
    feeImpact: "none",
    analyticsEvents: "none required",
    pricingPageClaim:
      "Fully customisable booking template (now backed by templates + confirmation page + slug + the appearance layer)",
    termsClaim: "none",
    operationalState:
      "BUILT 2026-07-28. form_custom is live (not parked): with zero Plus artists it grants nothing, so it is inert today. OPEN: the spec lists cover image as Plus-only but it has shipped FREE for months and 3 of 19 production artists use one; built grandfathered pending the founder decision recorded in plus-commercial-packages.md §7",
    testCoverage: "exists", // booking-template-styles, confirmation-page, slug-rename
    launchReadiness: "ready",
  },
  {
    name: "Conditional booking-form questions",
    entitlementKey: "form_conditional",
    productArea: "booking-form",
    freeBehavior: "Flat question list (custom fields capped Free 3)",
    plusBehavior: "Conditional show/hide logic on questions",
    legacyBehavior: "none",
    scope: "artist",
    serverEnforcement: "exists", // migration 0114 + condition-aware validateCustomAnswers + applyConditionEntitlement on render AND submit
    databaseEnforcement: "absent", // nullable jsonb by design; the rule is behavioural, not a constraint
    frontendBehavior: "exists",
    mobileSupport: "exists", // native editor + conditionSources on the mobile read; absent-key PATCH protects pre-P3 builds
    downgradeBehavior:
      "Conditions ignored (all questions SHOW, never hide); definitions retained, and an unchanged condition survives an unrelated field edit",
    feeImpact: "none",
    analyticsEvents: "none required",
    pricingPageClaim: "none yet",
    termsClaim: "none",
    operationalState:
      "BUILT 2026-07-28 (P3a + the P3d gate). Live, not parked: with zero Plus artists it grants nothing, so conditions are stripped for everyone today and every question shows",
    testCoverage: "exists", // 25 shared-model tests + form-entitlements boundary tests
    launchReadiness: "ready",
  },
  {
    name: "Custom email templates",
    entitlementKey: "custom_templates",
    productArea: "booking-form",
    freeBehavior: "Default Inklee lifecycle emails; sends never degraded",
    plusBehavior:
      "Custom body per lifecycle type; form-specific templates once a form entity exists",
    legacyBehavior:
      "GRANTED (all 4 legacy_free_v1 rows carry custom_templates)",
    scope: "artist",
    serverEnforcement: "exists", // both save paths refuse pre-upsert (verified 2026-07-28)
    databaseEnforcement: "exists",
    frontendBehavior: "exists",
    mobileSupport: "partial", // enforced, but no not_entitled handling/upsell
    downgradeBehavior: "Bodies retained and keep sending; edits blocked",
    feeImpact: "none",
    analyticsEvents: "none required",
    pricingPageClaim: "Custom booking email templates",
    termsClaim: "Terms section 11 names custom templates",
    operationalState:
      "PARKED (moot: zero templates exist in prod); subjects force-reset by design",
    testCoverage: "exists", // P0 2026-07-28: rejection paths pinned on BOTH surfaces (web pre-upsert refusal, mobile 403 not_entitled, fail-open blip)
    launchReadiness: "build",
  },
  {
    name: "Large-project mode",
    entitlementKey: "large_projects",
    productArea: "large-projects",
    freeBehavior: "Not available",
    plusBehavior:
      "Specialized intake at a sub-path creating a long-term project record with lifecycle; sessions link to booking requests",
    legacyBehavior: "none",
    scope: "artist",
    serverEnforcement: "exists", // largeProjectsAllowed on the intake route AND re-checked inside submitProjectIntakeCore
    databaseEnforcement: "exists", // migration 0115: RLS SELECT-only for the owner, status/scale/coverage CHECKs, budget-range constraint
    frontendBehavior: "exists",
    mobileSupport: "partial", // list + detail + status + note are native; the public intake is a visitor surface (web), attaching a session is web-only for now
    downgradeBehavior:
      "Existing projects stay readable AND manageable (status, notes, session links); only the public intake and NEW records stop. Nothing is deleted",
    feeImpact: "per-session deposits ride the existing deposit plane",
    analyticsEvents:
      "project_intake_submitted, project_status_changed (still required; not emitted yet, lands with the P6 analytics plane)",
    pricingPageClaim: "none yet",
    termsClaim: "none",
    operationalState:
      "BUILT 2026-07-28 (migration 0115). Live, not parked: with zero Plus artists the intake 404s for everyone, so it is inert today. DEFERRED by design: the client portal view of a project, and project-specific lifecycle emails (v1 sends none, so the intake ends on the shared confirmation page)",
    testCoverage: "exists", // 23 shared-model tests + 16 server-core tests incl. fail-closed intake and transition refusal
    launchReadiness: "ready",
  },
  // ------------------------------------------------------------------ goods
  {
    name: "Goods selling (all tiers) with active-product caps",
    entitlementKey: "goods_module + product cap (proposed limit key)",
    productArea: "goods",
    freeBehavior: "Sell physical goods, 3 active products",
    plusBehavior: "25 active products",
    legacyBehavior: "unaudited vs the new package (flagged)",
    scope: "artist",
    serverEnforcement: "exists", // P0 2026-07-28: cap on create + unarchive, web + mobile; order-guarded delete archives
    databaseEnforcement: "exists", // archived enum value (0112); guard tests pin the fail-safe direction
    frontendBehavior: "exists",
    mobileSupport: "exists", // same guards on all routes; app explains the archive outcome (next build)
    downgradeBehavior:
      "Block-new keep-existing (cap gates create + unarchive only; existing over-cap products keep selling); records never deleted",
    feeImpact: "goods platform fee lane",
    analyticsEvents:
      "product_created, order_paid (order events exist server-side)",
    pricingPageClaim: "none yet",
    termsClaim: "none (goods marketplace wording = final counsel deliverable)",
    operationalState:
      "checkout parked behind GOODS_COMMERCE_ENABLED; display/CRUD live; the product cap lands DARK (entitlement_caps stays parked until P7)",
    testCoverage: "exists", // goods-guard tests: cap boundary, fail-open, order-guard fail-safe
    launchReadiness: "build",
  },
  {
    name: "Plus goods tools (variants+, inventory, preorders, drops, discounts, bundles, collections, shop customization, sales analytics)",
    entitlementKey: "goods_tools (proposed)",
    productArea: "goods",
    freeBehavior: "Basic listing, flat variants, basic stock",
    plusBehavior: "Full toolset; scheduled drops are the headline",
    legacyBehavior: "none",
    scope: "artist",
    serverEnforcement: "partial", // variants + stock decrement exist; the rest greenfield
    databaseEnforcement: "partial",
    frontendBehavior: "partial",
    mobileSupport: "partial",
    downgradeBehavior:
      "Tool access ends; product data + orders retained untouched",
    feeImpact: "discounts feed the fee base (subtotal after discounts)",
    analyticsEvents: "drop_scheduled, discount_redeemed (required)",
    pricingPageClaim: "none yet",
    termsClaim: "none",
    operationalState:
      "preorders/drops/discounts/bundles/collections all greenfield",
    testCoverage: "absent",
    launchReadiness: "build",
  },
  // ------------------------------------------------------------------- fees
  {
    name: "Deposit platform fee differentiation",
    entitlementKey: "fee schedule (versioned data, not an entitlement)",
    productArea: "fees",
    freeBehavior: "3% of deposits collected through Inklee",
    plusBehavior: "0.5%",
    legacyBehavior: "UNDEFINED for legacy_free_v1 (flagged: which rate?)",
    scope: "transaction",
    serverEnforcement: "partial", // single-source flat 3% exists; tier parameter absent
    databaseEnforcement: "absent", // no fee schedule version column
    frontendBehavior: "partial", // fee shown flat
    mobileSupport: "partial",
    downgradeBehavior:
      "Next transaction prices at the Free rate; past fees untouched",
    feeImpact:
      "SUPERSEDES OQ-7 flat-3%; fee actuals must start persisting (savings dashboard input)",
    analyticsEvents: "fee snapshot per transaction (required)",
    pricingPageClaim: "3% all-in today (needs update)",
    termsClaim: "deposit fee named in money copy (needs update)",
    operationalState:
      "RESOLVED 2026-07-28: card collection is PLUS-ONLY, so there is no Free rate (n/a, not 3%). Approved rates live in fee-schedule.ts as v2, DEFINED but NOT ACTIVE until P7 plus accountant sign-off.",
    testCoverage: "partial",
    launchReadiness: "build",
  },
  {
    name: "Goods platform fee",
    entitlementKey: "fee schedule (versioned data)",
    productArea: "fees",
    freeBehavior: "5% of subtotal after discounts, ex VAT and shipping",
    plusBehavior: "1%",
    legacyBehavior: "UNDEFINED (flagged)",
    scope: "transaction",
    serverEnforcement: "absent", // coded at 0%: application_fee never raised on the add-on path
    databaseEnforcement: "absent", // fee base fields (discount/VAT/shipping decomposition) absent; subtotal ambiguous
    frontendBehavior: "absent",
    mobileSupport: "absent",
    downgradeBehavior: "Next transaction at Free rate",
    feeImpact:
      "SUPERSEDES D22; platform_fee_amount must be written per order + schedule version",
    analyticsEvents: "fee snapshot per transaction (required)",
    pricingPageClaim: "none",
    termsClaim: "none (goods marketplace wording = counsel deliverable)",
    operationalState: "0% hole must close before any unpark",
    testCoverage: "absent",
    launchReadiness: "build",
  },
  {
    name: "Fee-refund policy (versioned data)",
    entitlementKey: "fee refund policy (versioned data)",
    productArea: "fees",
    freeBehavior: "same policy both tiers",
    plusBehavior: "same policy both tiers",
    legacyBehavior: "same",
    scope: "transaction",
    serverEnforcement: "partial", // hardcoded full-refund-only, fee ALWAYS returned (incl. artist cancel, contradicting target); zero dispute code
    databaseEnforcement: "absent", // no policy rows
    frontendBehavior: "partial",
    mobileSupport: "partial",
    downgradeBehavior: "n/a",
    feeImpact:
      "voluntary refunds return proportional fee; disputes/fraud retain where permitted; artist cancel retains only non-recoverables",
    analyticsEvents: "refund events exist in audit_log",
    pricingPageClaim: "none",
    termsClaim: "cancellation/refund wording = counsel deliverable",
    operationalState:
      "policy-as-data unbuilt; charge.dispute.* webhooks do not exist",
    testCoverage: "partial",
    launchReadiness: "build",
  },
  {
    name: "Fee-savings dashboard",
    entitlementKey: "savings_dashboard (proposed)",
    productArea: "insights",
    freeBehavior: "Savings prompts only in billing/revenue surfaces, no popups",
    plusBehavior:
      "Fees paid, saved vs Free, subscription cost, net benefit, break-even, comparison period",
    legacyBehavior: "none",
    scope: "artist",
    serverEnforcement: "absent",
    databaseEnforcement: "absent", // fee actuals never persisted (audit_log JSON only; unrecoverable history)
    frontendBehavior: "absent",
    mobileSupport: "absent",
    downgradeBehavior: "Dashboard hidden; data retained",
    feeImpact:
      "consumes persisted fee actuals; claims only from actual eligible transactions",
    analyticsEvents: "n/a (it IS an analytics surface)",
    pricingPageClaim: "none yet",
    termsClaim: "none",
    operationalState: "blocked on fee persistence (D21 columns)",
    testCoverage: "absent",
    launchReadiness: "build",
  },
  // --------------------------------------------------------------- platform
  {
    name: "Entitlement caps (fields, trips, studio library)",
    entitlementKey: "entitlement_caps",
    productArea: "platform",
    freeBehavior: "fields 3, trips 3, studios 5 (ratified + enforced today)",
    plusBehavior: "fields 30, trips 100, studios 50 (ratified + advertised)",
    legacyBehavior:
      "per-limit overrides only where cutover exceeded (all 4 rows empty)",
    scope: "artist",
    serverEnforcement: "exists", // all create paths, web + mobile, verified 2026-07-28
    databaseEnforcement: "partial",
    frontendBehavior: "partial", // save-error-only discovery; no proactive cap UI
    mobileSupport: "partial", // enforced; no cap_reached handling
    downgradeBehavior:
      "Over-cap rows read-only-new (block new creates, keep existing)",
    feeImpact: "none",
    analyticsEvents: "cap_hit (proposed)",
    pricingPageClaim: "Higher limits",
    termsClaim: "Terms section 11 names higher limits",
    operationalState:
      "RESOLVED 2026-07-28: the 2026-07-25 ratification and published plan copy are AUTHORITATIVE (fields 3/30, trips 3/100, studios 5/50, products 3/25). The provisional 5/1/5 to 30/10/50 values are superseded and must not reappear. One canonical source: CANONICAL_CAPS in entitlements.ts.",
    testCoverage: "partial",
    launchReadiness: "build",
  },
  {
    name: "Founder offer (first 100, 24 EUR/year)",
    entitlementKey: "n/a (Stripe promotion code)",
    productArea: "platform",
    freeBehavior: "n/a",
    plusBehavior:
      "First 100 subscribers, 24 EUR first year, yearly-only, 6-month window",
    legacyBehavior: "n/a",
    scope: "artist",
    serverEnforcement: "partial", // yearly plan + auto coupon wired; the FIRST-100 mechanic absent
    databaseEnforcement: "absent", // no promo mirror table
    frontendBehavior: "partial",
    mobileSupport: "exists", // no IAP by design; nothing to do
    downgradeBehavior: "per the decided offer terms (founder-only)",
    feeImpact: "none",
    analyticsEvents: "offer_redeemed (proposed)",
    pricingPageClaim: "none yet",
    termsClaim: "none",
    operationalState:
      "CORRECTED 2026-07-28: the universal yearly coupon is REMOVED. Eligibility is decided server-side (founder-offer.ts) against a policy row that must exist for the offer to be open, so the default state is closed. The cap holds under concurrency via a unique cohort position; one per account, non-transferable, and cancelling never frees a slot.",
    testCoverage: "absent",
    launchReadiness: "build",
  },
];

/** Registry-wide invariants a divergence check can assert. */
export const REGISTRY_RULES = {
  /** A marketed capability (pricingPageClaim not "none"*) must never be operationally parked at launch. */
  noParkedMarketedCapability: true,
  /** A Plus capability permissive for all Free accounts with no grandfather scope fails readiness. */
  noVacuousDifferentiation: true,
} as const;
