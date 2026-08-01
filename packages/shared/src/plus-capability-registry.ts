// The canonical Plus capability registry (founder directive 2026-07-28).
//
// ONE machine-checkable description of every sellable Plus capability, used to
// detect divergence between marketing, pricing, Terms, checkout, entitlements,
// production capability flags, server enforcement, and mobile behavior. The
// commercial-readiness script and future divergence checks consume this; the
// human view lives in docs/product/plus-product-spec.md.
//
// State fields describe CURRENT implementation truth (audited 2026-07-28,
// 12-agent adversarial pass; refreshed 2026-07-31 for P9 appointment payments,
// P5d collections, C1-C7 correctness fixes, and custom_templates page gate),
// not aspiration. Update rows in the SAME change that alters a capability's
// state; a stale row here is a bug exactly like a stale parity-register row.

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
    name: "Custom colors, typography, backgrounds, buttons, page templates (STYLING ONLY — see rich_content_blocks for galleries/rich content)",
    entitlementKey: "appearance_custom",
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
    pricingPageClaim:
      "APPROVED WORDING, NOT YET PUBLISHABLE (founder ruling FD3, 2026-08-01): 'Flexible section layouts and page templates', to be used where the section-arrangement/template feature is described. Held back by release-state verification (FD13): this capability is still 'build' readiness (5 surfaces + both editors remain, P1b) — do not publish until that scope closes.",
    termsClaim: "none",
    operationalState:
      "P1a foundation shipped dark (capability parked; emits zero css vars until an artist customizes). CORRECTED 2026-08-01 (founder ruling FD1, SUPERSEDES D1): this capability's SCOPE is now explicitly colors/fonts/templates/styling ONLY. image_gallery (and any future rich content block) does NOT belong here; it moved to the new `rich_content_blocks` capability below, gated on its own entitlement key. No split gating remains: grep across the repo for `appearance_custom` turns up zero gallery-related call sites (verified 2026-08-01).",
    testCoverage: "exists", // 23 tests: parser incl. hostile input, override precedence, entitlement boundary, fail-safe
    launchReadiness: "build",
  },
  {
    name: "Rich content blocks on the Inklee Hub (image galleries) AND surface-specific shop content (FD10)",
    entitlementKey: "rich_content_blocks",
    productArea: "inklee-page",
    freeBehavior: "No rich content blocks on the Hub; no shop hero/intro/featured collections",
    plusBehavior:
      "Image galleries on the Hub (upload OR server-side import from a URL, layout grid/carousel). EXTENDED 2026-08-01 (founder ruling FD10, CONFIRMS S1/S6): a second, independent CONTENT use of the same key — a hero image, an intro line, and featured collections for the \"shop\" surface (surface-content.ts), consumed by BOTH the standalone shop checkout page and the booking-page shop teaser. The entitlement is deliberately named for the FAMILY, not just galleries, so both this and future rich sections (video, testimonials) land on the SAME key rather than minting a new one each time",
    legacyBehavior:
      "none. VERIFIED 2026-08-01: `computeLegacyFreeV1Grant` (entitlements.ts) only ever sets `{ features: { custom_templates: true }, limits: {...} }` — it never touched `appearance_custom` and therefore never touched this key either. `scripts/entitlements/legacy-free-recompute.cjs` only recomputes the CANONICAL_CAPS numeric limits, not this feature. No grant migration is needed: the gallery capability was never granted to the legacy_free_v1 cohort under the old appearance_custom gate, so splitting it onto a new key changes nothing for existing grants.",
    scope: "artist",
    serverEnforcement: "exists", // richContentBlocksAllowed (entitlement-gates.ts), a GRANT gate (!disabled && canAccess). Enforced at the hub RENDER (app/[slug]/hub/page.tsx) and at SAVE on BOTH write paths: saveBioPageAction + uploadGalleryImageAction + importGalleryImageFromUrlAction (web actions.ts) and POST /api/mobile/settings/hub (native), all via the shared gateMediaBlocksForSave (bio-page.ts). FD4 (2026-08-01, SUPERSEDES GB2): importGalleryImageFromUrlAction downloads an artist-supplied URL server-side under an SSRF guard (ssrf-guard.ts: resolves the hostname, refuses a private/loopback/link-local/cloud-metadata address, `redirect:"error"`) plus a rate limit (checkGalleryImportRateLimit, ratelimit.ts, 20/artist/hour) before spending Inklee's own egress on it. FD10 (2026-08-01, same key, second use): resolvedSurfaceContent (surface-content.ts) applies the SAME gate at the shop/teaser RENDER; saveSurfaceContentCore (surface-content-write.ts) applies it at SAVE, refusing an unentitled write before touching storage and refusing (not fail-safe) on a plan-read blip, mirroring appearance-write.ts's saveAppearanceCore
    databaseEnforcement: "exists", // settings.bio_page JSONB, parser-validated (parseBioPageSettings keeps the block regardless of plan so a downgrade never loses data; entitlement is an application-layer gate, same pattern as every settings-JSONB capability). FD4: the parser ALSO now restricts a gallery image's url to Inklee's own storage (sanitizeHostedGalleryImageUrl, bio-page.ts: a supabase.co host under the logos bucket's public marker), so a hand-crafted save payload naming an external URL is dropped, not merely a UI-level restriction. FD10: a SIBLING settings.surface_content JSONB namespace (surface-content.ts), same discipline — the pure parser keeps stored content regardless of plan, and hero media reuses sanitizeHostedGalleryImageUrl rather than a second host check
    frontendBehavior: "partial", // web editor (bio-page-form.tsx) gates the add button + upload/import + shows a Plus explanation for an unentitled artist. FD4 (2026-08-01): the permanent free-text image-URL field is REMOVED; replaced by a per-image thumbnail preview + an "Import from URL" control alongside "Upload image", both feeding the same GalleryUploadResult tail. Native editor renders a read-only "N images - edit on the web" summary and does not add native upload OR import (D4/FD2: full native editing, including import, is a separate follow-on slice). FD10: a second web editor on the Goods page (shop-content-form.tsx) for hero/intro/featured collections, direct-upload only (no "Import from URL" companion for the hero image this slice — a deliberate scope cut, see the FD10 implementation note in plus-build-time-decisions.md)
    mobileSupport: "partial", // native read + gated add-button disable via richBlocksAllowed from GET /api/mobile/settings/hub; the guarded lookups (?.label ?? "Block", ?.addLabel ?? type) keep an older build safe on this block type. Full native upload/edit/reorder parity is FD2 (separate slice, not this one). FD10's surface content has NO native editor at all this slice (page-appearance.tsx, the one native appearance screen, is global-only and styling-only) — tracked in docs/web-native-parity.md as web-only by decision, not a native mobileSupport gap for THIS row's gallery half
    downgradeBehavior:
      "Existing gallery blocks are preserved in settings and hidden ONLY at render (D2: downgrade hides, never deletes); an unrelated edit (reordering links, editing a headline) never strips a saved gallery, because gateMediaBlocksForSave keeps any unchanged media block by id + deep-equality. FD10: same posture for surface content — parseSurfaceContentSettings has no entitlement awareness, so a downgrade hides shop hero/intro/featured collections at render only; a re-upgrade sees the stored record again unchanged",
    feeImpact: "none",
    analyticsEvents: "none required",
    pricingPageClaim:
      "'Customise your booking page with templates, galleries and flexible sections' (founder ruling FD13, 2026-08-01; added to PLUS_BENEFITS). Release-state-verified before adding: the gallery half of this claim is genuinely built (web upload/render/save-gate all exist per this row), enforced dark (zero Plus artists today, so inert until launch)",
    termsClaim: "none",
    operationalState:
      "MINTED 2026-08-01 (founder ruling FD1, SUPERSEDES D1). Split OFF `appearance_custom`: image_gallery previously rode the styling entitlement, which meant an artist could not get a gallery without also being sold the custom appearance layer (and vice versa). Every gallery gate now reads this key: hub render, both save paths (web + native), and the two editors. A fresh EAS build is a prerequisite before this is granted to anyone on mobile (same gate as goods_collections/goods_bundles): the guard prevents a crash on older builds, but the native summary + gated add button only exist from the next build onward. EXTENDED same day (founder ruling FD4, SUPERSEDES GB2): the permanent free-text gallery URL field is removed and replaced by a guarded server-side 'Import from URL' action (`importGalleryImageFromUrlAction`), and the parser now refuses any non-Inklee-hosted url outright — so after this change there is no way for an external URL to enter a gallery block at all, closing the door the old GB2 posture had left open. EXTENDED again 2026-08-01 (founder ruling FD10, CONFIRMS S1/S6): a second, independent CONTENT use of this key for the \"shop\" surface (hero/intro/featured collections), scoped to ONLY the shop surface (not hub/bookingForm/largeProject/guestSpots — the latter has no renderer to build against; see the FD10 implementation note). Dark alongside the gallery half at 0 Plus artists today.",
    testCoverage: "exists", // entitlement-gates.test.ts (GRANT-shape table + a dedicated grandfather-does-not-imply test), gate-media-blocks.test.ts (pure save-gate: entitled/unentitled/unchanged-preserved), upload-gallery-image.test.ts (entitlement-first upload + import refusal, rate-limit refusal, ceiling), bio-page-settings.test.ts (parser incl. the FD4 hosted-only restriction + sanitizeHostedGalleryImageUrl unit tests), ssrf-guard.test.ts (private/reserved-IP detection, DNS-rebinding-shaped refusal), gallery-url-import.test.ts (scheme/SSRF/content-type/size incl. mid-stream abort, clear per-failure messages). FD10 adds: surface-content.test.ts (shared parser, 25: round trip/hostile input/hero-host restriction; server resolver, 6: entitlement boundary/fail-safe/downgrade-reupgrade round trip), surface-content-write.test.ts (15: entitlement gate, merge, the five null-clears-vs-inherits cases), collections.test.ts (+7: resolveFeaturedCollections dangling/archived/hidden/visibility-precision)
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
    name: "Plus Linkhub blocks (booking form, goods, guest spots, flash, books-open, gallery, featured collection)",
    entitlementKey: "page_blocks (proposed)",
    productArea: "inklee-page",
    freeBehavior:
      "Standard links + custom text sections (text sections shipped free, stays free)",
    plusBehavior: "Seven rich blocks (six feature blocks + featured_collection reference block)",
    legacyBehavior: "none",
    scope: "artist",
    serverEnforcement: "partial", // featured_collection: server-rendered from collection data (P5d). The other six: block-kind plumbing absent; underlying components exist on the booking page
    databaseEnforcement: "partial", // featured_collection stored in bio_page JSONB; parser dedupes on collectionId. The others: absent
    frontendBehavior: "partial", // featured_collection: hub renders the collection teaser (P5d). ShopTeaser/TravelCard/deriveBooksOpen/flash exist as booking-page components
    mobileSupport: "partial", // hub editor native twin exists; featured_collection type added (P5d, breaking wire change gated by EAS build)
    downgradeBehavior: "Blocks hidden, configuration retained",
    feeImpact: "none",
    analyticsEvents: "block_added, block_clicked (required)",
    pricingPageClaim: "none yet",
    termsClaim: "none",
    operationalState:
      "PARTIALLY BUILT: featured_collection shipped (P5d) as a reference block that surfaces a shop collection on the Hub. The other six feature blocks are unbuilt (the underlying components exist on the booking page but the Hub block-kind plumbing is absent). NOTE hub is PERMANENTLY FREE by founder decision (features.ts), so a page_blocks entitlement gate would need that revisited",
    testCoverage: "partial", // featured_collection: bio-page parser tests including dedupe. The others: absent
    launchReadiness: "build",
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
    serverEnforcement:
      "exists: canSeeAdvancedAnalytics gates getArtistHubAnalytics + getArtistFeeSavings (web + mobile route)",
    databaseEnforcement:
      "exists: artist_page_events + artist_page_rollups (migration 0130), RLS per-artist SELECT; fee actuals from booking_requests.platform_fee_collected_cents + orders.platform_fee_amount (migration 0116)",
    frontendBehavior:
      "exists: /analytics has three tabs: Bookings (all tiers), Hub (Plus: page metrics), Savings (Plus: deposit/goods fees, hypothetical comparison, subscription cost, net benefit)",
    mobileSupport:
      "exists: /api/mobile/analytics returns hubAnalytics + feeSavings (both null for Free); needs a build",
    downgradeBehavior: "Access ends; aggregates retained per retention policy",
    feeImpact: "none",
    analyticsEvents:
      "page_view (wa teed via rollup), link_click + block_click (artist-events beacon), booking_submitted + goods_order_completed (rollup from existing tables)",
    pricingPageClaim: "Advanced booking analytics (overclaims today)",
    termsClaim: "Terms section 11 names deeper analytics",
    operationalState:
      "capability paused, now WIRED; unparking activates the Free/Plus split",
    testCoverage: "gate tested (entitlement-gates.test.ts); 24 pure-function tests; savings query server-tested via shared types",
    launchReadiness: "ready",
  },
  // ------------------------------------------------------------ booking form
  {
    name: "Booking-form customization (colors, templates, confirmation page, custom slug)",
    entitlementKey: "form_custom (+ appearance_custom for the visual layer)",
    productArea: "booking-form",
    freeBehavior:
      "Preset themes, artist logo, the clean layout, cover image (Free for all, founder Ruling 1, 2026-07-31; see operationalState)",
    plusBehavior:
      "Custom colors, visual templates, custom confirmation page, custom URL slug (cover image is NOT a Plus perk; it is free for every artist, see Ruling 1)",
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
      "UPDATED 2026-08-01 (founder ruling FD13, FINAL): 'Customise your booking page with templates, galleries and flexible sections' added to PLUS_BENEFITS. This cell previously read 'none yet (...previously read \"Fully customisable booking template...\"; that claim does not appear in PLUS_BENEFITS, which was corrected 2026-07-28 to remove it pending full scope closure...)'. Release-state-verified before adding: templates via surfaceAppearance/form_custom are 'exists'/'ready' (this row); galleries are the new rich_content_blocks capability (see that row, 'exists'/'build'); flexible sections is the pre-existing Hub block arrangement. Never 'fully customisable' and no page-builder implication (forbidden phrasing, FD13).",
    termsClaim: "none",
    operationalState:
      "BUILT 2026-07-28. form_custom is live (not parked): with zero Plus artists it grants nothing, so it is inert today. RESOLVED 2026-07-31 (founder Ruling 1): this row previously read 'OPEN: the spec lists cover image as Plus-only but it has shipped FREE for months and 3 of 19 production artists use one; built grandfathered pending the founder decision recorded in plus-commercial-packages.md §7.' Cover image is now Free for all by ruling, not a grandfather-only carve-out for the pre-existing three; every Free artist keeps it via `freeTierView`. plus-commercial-packages.md §7 and §6 updated accordingly.",
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
      "PARKED (moot: zero templates exist in prod); subjects force-reset by design. PAGE GATE added 2026-07-29: settings/emails/page.tsx shows banner + disables template buttons when !entitled, so a Free artist discovers the restriction at navigation rather than at save",
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
  // ---------------------------------------------------------------- payments
  {
    name: "Card deposit collection",
    entitlementKey: "deposits (live gate) + card_deposit_collection (fine key)",
    productArea: "booking-form",
    freeBehavior:
      "Manual deposit tracking only (offline / bank transfer); Free artists can request deposits but clients cannot pay by card through Inklee",
    plusBehavior:
      "Card deposit collection through Stripe Connect; the client pays on the booking page with no redirect",
    legacyBehavior:
      "GRANTED where an existing Connect account was already onboarded; the legacy_free_v1 cohort carries the deposits override",
    scope: "artist",
    serverEnforcement: "exists", // getDepositCollection three-factor gate (pause, entitlement, Connect routing) + requestDepositCore re-derives at charge time
    databaseEnforcement: "exists", // account_overrides grant; Connect routing via stripe_account_id + stripe_charges_enabled
    frontendBehavior: "exists", // booking detail page + mobile deposit form both consume getDepositCollection
    mobileSupport: "exists", // shared deposit-collection module; mobile deposit form reads the same gate
    downgradeBehavior:
      "Card collection stops; manual deposit tracking continues; existing paid deposits and their refund routes are unaffected",
    feeImpact:
      "3% platform fee on the deposit basis (v1 flat rate); sponsored artists pay 0% until the budget is exhausted",
    analyticsEvents: "deposit_requested, deposit_paid (exist in audit_log)",
    pricingPageClaim: "Accept card deposits",
    termsClaim: "Terms section 11 names card deposits",
    operationalState:
      "LIVE and enforced since launch. Call sites MIGRATED (2026-07-31) from the broad `deposits` key to the fine `card_deposit_collection` key. The kill switch still uses `deposits` (platform-wide pause). Run scripts/entitlements/migrate-deposits-key.cjs against production to add card_deposit_collection to any admin-granted deposits overrides",
    testCoverage: "exists", // deposit-collection gate tests, booking core refusal tests, e2e
    launchReadiness: "ready",
  },
  {
    name: "Appointment payment requests (create, send, pay, settle, refund)",
    entitlementKey:
      "appointment_balance_collection, full_appointment_payment_collection, appointment_payment_line_items, appointment_payment_refunds, appointment_payment_insights",
    productArea: "booking-form",
    freeBehavior:
      "Manual deposit tracking only; no structured payment requests, no itemized billing, no card collection beyond the initial deposit",
    plusBehavior:
      "Structured payment requests with immutable revisions, itemized line items (services, products, deposits), server-authoritative quoting, card collection, automated settlement and allocation, classification-aware refunds",
    legacyBehavior: "none",
    scope: "artist",
    serverEnforcement: "exists", // A1-A8: create/revise/send/cancel/expire cores, quote, intent, settlement, refund; all gate on the fine payment keys
    databaseEnforcement: "exists", // migrations 0125-0128: payment_requests (immutable revisions, 13-state lifecycle), payment_request_lines (classified), payment_allocations; RLS + composite FKs
    frontendBehavior: "exists", // A6: client payment page at /pay/[token] with itemized breakdown
    mobileSupport: "exists", // A7: mobile API routes for payment request CRUD
    downgradeBehavior:
      "Existing payment requests stay readable and their settlement/refund routes continue working; new requests cannot be created",
    feeImpact:
      "Fee computed per line classification through computeOrderFees (A3 unified the two legacy fee sources); fee schedule version stamped on every transaction",
    analyticsEvents:
      "payment_request_sent, payment_settled, payment_refunded (exist in audit_log)",
    pricingPageClaim:
      "UPDATED 2026-08-01 (founder ruling FD13, FINAL): 'Collect deposits and full appointment payments' added to PLUS_BENEFITS, replacing the narrower 'Collect card deposits in-app'. Release-state-verified BEFORE adding, per this row: A1-A8 are fully built (create, revise, send, pay, settle, refund all exist), so the claim is true in code today even though it ships dark (zero Plus artists, so inert until launch — same posture as every other Plus capability pre-launch).",
    termsClaim: "none",
    operationalState:
      "BUILT (A1-A8, migrations 0125-0128). Live code, not parked: with zero Plus artists, the entitlement gates refuse all requests, so the system is inert today. Connect onboarding gate (A8) prevents Free artists from creating a Connect account they cannot use",
    testCoverage: "exists", // 27 spec test obligations claimed and delivered: pure-model tests, core tests, settlement tests, refund tests, fee unification tests, collection tests
    launchReadiness: "ready",
  },
  // ------------------------------------------------------------------ goods
  {
    name: "Goods selling (all tiers) with active-product caps",
    entitlementKey: "goods_module + active_products cap (ratified 2026-07-28, re-ratified founder Ruling 3 2026-07-31; CANONICAL_CAPS.active_products in entitlements.ts, not merely proposed)",
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
    entitlementKey:
      "goods_discounts, goods_scheduling, goods_collections (live keys); goods_tools (proposed, for preorders/bundles/shop-custom/analytics)",
    productArea: "goods",
    freeBehavior: "Basic listing, flat variants, basic stock",
    plusBehavior: "Full toolset; scheduled drops are the headline",
    legacyBehavior: "none",
    scope: "artist",
    serverEnforcement: "partial", // discounts: create/apply gated (0118, P5). scheduling: write gated. collections: full CRUD gated (P5d, 0120-0124). preorders/bundles: absent
    databaseEnforcement: "partial", // discount_codes (0118 + 0123 write RLS), product_collections + collection_items (0120-0122, composite FKs, convergent), scheduling columns exist. bundles/preorders: absent
    frontendBehavior: "partial", // discounts + collections: web editor + public shop surface. scheduling: write gate. preorders/bundles/shop-custom: absent
    mobileSupport: "partial", // discounts + collections: mobile API routes. scheduling: mobile gate. preorders/bundles: absent
    downgradeBehavior:
      "Tool access ends; product data + orders + collection assignments + discount definitions retained untouched",
    feeImpact: "discounts feed the fee base (subtotal after discounts)",
    analyticsEvents: "drop_scheduled, discount_redeemed (required)",
    pricingPageClaim: "none yet",
    termsClaim: "none",
    operationalState:
      "FOUR of nine tools BUILT: discount codes (P5, migration 0118, gate goods_discounts), scheduling gates (goods_scheduling), collections (P5d, migrations 0120-0124, gate goods_collections + featured_collection hub block), sales analytics (2026-07-31, computeSalesAnalytics with Plus-gated trends on /goods/sales + mobile route). None parked: with zero Plus artists, entitlement gates refuse all requests. REMAINING greenfield: preorders, drops, bundles, shop customization",
    testCoverage: "partial", // discounts: RLS + gate tests. collections: 51 db tests, TOCTOU-proven delete, convergent migrations. scheduling: gate tests. sales analytics: 13 pure tests. preorders/bundles: absent
    launchReadiness: "build",
  },
  // ------------------------------------------------------------------- fees
  {
    name: "Deposit platform fee differentiation",
    entitlementKey: "fee schedule (versioned data, not an entitlement)",
    productArea: "fees",
    freeBehavior: "3% of deposits collected through Inklee",
    plusBehavior: "0.5%",
    legacyBehavior: "3% (grandfathered flat rate under v2; encoded via the `legacy` appointment tier + resolveAppointmentTier, F14 decided 2026-07-31)",
    scope: "transaction",
    serverEnforcement: "partial", // A3 unified the two legacy fee sources into computeOrderFees; legacy tier wired via appointmentFeeTier at all 3 sites; ACTIVE_FEE_SCHEDULE_VERSION still v1 (flat 3%)
    databaseEnforcement: "partial", // fee_schedule_version column stamped on payment_requests (0125) and orders; v2 defined in fee-schedule.ts but ACTIVE still v1
    frontendBehavior: "partial", // fee shown flat; payment page displays the quoted fee
    mobileSupport: "partial",
    downgradeBehavior:
      "Next transaction prices at the Free rate; past fees untouched",
    feeImpact:
      "SUPERSEDES OQ-7 flat-3%; fee actuals must start persisting (savings dashboard input)",
    analyticsEvents: "fee snapshot per transaction (required)",
    pricingPageClaim: "3% all-in today (needs update)",
    termsClaim: "deposit fee named in money copy (needs update)",
    operationalState:
      "RESOLVED 2026-07-28: card collection is PLUS-ONLY, so there is no Free rate (n/a, not 3%). A3 (2026-07-29) UNIFIED the two divergent fee sources into computeOrderFees so v2 cannot produce different numbers on different code paths. Approved rates live in fee-schedule.ts as v2, DEFINED but NOT ACTIVE until Stage 4 (flip ACTIVE_FEE_SCHEDULE_VERSION) plus accountant sign-off",
    testCoverage: "partial", // fee unification characterization tests (appointment-fee-unification.test.ts); order-fees tests pin v1 as active
    launchReadiness: "build",
  },
  {
    name: "Goods platform fee",
    entitlementKey: "fee schedule (versioned data)",
    productArea: "fees",
    freeBehavior: "5% of subtotal after discounts, ex VAT and shipping",
    plusBehavior: "1%",
    legacyBehavior: "5% (the Free goods rate; nothing to grandfather on goods, legacy maps to free in laneRateBps, F14 decided 2026-07-31)",
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
    entitlementKey: "analytics (shared with Linkhub analytics: delivered as the Savings tab)",
    productArea: "insights",
    freeBehavior: "Savings prompts only in billing/revenue surfaces, no popups",
    plusBehavior:
      "Fees paid, saved vs Free, subscription cost, net benefit, comparison period",
    legacyBehavior: "none",
    scope: "artist",
    serverEnforcement:
      "exists: getArtistFeeSavings gated by canSeeAdvancedAnalytics (fee-savings-query.ts)",
    databaseEnforcement:
      "exists: fee actuals from booking_requests.platform_fee_collected_cents + orders.platform_fee_amount (migration 0116)",
    frontendBehavior:
      "exists: Savings tab on /analytics (deposit fees + goods fees, hypothetical comparison under the other tier, subscription cost, net benefit). Under V1 both tiers pay 3%/0% so savings = 0 with an explanatory note",
    mobileSupport:
      "exists: /api/mobile/analytics returns feeSavings (null for Free)",
    downgradeBehavior: "Dashboard hidden; data retained",
    feeImpact:
      "consumes persisted fee actuals; claims only from actual eligible transactions",
    analyticsEvents: "n/a (it IS an analytics surface)",
    pricingPageClaim: "none yet",
    termsClaim: "none",
    operationalState:
      "BUILT 2026-07-31. Under V1 (active schedule) savings are zero because both tiers pay identical rates; real differentiation appears when V2 activates (Stage 4). Gated by analytics capability (paused = everyone sees everything)",
    testCoverage:
      "exists: 3 pure-function tests (fee-savings.test.ts); savings query server-tested via shared types",
    launchReadiness: "ready",
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
    serverEnforcement:
      "exists: founder-offer.ts resolveFounderOffer + recordFounderOfferRedemption; eligibility decided server-side against a policy row; cohort-position unique constraint holds the cap under concurrency",
    databaseEnforcement:
      "exists: founder_offer_policy (0 rows = offer closed by default), founder_offer_redemptions (unique on artist_id + cohort_position)",
    frontendBehavior: "exists", // C2: yearly option renders for everyone (no longer gated on founder-offer eligibility)
    mobileSupport: "exists", // no IAP by design; nothing to do
    downgradeBehavior: "per the decided offer terms (founder-only)",
    feeImpact: "none",
    analyticsEvents: "offer_redeemed (proposed)",
    pricingPageClaim: "none yet",
    termsClaim: "none",
    operationalState:
      "CORRECTED 2026-07-28: the universal yearly coupon is REMOVED. Eligibility is decided server-side (founder-offer.ts) against a policy row that must exist for the offer to be open, so the default state is closed. The cap holds under concurrency via a unique cohort position; one per account, non-transferable, and cancelling never frees a slot.",
    testCoverage:
      "exists: 12 pure-function tests (eligibility: position 1/100/101, window open/closed/not-started, monthly refusal, already-redeemed, no-policy fail-closed, lookup-error fail-closed; recording: success, concurrent race, duplicate artist)",
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
