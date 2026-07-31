# Capability registry

The single human-readable ledger for the app-config plane
(docs/architecture/remote-config-plan.md). **Must stay in lockstep with
`CAPABILITIES` in `packages/shared/src/app-config.ts`** — same rule as the
metric-definitions lockstep in the growth cockpit.

How a kill is flipped: set `DISABLED_CAPABILITIES` (comma-separated) in Vercel
Production and redeploy (~2-3 min to effect; the mobile config response is CDN
cached ≤60s on top). Unset = nothing disabled. The server cores enforce; the
mobile client (0.2.0+) additionally hides entry points via
`GET /api/mobile/config`.

Adding a new capability requires (same PR): a written operational scenario
(what incident flips it, who flips it, what users see), the coherent-fallback
proof, server-side enforcement, and a row here. "We might want to toggle it"
is an automatic rejection.

## Capabilities

| Field | `deposits` | `instagram_import` |
| --- | --- | --- |
| Owner | Founder (flip decision); Claude (wiring) | Founder (flip decision); Claude (wiring) |
| Purpose | Pause in-app CARD deposit collection platform-wide without touching Stripe keys (which would also break refunds + webhook) or account rows | Kill Instagram connect/sync/import during a Meta API incident or an import bug |
| Created | 2026-07-16 | 2026-07-16 |
| Default | Enabled (not listed) | Enabled (not listed) |
| Safe disabled behavior | `requestDepositCore` takes the manual-deposit branch (the same degradation un-entitled artists already get); mobile deposit form shows the manual copy; refunds/mark-received stay available | Server refuses sync/import (`capability_disabled`, 503) and web actions redirect with `error=unavailable`; OAuth callback completes but skips the media pull; disconnect stays available; mobile screen shows the unavailable card; imported designs untouched |
| Platforms | Web + Android (iOS when it ships) — enforcement is server-side, so ALL clients including pre-0.2.0 builds obey | Same |
| Min compatible version | Server enforcement: all versions. Client entry-point hiding: 0.2.0+ | Server: all. Client hiding: 0.2.0+ |
| Review date | 2026-10-16 (quarterly) | 2026-10-16 (quarterly) |
| Removal condition | Never while card deposits exist (permanent operational kill-switch); re-verify wiring at each review | If the Instagram integration is ever removed |
| Docs | docs/architecture/remote-config-plan.md §8; enforcement: `apps/web/src/lib/server/bookings.ts` (requestDepositCore), `apps/web/src/lib/server/app-config.ts` | remote-config-plan.md §8; enforcement: `/api/mobile/instagram/{sync,import}`, `apps/web/src/app/(artist)/flash/instagram/actions.ts`, IG OAuth callback |

### BM-2.0 entitlement enforcement (dark-launched 2026-07-23)

Added with enforcement wired but **parked in `DISABLED_CAPABILITIES` in prod** so
the slice ships inert; remove a name to turn that gate on. Owner: Founder (flip);
Claude (wiring).

> **Correction 2026-07-29: that blanket "parked" claim no longer describes
> production.** Production `DISABLED_CAPABILITIES` now reads exactly
> **`custom_templates,analytics,entitlement_caps`**. Only those three names are
> parked. Every other capability in the table below has its kill switch OFF,
> including `branding`, which the founder authorised un-parking on 2026-07-29.
> **That is an authorised change, not an incident** (`DECISIONS.md`, 2026-07-29
> amendment row; `docs/roadmap.md` §1).
>
> Two things not to over-read. **(1) Kill switch off ≠ entitlement granted.**
> The composition is `!isCapabilityDisabled(x) && canAccess(overrides, x)` for a
> GRANT, so removing a name from the env only hands the decision to the
> per-artist grant. `goods_collections` is the clean example: off the list, and
> deliberately ungranted. **(2)** The three that remain parked are all
> restriction-shaped, so pausing them reverts to permissive and they stay free
> for everyone. Of the four minimum-sellable-v1 marketed capabilities,
> `branding` is therefore currently the only one that genuinely differentiates.
>
> The production env value is founder-reported and was not read from Vercel when
> this correction was written; the code-side composition was verified in-repo at
> `32a15e8`.

Enforcement composition (one truth for web + mobile):
`apps/web/src/lib/server/entitlement-gates.ts`. Server enforces on all clients;
mobile 0.2.0+ additionally hides entry points.

| Name | Purpose | Safe disabled (paused) behaviour | Enforcement |
| --- | --- | --- | --- |
| `branding` | Remove the public "made with Inklee" footer for Plus | Footer stays for **everyone** (today's behaviour); removal is a Plus perk | `brandingRemoved`; the 5 `app/[slug]/**` public pages |
| `custom_templates` | Restrict editing email-template bodies to Plus | Every tier can **edit** (today's behaviour); existing bodies always keep SENDING regardless | `canEditTemplates`; `settings/emails` save action + mobile email-templates route |
| `analytics` | Gate advanced analytics to Plus (for all, no grandfather) | Advanced analytics visible to **everyone** while paused (current production state: `analytics` is still named in `DISABLED_CAPABILITIES`) | **WIRED as of the P6 build, corrected 2026-07-31 (founder Ruling 5).** This cell previously read "DEFINED, NOT WIRED" per a 2026-07-28 audit finding that `canSeeAdvancedAnalytics` had zero production call sites; that finding was true when written and is no longer true. The gate now has 4 real call sites: `getArtistHubAnalytics` (`artist-analytics-query.ts:20`), `getArtistFeeSavings` (`fee-savings-query.ts:12`), the web goods-sales page (`goods/sales/page.tsx:96`), and the mobile goods-sales route (`api/mobile/goods/sales/route.ts:75`), all gated via `canSeeAdvancedAnalytics` (`entitlement-gates.ts:147-149`). Boundary: basic operational totals stay Free; Hub analytics + fee savings + goods sales trends are Plus, enforced server-side on both platforms. Un-parking `analytics` from `DISABLED_CAPABILITIES` is the remaining activation step, not a wiring gap |
| `entitlement_caps` | Enforce the custom-field / active-trip / studio-library / active-product caps (block-new, keep-existing) | Caps **not enforced** (unlimited); existing items never touched | `capState`; the field/trip/studio/product create paths (web + mobile) + the product unarchive transitions |
| `appearance_custom` | Gate the CUSTOM appearance layer to Plus (typography, button treatment, per-surface overrides, non-preset accents) | Every surface renders the **Free appearance**, which is today's look: preset cover color + cover image + theme all still apply, only the custom layer drops. Visually inert when paused | `appearanceCustomAllowed` via `surfaceAppearance`; every public surface on the shared appearance system |
| `form_conditional` | Gate booking-form show/hide question logic to Plus (Plus build P3) | Conditions are **ignored** and every question shows. That direction is deliberate: honouring a condition for an artist who is not entitled would keep questions hidden from their clients, which nobody notices until a booking arrives missing information. Stored conditions are never destroyed, and an unchanged one survives an unrelated field edit | `conditionalQuestionsAllowed`; `applyConditionEntitlement` on the public render + submit, `conditionWriteAllowed` on the 2 web actions + 2 mobile field routes |
| `form_custom` | Gate the non-visual booking-form customization to Plus: custom confirmation page, custom URL slug (Plus build P3). The VISUAL layer is `appearance_custom` and is deliberately not duplicated here | The **default** confirmation page for everyone, which is today's behaviour. Saved custom wording is retained, just not shown | `formCustomAllowed`; `request/submitted` render + `saveConfirmationCore` (web action + mobile route) |
| `large_projects` | Gate large-project mode to Plus (Plus build P4) | The public `/{slug}/project` intake **404s** (no half-working sub-path on an un-entitled artist's page) and no new project records are created. Existing projects stay fully READABLE and editable by their artist: a downgrade must never hide long-term records that have live bookings attached, the same principle that keeps email-template bodies sending after editing is gated | `largeProjectsAllowed`; the `[slug]/project` route + the intake submit core + the artist project actions |
| `goods_discounts` | Gate discount codes to Plus (Plus build P5b) | Codes stop APPLYING at checkout and no new ones can be created, but existing rows are KEPT and are never deleted: a published code is a promise an artist made, and its redemption history is what a sales report is made of. The client is told the code is not valid for their order, in the same words used for every other rejection | `goodsDiscountsAllowed`; `resolveDiscount` on the checkout prepare path (checked on APPLY, not only on create) + `saveDiscountCore` |
| `goods_scheduling` | Gate scheduled drops, preorders and low-stock alerts to Plus (Plus build P5c, spec §9) | No NEW drop time, preorder flag or stock threshold can be SET; the fields disappear from the product form and the save action strips them. An EXISTING drop date is still honoured, deliberately: the opposite direction would put a limited piece on sale before its announced time, which is the harm the feature exists to prevent. Note this is the mirror of `form_conditional`, where ignoring the rule shows MORE and is therefore the safe direction | `goodsSchedulingAllowed` via `applySchedulingEntitlement` on both product write paths. The READ rule (`productAvailability`) is ungated by design and enforced at all THREE public gates: the shop teaser, the checkout catalogue, and the line composer that re-checks before payment |
| `goods_collections` | Gate shop collections to Plus (Plus build P5d, spec §9) | Collections cannot be created, edited, archived, reordered or have products assigned, and the public shop renders ONE ungrouped list, which is exactly how it looks today. Existing collections and their membership are KEPT, so re-entitling restores the arrangement rather than asking the artist to rebuild it | `goodsCollectionsAllowed` on EVERY core in `server/collections.ts` — all **EIGHT** of them: `saveCollectionCore`, `reorderCollectionsCore`, `setCollectionArchivedCore`, `deleteCollectionCore`, `addProductToCollectionCore`, `removeProductFromCollectionCore`, `reorderCollectionProductsCore`, `setProductCollectionsCore` (`grep -n requireEntitlement apps/web/src/lib/server/collections.ts` → 8 call sites, at `:76`, `:133`, `:163`, `:200`, `:239`, `:291`, `:313`, `:345`) — and **on the public read** via `publicCollectionsForArtist`, which returns empty arrays that the pure grouping function renders as a flat shop. An earlier version of this row said the public grouping "needs no gate of its own" because it is pure. That was true of the function and wrong about the FEATURE: without a gate on the read, an artist who lapsed to Free kept a grouped public shop. The gate belongs with the read that feeds it. **Correction 2026-07-29:** this cell said "EVERY core" and then listed SEVEN, omitting `setProductCollectionsCore` — the one that writes a product's whole membership set at once, and therefore the last one you would want silently missing from a gate list. It IS gated (`collections.ts:345`); the LIST was incomplete, not the enforcement. Corrected above and expanded to name every core, so the next reader can check the claim by counting instead of trusting it. ⚠️ **Enforcement is branch-only** (`feat/p5d-collections`); `goods_collections` is deliberately UNGRANTED, and a fresh EAS build is a hard prerequisite before it is granted to anyone (see the wire hazard in `docs/web-native-parity.md`) |
| `goods_bundles` | Gate product bundles to Plus (Plus build Stage 3, spec §9): a named group of products sold at one set price | No bundle can be created, edited, archived, reordered or have products assigned, and the public shop shows no bundle offers. Existing bundles and their items are KEPT (never deleted), so re-entitling restores the offer. A GRANT (`!disabled && canAccess`): paused reverts to today (no bundles). Delete is archive-first (B4), so there is no non-atomic emptiness check to race (the #19 lesson designed out) | `goodsBundlesAllowed` on every core in `server/bundles.ts` (`saveBundleCore`, `reorderBundlesCore`, `setBundleArchivedCore`, `deleteBundleCore`, `addProductToBundleCore`, `removeProductFromBundleCore`, `setBundleItemsCore`) + the public read `publicBundlesForArtist` (fail-flat). ⚠️ **Branch-only** (`feat/p5d-collections`), deliberately UNGRANTED; the PAYABLE checkout is a separate follow-on slice, and a fresh EAS build is a prerequisite before granting (new mobile route) |
| `appointment_payments` | Gate appointment payment REQUESTS to Plus (Plus build P9, `plus-payments-architecture.md` §1 and §3). ONE noun for the whole payment-request feature, the same way `deposits` is one noun for the whole card-deposit path. The per-artist axis is separate and is the SEVEN payment entitlement keys | No payment request can be CREATED, REVISED or SENT, which is exactly today's behaviour because none exists yet. Existing requests stay readable, **cancellable and expirable**: stopping a live request for money must keep working while the capability is paused, and expiry is a safety property of a link, so both are deliberately ungated | `requirePaymentEntitlement` in `server/appointment-payments.ts`, on `createPaymentRequestCore`, `revisePaymentRequestCore` and `sendPaymentRequestCore` (3 call sites). Send re-derives the gate from the STORED row, so a request composed while entitled cannot be sent after a downgrade. ⚠️ `isCapabilityDisabled` is FAIL-OPEN by design, so this pause is an operational kill switch, NOT what keeps P9 dark: what keeps it dark is that nothing calls these cores yet (no action, no route, no UI until A6/A7) and all seven entitlement keys are Plus-only. Add the name to `DISABLED_CAPABILITIES` before A3 wires Stripe |
| `tattoo_map` | Kill switch for the NATIVE tattoo-map surface (2026-07-26). Default: ENABLED (not in `DISABLED_CAPABILITIES`); list it there to pause | Nav entry hidden + discover screen shows an unavailable message + its queries stop (client); every `/api/mobile/map/*` route refuses `capability_disabled` (server); the WEB map is separately gated by `NEXT_PUBLIC_TATTOO_MAP` (the platform launch gate, which the mobile routes also re-check) | `mapMobileGate` in `api/mobile/map/_lib.ts`; `useCapability("tattoo_map")` in `travel/index.tsx` + `travel/discover.tsx` |

Removal condition: never while the tiers exist (permanent entitlement enforcement); re-verify wiring each review.

## Config keys (GET /api/mobile/config)

| Key | Source env | Semantics | Fail direction |
| --- | --- | --- | --- |
| `minVersion` / `updateRequired` / `updateUrl` | `MOBILE_MIN_VERSION[_ANDROID\|_IOS]`, `MOBILE_UPDATE_URL` | Hard update floor (whole-app recall). Identical to the legacy `/api/mobile/min-version`, which pre-0.2.0 builds keep calling; both are built by `buildMobileAppConfig` | Fail-open (unset = 0.0.0, nobody blocked) |
| `recommendedVersion` | `MOBILE_RECOMMENDED_VERSION` | Soft update nudge (dismissible home banner in 0.2.0+) | Fail-open (unset = no banner) |
| `disabledCapabilities` | `DISABLED_CAPABILITIES` | The grouped capability kill list (names above) | Fail-open (unset/malformed = nothing disabled) |

## Quarterly cleanup checklist

- Any capability never flipped since the last review? Fine — kill-switches are
  supposed to idle. Re-verify the wiring still exists (grep
  `isCapabilityDisabled`).
- Any config key unreferenced in code? Delete it.
- Any behavior controlled by TWO mechanisms (env gate + capability, flag +
  entitlement)? Consolidate to one owner.
- Any `clientAtLeast` emission floor below the fleet minimum? Delete the
  branch.
- Anything in config that has become permanent product state? Move it to the
  database / entitlements.
