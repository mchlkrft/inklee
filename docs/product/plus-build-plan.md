# Plus package build plan

**Status:** engineering plan against the confirmed spec (`plus-product-spec.md`), grounded in the 2026-07-28 implementation audit (12-agent adversarial pass, 71 capability assessments, all 6 verified exists-claims held). Registry: `packages/shared/src/plus-capability-registry.ts`. Legal posture: settled, build first, counsel last (AGENTS.md standing rule).

Coverage headline: of the confirmed package, **18 capabilities exist, 28 are partial, 25 are absent**. The build generalizes existing patterns rather than inventing machinery: the settings-JSONB + shared-parser family (bio-page.ts), the entitlement engine + gate shapes, the `[data-appearance]` CSS token scoping, the flash-intake sub-path precedent, the 0106 versioned-policy pattern, and the snapshot discipline.

---

## 1. Definition: shared appearance system (the keystone)

One new `profiles.settings.appearance` namespace in the proven settings-JSONB family, with a shared parser in `packages/shared` (the bio-page.ts pattern: one parser serving web render, web editor, native editor via one mobile route; legacy read-through so no migration; merge-writes so siblings never clobber).

- **Model:** `{ palette, typography, buttons, imageTreatment, theme, perSurface: { hub?, bookingForm?, largeProject?, shop?, guestSpots? } }`. Global defaults; each surface overrides only declared properties. Absorbs the existing `cover_color`/`cover_image_url` (legacy read-through) and revives the dormant `form_appearance` value.
- **Render mechanism:** the existing `[data-appearance]` CSS custom-property override scoping (globals.css) generalized to emit per-artist token values server-side. No client-side theme JS.
- **Enforcement:** one proposed entitlement key `appearance_custom` (GRANT shape, like branding): Free reads presets, Plus reads the stored appearance. Server-side at render, exactly like `publicBrandingHidden`.
- **Editors:** web + native in the same slice (parity register rule). The native `<Modal>` theme gotcha applies to any appearance sheet.
- **Size: XL.** ~8 dependents queue behind it; it goes first.

## 2. Definition: large-project mode v1 (smallest coherent record)

Per the spec: define the smallest coherent v1, then challenge sufficiency.

- **Schema (2 tables):** `projects` (artist_id, client identity by customer_email like client notes, title/description, body-area + coverage fields, scale, budget range nullable, status, timestamps) and `project_media` (reference/body photos through the existing image pipeline). **Sessions are NOT a new entity in v1:** a nullable `project_id` FK on `booking_requests` links sessions to a project, preserving one-date-one-booking everywhere downstream (deposits, calendar, emails all just work).
- **Lifecycle v1 (6 states):** submitted, under review, consultation, active, completed/declined, archived. The full 12-state spec lifecycle maps onto these (consultation requested/scheduled collapse into consultation; planning/sessions-proposed/paused collapse into active with the linked bookings carrying the granular truth). Widening an enum later is additive; shipping 12 states with no session engine is ceremony.
- **Intake:** a sub-path intake at `/{slug}/project` on the flash-intake precedent (second public intake writing specialized form_data into the shared pipeline, plus the project row). Uses the confirmed field list; budget range included where legally fine; **no medical questions in v1** (any health intake is separately justified and reviewed, per spec).
- **Artist UI v1:** a projects list + detail (status, media, notes, linked bookings, "create booking request from project").
- **Challenge recorded:** v1 has no consultation scheduling entity and no per-session proposals; a consultation is just a linked booking request. Sufficient for the launch promise (a dedicated long-term record that does not become a standard booking request); the session-proposal engine is post-launch.
- **Size: XL, longest serial chain** (depends on conditional questions for the intake UX; can start with a flat intake and add conditions when [CQ] lands).

## 3. Definition: extended analytics event model

The existing wa collector is anonymous by construction (daily-rotating visitor hash, no artist_id, founder-only reads, 24-month purge). Linkhub analytics is therefore a **parallel artist-keyed plane**, not a read path over the existing store.

- **Events:** `page_view` (hub + booking page, keyed by artist_id via hostname resolution already in the collector), `link_click` (NEW: beacon on hub links + block CTAs), `block_click`, plus the existing server-truth conversions (booking submitted, goods order paid) joined per artist.
- **Storage:** `artist_page_events` (artist_id, surface, event, target key, occurred_at, coarse source/referrer channel reusing the deterministic classifier) + daily rollup table.
- **Retention (defined separately per spec):** raw events 13 months (covers "last 12 months detailed"); rollups + lifetime aggregate counters kept forever (aggregate rows carry no visitor identity, so retention is a product choice, not a GDPR one; note this in the privacy-policy proposal lane).
- **Privacy posture:** same as wa: no raw IP, no persistent visitor ids; artist-keyed but never client-keyed. Never paywall the artist's raw booking/client records; this plane is about page performance, which is Plus.
- **Gate:** the existing `analytics` key, wired at the read paths (web page + mobile route) — the gate exists with zero call sites today.
- **Size: L** (collection beacon + tables + rollups + artist-facing UI + Plus gate + savings-dashboard adjacency).

## 4. Definition: goods fees + refund policy as versioned data

- **Fee schedule:** new policy kinds in the 0106 versioned-policy pattern (`fee_schedule`: kind, version_label, rates {depositFreePct, depositPlusPct, goodsFreePct, goodsPlusPct}, effective_from, is_current). `platformFeeCents` gains a tier + lane parameter reading the current schedule; **every transaction snapshots the schedule version** (new column on booking_requests deposits + orders, in the deposit_policy_snapshot discipline).
- **Fee base (goods):** subtotal after discounts, ex VAT and shipping. v1 basis: order subtotal is goods-only (disambiguated from the combined deposit+goods intent amount) minus discount amounts; VAT and shipping fields land with the goods-tools slice (pickup-only today means shipping = 0 in v1, and the base is explicit from day one).
- **The 0% hole closes first:** the add-on path raises the intent amount but never `application_fee_amount`; `orders.platform_fee_amount` is never written. Both fixed in the first goods-fee slice, under the AGENTS.md money rules (webhook money converges to a target; never release against intent metadata).
- **Refund policy rows** (`fee_refund_policy` kind): the six confirmed cases as data; the refund path reads the current policy. Deltas from today's hardcode: artist cancellation currently returns the fee ALWAYS (target: retain only non-recoverables where permitted) and `charge.dispute.*` webhooks do not exist at all (new webhook family, small but money-path-reviewed).
- **Fee actuals persist** (D21 columns: platform_fee_collected_cents, stripe_fee_cents where derivable) from the first fee slice onward — the savings dashboard's input; history before that is unrecoverable (audit_log JSON only), which the dashboard copy must respect ("since {date}").
- **Size: L overall**, money-path-reviewed throughout.

---

## 5. Development stages

Consumer sales stay closed the whole way (DB-backed launch key). Every stage lands dark or Free-invisible, adversarially reviewed, parity register updated in the same change.

| Stage | Contents | Depends on | Size |
|---|---|---|---|
| **P0 correctness pre-work** | ✅ **DONE 2026-07-28.** Goods `archived` state (migration 0112) + the hard-delete-despite-orders bug fixed (order-guarded delete archives on BOTH surfaces, fail-safe toward archiving, outcome explained web + app); product caps 3/25 wired on create + every unarchive transition, web + mobile, landing DARK behind the parked `entitlement_caps`; durable confirmation now stamps `terms_version` (from the buyer's acceptance row) + `payload_hash` (sha256 of the generated content, sent AND failed-after-generation paths); rejection paths pinned by tests on both surfaces; mobile plan-boundary handling IAP-safe (`plan-errors.ts` strips purchase steering, maps `not_entitled`); capability-registry drift corrected; parity-register gate rows added; branding e2e pass green both directions (`branding-entitlement.spec.ts`, served HTML) → `branding` un-parked in production. DEFERRED BY DESIGN: analytics gate wiring moved to P6 (the earlier directive requires the Free/Plus boundary defined BEFORE enforcement); PLUS_BENEFITS claim copy waits on the founder's two-claims decision. | — | **M** |
| **P1 appearance system** | The keystone (section 1). **P1a FOUNDATION DONE 2026-07-28:** `packages/shared/src/appearance.ts` (model, curated font registry, closed button/theme/surface vocabularies, parser with legacy read-through of `cover_color`/`cover_image_url`/`books_settings.form_appearance`, per-surface override resolution, css-var emission), `appearance_custom` entitlement + capability (GRANT shape, paused = today's look), server resolver `lib/server/appearance.ts` with the Free-tier view (a downgrade drops ONLY the custom layer, never blanks a page) and fail-safe plan reads, hub wired as the proving surface. 23 tests. Emits ZERO css vars when nothing is customized, so every surface can be wired before an editor exists. **P1b DONE 2026-07-28:** web editor (`/settings/appearance`) + native twin (`settings/page-appearance` + GET/PATCH `/api/mobile/settings/appearance`), both through ONE `saveAppearanceCore` (entitlement server-enforced, merge-write so sibling settings keys survive, first save captures the artist's current legacy-derived appearance instead of resetting it); booking form wired (replacing the hardcoded `data-appearance="light"` that made `form_appearance` dead code for months); the emitted tokens now drive rendering through three CSS rules in globals.css. 34 appearance tests.

**Font decision, recorded rather than deferred:** the v1 curated library needs NO vendored assets. `inklee` and `mono` reuse the two `next/font` faces the app already ships; `grotesk` and `serif` are pure system stacks. That satisfies every spec requirement (licensed, reliable loading, no build-time remote retrieval, tested) at zero licensing exposure. The library is deliberately SMALL: expanding it means licensing and vendoring real faces, which is a founder call plus a follow-up slice, not a silent addition.

**P1 REMAINING (small, unblocked):** wire `shop` and `guestSpots` surfaces when those get their own wrappers (the shop currently renders inside the booking-form surface and inherits it), and `largeProject` when P4 creates it. | P0 | **XL** |
| **P2 pages** | **P2a DONE:** 4 Linkhub templates (Clean/Portfolio/Bold/Editorial) as an appearance property, one scaffold + four style maps, `clean` = Free default = today's markup; pickers in both editors. Permanently-free-hub blocker RESOLVED (hub existence stays free; customization is the Plus layer, via the server-enforced entitlement that comment anticipated). **P2b DONE:** five hub feature blocks (booking form, shop, guest spots, flash, books status) as a new content-free block family in bio-page.ts, cap ONE each enforced in the PARSER (not just the editor), rendered from data the artist already keeps, each returning null when its data is empty; the pinned booking CTA yields when the artist positions their own booking block; `loadHubFeatureData` queries only the blocks present and degrades every failure to "no data". Both editors create and explain them. **P2 REMAINING:** the image-gallery block (needs its own media surface: upload, storage, quotas, crop — a different shape of work from the five data-driven blocks, which is why it is separated rather than dropped); custom section layouts beyond block ordering. | P1 | **XL** |
| **P3 booking form** | Revive form_appearance; visual templates; cover image; custom confirmation page; conditional questions [CQ]; slug rename surface; scheduled books-open date | P1 (templates) | **L** |
| **P4 large projects** | Section 2 v1: schema, sub-path intake, artist UI, portal view, project emails | P3 [CQ] soft-dependency | **XL** |
| **P5 goods + fees** | Fee engine + versioned schedule + fee actuals persistence (section 4); goods tools (variants+, inventory alerts, preorders, drops, discounts, bundles, collections, shop customization); goods analytics; dispute webhooks + refund-policy data. Carried decision from the P0 review (accepted-low, deliberate): the order guard checks order_items only, NOT approved-but-unpaid booking_interests, so deleting a product with only an approved interest silently drops that line from checkout composition; the variant reconcile DOES count interests, so the two levels disagree. Decide in P5: extend the guard to approved interests or document the exclusion. | P0; discounts precede the fee base | **XL** |
| **P6 insights** | Linkhub analytics plane (section 3); savings dashboard (consumes P5 fee actuals); Free savings prompts in billing surfaces only | P5 fee persistence, analytics gate | **L** |
| **P7 commercial closure** | Deposit fee tiering (after the founder resolves the Free-deposits flag); founder-offer mechanic (after the universal-coupon contradiction resolves); grandfathering audit vs the final package; downgrade-behavior verification per registry row; `commercial-readiness.cjs` against the registry; caps per the founder's ruling | founder decisions | **M** |
| **P8 endgame** | Final Terms + checkout copy generated FROM finished behavior (versioned workflow); counsel final sign-off package; corrections; approvals recorded against final artifacts; `consumer_sales_launch_approved`; flip; verification purchase + withdraw/refund | everything | **M** |

Parallelism: P2 and P3 overlap after P1; P5 runs parallel to P2-P4 (different plane); P6 tails P5. **Critical path: P0 → P1 → P2 → (P4 tail) → P7 → P8.**

**Realistic estimate, challenged as directed:** P0 ~3-4 working days; P1 ~1.5-2 weeks; P2 ~2-2.5 weeks; P3 ~1-1.5 weeks; P4 ~1.5-2 weeks; P5 ~2-2.5 weeks; P6 ~1 week; P7 ~3-4 days; P8 ~1 week including the counsel round-trip. With P2/P3/P5 overlap, **~8-10 working weeks end to end** at the current one-session-a-day cadence. The estimate assumes the four founder decisions land before P2 starts; each unresolved decision serializes its stage.

## 6. Features most likely to delay launch

1. **The appearance system (P1)** — unbuilt keystone, ~8 dependents, double editor surface. Any scope creep here delays everything behind it.
2. **Large-project mode (P4)** — greenfield entity + lifecycle; the v1 minimalism in section 2 is the protection; holding that line is the schedule.
3. **The goods commerce expansion (P5)** — five greenfield features plus a money-path fee engine under the strictest review rules in the repo.
4. **Linkhub analytics (P6)** — a parallel data plane that looks like a query; the section-3 definition prevents the underestimate.
5. **Decision debt** — four founder items (Free-deposits flag, caps conflict, permanently-free-hub reconciliation, founder-offer coupon contradiction) each block a stage start.

## 7. Final counsel deliverables (the one remaining legal gate)

Submitted as a package when the build is done, per the settled sequence: final Terms (versioned workflow), final checkout disclosures, final business-use declaration, final immediate-performance wording, final withdrawal wording + the online withdrawal flow as implemented, final proportional-compensation wording, **final goods marketplace wording** (artist-as-seller, Inklee-as-infrastructure, the fee lanes), final cancellation + refund wording (incl. the fee-refund policy), and the implementation itself reviewed against the approved posture. Approval recorded against the final versioned artifacts (the legal-artifact integrity chain enforces the binding); then `consumer_sales_launch_approved`; then the flip.
