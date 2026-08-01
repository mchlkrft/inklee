# Plus build-time decisions (provisional, pending review)

**Founder directive, 2026-07-31.** During the Plus build, do not stop for
approvals of ANY kind: counsel, accountant, or founder. When a decision surfaces
while building, make the most defensible call, implement it, and record it here
with the reasoning and the alternatives considered. **Nothing blocks the build.**
At the end, this whole log goes to the relevant owner (counsel / accountant /
founder) for confirmation or override in one pass.

This is the "build first, counsel last" rule (AGENTS.md, 2026-07-28) widened to
all decision owners and applied operationally: the entries below are
PROVISIONAL. None is an approved position. Draft legal copy and legal-adjacent
choices here are described as provisional, never as approved.

**The one hard line (unchanged).** Making and building against a provisional
decision is NOT the same as going live. Irreversible live-money and activation
actions still wait for the final sign-off pass this log feeds:
do NOT flip a fee schedule / refund policy to active in production, record a
sales-launch or billing-activation key, or activate consumer billing on the
strength of a provisional entry here. Build it, gate it OFF, log it, review it,
then a human activates. This is exactly why the log exists.

## How to read an entry

- **Decision** — what was chosen and built.
- **Why** — the reasoning.
- **Alternatives** — what else was considered and why it lost.
- **Confirm** — what counsel/founder should confirm or override at the end.
- **Reversible?** — how hard it is to change later (cheap = code/flag; costly =
  data/schema/live money).

Legal-adjacent entries are tagged **[COUNSEL]**; product/UX calls the founder may
want to override are tagged **[FOUNDER]**; pure engineering calls are **[ENG]**.

---

## Log

_(entries appended as they are made, newest at the bottom)_

### 2026-07-31 — Image gallery bio-page block (Stage 3)

**D1 [FOUNDER] — image_gallery is a Plus rich block gated by `appearance_custom`.**
- Decision: the new `image_gallery` hub block is offered only to artists with the
  `appearance_custom` entitlement; the hub itself stays free (Free artists keep
  every existing block).
- Why: `features.ts` (lines 62-79) already records the reconciled founder
  position that the hub is permanently free but "the rich blocks" are Plus
  customization gated by the server-enforced `appearance_custom` / `page_templates`
  entitlements. Gating image_gallery on the live `appearance_custom` gate follows
  that directly, so this is consistent with an existing founder decision rather
  than a new paywall on the hub.
- Alternatives: (a) a new `page_blocks` entitlement (the registry's proposed key)
  rejected because it is not a live, server-enforced entitlement yet, and
  standing one up is more surface for no added correctness; (b) free for everyone
  rejected because the founder framed these as Plus blocks and the reconciliation
  sanctions gating rich blocks.
- Confirm: founder confirms `appearance_custom` is the right gate for rich blocks
  (vs. minting `page_blocks`).
- Reversible? Cheap (swap the gate helper).

**D2 [ENG] — downgrade behaviour: hide at render, preserve in settings.**
- Decision: an unentitled artist's image_gallery blocks are kept in their saved
  settings but not rendered (and the parser keeps them; the save path does not
  strip them). Re-upgrading restores them.
- Why: mirrors the nearest precedent, `featured_collection`, which is gated at
  render (hidden when unentitled) and preserved in settings. Consistent single
  gate point; a re-upgrade restores the artist's work.
- Alternatives: block-new-keep-existing (the large_projects pattern) rejected as
  more complex and less consistent with the nearest rich-block precedent.
- Confirm: none needed (engineering consistency call).
- Reversible? Cheap.

**D3 [ENG] — data shape + limits.** Image URLs must be absolute http(s)
(sanitized, same posture as link blocks, no `mailto:`/`data:`/`javascript:`);
max 12 images per gallery; captions + alt text length-capped; up to 10 gallery
blocks (the standard content-block cap). Why: safe `<img>` rendering on a public
page and sane bounds. Reversible? Cheap (constants).

**D4 [ENG] — native editing deferred to web.** The native editor shows an
image_gallery block as a read-only "edit on the web" summary (count of images);
it does not add native image upload in v1. Why: native image upload is a larger
lift, the public hub renders web-only anyway, and web editing ships the feature
now. Reversible? Additive later. Confirm: founder ok with web-only gallery
editing at launch.

**D5 [ENG/rollout] — breaking wire change, gate behind a fresh EAS build.**
Adding `image_gallery` to the block-type union is a breaking wire change for
installed mobile builds (same class as `featured_collection`). The native
type-keyed lookups are already guarded (`?.` + `?? "Block"`), so current builds
will not crash, but the rollout still needs a fresh EAS build shipped before
artists can create the block. Tracked with the existing EAS-build gate that also
holds `goods_collections`.

**D6 [FOUNDER-scope] — "section layouts" is already built; not rebuilt.**
- Decision: the "section layouts" item in the Stage 3 page list is treated as
  already delivered by the existing page-template system (P2), not built anew.
- Why: the layout templates (clean / portfolio / bold / editorial), the picker
  in the appearance editor, the write path, the public render, and the Plus
  entitlement gating all already exist and work end to end. Rebuilding them would
  duplicate a working system and risk regressions; the image_gallery block also
  added a per-section grid/carousel layout. The work-plan line was stale.
- Alternatives: (a) build a NEW multi-column per-section arrangement system,
  rejected as speculative (no clear product definition, larger effort) and not
  what the founder queued next; (b) rebuild the templates, rejected as pure
  duplication.
- Confirm: founder confirms "section layouts" meant the page-template layer
  (done), not a distinct multi-column section system. If the latter is wanted, it
  is a separate, scoped feature.
- Reversible? N/A (no code change); a future multi-column system would be additive.

### 2026-07-31 — Goods bundles (Stage 3)

**B1 [FOUNDER-scope] — v1 = the bundle ENTITY (CRUD + display + management),
NOT the payable-checkout decomposition.**
- Decision: ship bundles as a manageable, displayable goods entity now (parent +
  items, RLS, public shop display, editor, mobile), exactly the shape collections
  shipped in. Expanding a bundle into `order_items` at checkout is a SEPARATE
  follow-on slice.
- Why: the payable goods checkout is DARK (`GOODS_COMMERCE_ENABLED` off, goods
  fee 0% under v1), and the map flags bundle pricing -> order-line/fee
  decomposition as the single biggest risk (a fee-base bug ships green and stays
  invisible until P7 flips real rates). Isolating that money surface into its own
  slice with dedicated tests against v2 rates is safer than folding it into the
  entity build. Collections shipped display-only for the same reason.
- Alternatives: build the checkout decomposition now, rejected as the highest-risk
  path with no live payoff (checkout dark) and no independent test coverage yet.
- Confirm: founder ok that a v1 bundle is visible/manageable but the "buy this
  bundle" flow lands with the goods-commerce un-park (P7).
- Reversible? Cheap (the follow-on is additive).

**B2 [FOUNDER-product] — a bundle carries its own price; savings shown vs the
component list-price sum.** The bundle has `price_amount` (the offer price); the
shared model computes and displays the saving vs the sum of its products' list
prices. Provisional checkout rule for the follow-on slice: a bundle becomes ONE
`order_items` line of `type: "product"` at the bundle price, so the goods fee
base is unambiguously the bundle price; the component items are recorded via
`product_bundle_items` for fulfilment/inventory. Confirm at the checkout slice.

**B3 [ENG] — entitlement key `goods_bundles`, GRANT-shaped gate
`goodsBundlesAllowed`** (mirrors `goodsCollectionsAllowed`: `!disabled &&
canAccess`; paused reverts to today, i.e. no bundles). Added to
`ENTITLEMENT_FEATURES` + `CAPABILITIES` + a gate helper. RLS: user-scoped writes
-> per-command `to authenticated ... with check (artist_id = auth.uid())` on both
tables from day one (never SELECT-only), composite FKs `(id, artist_id)`, guarded
convergent migration. This is the 0120/0123 lesson applied up front.

**B4 [ENG] — bundle delete requires ARCHIVE first; no empty-delete fast path,
so the TOCTOU delete race is designed out (no RPC needed).**
- Decision: a bundle is deletable only once archived. The server delete is
  gated on the stable `archived_at` column (`delete where id + artist_id and
  archived_at is not null`); a live bundle returns not_eligible ("archive it
  first"). `canDeleteBundle` = archived-only.
- Why: collections allow deleting an EMPTY live collection, which is a
  `delete ... where not exists(items)` and is NOT atomic under READ COMMITTED
  (finding #19, [[read-committed-recheck-rule]]) — it needed a lock-then-recheck
  RPC (migration 0124) to stop a concurrently-added item being cascaded away
  while the delete reported success. Gating bundle delete on `archived_at`
  removes the emptiness subquery entirely, so that race class cannot exist here,
  with no RPC to write, review, and get subtly wrong.
- Alternatives: replicate the 0124 atomic-delete RPC for bundles (rejected: more
  money-adjacent SQL surface to carry for a race we can design out); allow
  empty-delete without the RPC (rejected: that is exactly the shipped-and-lost
  #19 defect).
- Cost: a mis-created empty bundle must be archived before it can be deleted, a
  minor extra step, and consistent with "delete is a deliberate second act".
- Reversible? Cheap (could add the RPC + empty-delete later if wanted).

**B5 [ENG-scope] — the payable-checkout follow-on ships as the PURE, TESTED
decomposition, not the dark checkout-UI wiring.**
- Decision: implement + test the bundle -> goods-fee-base arithmetic (a bundle
  contributes ONE `product` line at the bundle price, so the goods fee is on the
  bundle price, never the sum of the components' list prices), proven against
  BOTH v1 (0%) and v2 (5%/1%) rates using the real `computeOrderFees` /
  `goodsBaseMinorFromLines`. Do NOT wire bundles into the customer-portal add-on
  catalogue / order insertion yet.
- Why: the discovery flagged bundle-price -> order-line -> goods-fee-base as the
  single biggest risk (a fee-base bug ships green and stays invisible until P7
  flips real rates). That risk lives entirely in the arithmetic, which is a pure
  function provable now. The checkout is fully DARK (`GOODS_COMMERCE_ENABLED`
  off, nothing purchasable until P7), so wiring the UI adds integration surface
  for zero live payoff; when goods-commerce approaches un-park, the wiring reuses
  this proven `bundleGoodsLine` decomposition.
- Alternatives: wire the full dark checkout now (rejected: integration risk, no
  live payoff, and the money risk is the arithmetic, which this pins regardless).
- Confirm: founder ok that a v1 bundle is manageable + displayed now, and
  "buy this bundle" wiring lands with the goods-commerce un-park reusing the
  tested decomposition.
- Reversible? N/A (additive); the wiring is a later, mechanical step.

### 2026-07-31 — Stage 3 remainder + one gated decision

**S1 [FOUNDER-scope] — DISTINCT per-surface appearance for `shop` / `guestSpots`
is deferred; they already inherit the artist's appearance.**
- Finding: the appearance system reserves five surfaces
  (`hub, bookingForm, largeProject, shop, guestSpots`) but applies
  `surfaceAppearance` on only the first three. The work-plan item read "shop and
  guestSpots surfaces with no renderer". On inspection this is overstated: the
  shop overlay (ShopTeaser) and the guest-spots card render INSIDE the booking
  page's appearance wrapper (`[slug]/page.tsx` sets `style={appearance.cssVars}`
  on the outer div, and passes the resolved accent as the shop's `itemBg`), so
  both already render with the artist's resolved (bookingForm-surface)
  appearance via the CSS-variable cascade. What is genuinely unbuilt is a
  DISTINCT per-surface override (theming the shop differently from the booking
  page), which ALSO needs a per-surface editor that does not exist (the
  appearance editor edits the global only).
- Decision: defer distinct per-surface theming for `shop`/`guestSpots`. Keep the
  surfaces reserved in the vocabulary; do not build a per-surface override
  editor + scoped renderers now.
- Why: no articulated product demand for a shop themed separately from the
  booking page; it is design-led and low launch-value (not marketed, not
  launch-blocking); and the sensible default (inherit the artist's appearance)
  already holds. Speculatively building a per-surface system would be effort on
  an unspecified feature.
- Alternatives: build the per-surface editor + shop/guestSpots scoped renderers
  now (rejected: unspecified, low value); or add a scoped wrapper that re-applies
  the GLOBAL appearance to the shop (rejected: it already inherits it, so this is
  a no-op dressed as work).
- Confirm: founder confirms distinct shop/guest-spots theming is not wanted for
  launch. If it is, it is a scoped, design-led feature (editor + renderers).
- Reversible? N/A (no code change).

**F14 [FOUNDER] — legacy_free_v1 fee rate under v2: continue the grandfathered
flat rate on card collection; standard free goods rate (PROVISIONAL).**
- Context: finding `PAY-FEE-004`. Under fee schedule v2 the Free appointment
  rate is `null` (Free cannot collect card payments), but a `legacy_free_v1`
  artist who carries the grandfathered deposits/Connect override CAN collect, so
  the schedule has an undefined cell for them; `feeMinorUnits` would resolve them
  to the free rate (0% appointment via null->0, 5% goods) which is leakage on the
  appointment lane. Zero such accounts exist today (dry run).
- Decision (provisional): a `legacy_free_v1` artist who collects card payments
  pays their GRANDFATHERED v1 flat appointment rate (3%) under v2 (not 0% =
  leakage, not the Plus 0.5% = an unearned Plus benefit), and the standard Free
  goods rate (5%) since goods fees are new and were never grandfathered.
- Why: 3% is exactly what these artists pay today under v1, so continuing it is
  the least-surprising honouring of the grandfather; 0% hands out free card
  collection the tier never promised; 0.5% hands out a Plus rate to a Free-tier
  grandfather.
- Encoding: **DONE `e698be7` (2026-07-31).** Founder ruling 6+14 (encode v2 fully
  now, no undefined cell) superseded the deferral. Added a `legacy` appointment
  rate (v1 300 / v2 300; goods maps legacy->free) + `resolveAppointmentTier` +
  `appointmentFeeTier` wired at all 3 tier-resolution sites. `ACTIVE_FEE_SCHEDULE_VERSION`
  stays v1, so no live number moves; the branch activates with the gated v2 flip.
- Confirm: **CONFIRMED by founder ruling 14 (2026-07-31): grandfathered
  appointment access = 3%, Free goods = 5%.** (No longer provisional.)
- Reversible? The encoding is v1-invisible; the activation is the gated v2 flip.

**GC1 [FOUNDER] — goods/bundle checkout is a STANDALONE shop, not booking-coupled
(FOUNDER-CONFIRMED 2026-07-31).**
- Context: today `orders.booking_id` is `NOT NULL` (0036), so an order cannot
  exist without a booking; goods/bundles can only ride a booking's deposit
  PaymentIntent (an appointment add-on). There is no cart and no standalone
  purchase. Building a real shop (buy goods/flash/bundles with no appointment) is
  a ~5x build and a new monetization surface, so it was surfaced to the founder
  rather than defaulted (per the interruption policy: monetization / one-way door).
- Decision (founder, via AskUserQuestion): **STANDALONE shop.** Customers can buy
  goods/bundles without an appointment. Supersedes provisional B1 ("bundles v1 =
  entity+display, payable checkout deferred to P7") and B5 ("payable checkout is a
  later follow-on"): payable bundles + standalone goods are IN scope now.
- Why: matches the full-package spec (drops as the headline Plus goods tool implies
  buying without booking); "build the complete product" leaves no room for a
  goods module that only works alongside an appointment.
- Build shape: new PaymentIntent path (not the deposit PI), guest-buyer identity,
  cart, and orders without a booking (`orders.booking_id` nullable, or a distinct
  standalone-order path). All behind the existing dark `GOODS_COMMERCE_ENABLED`
  gate; nothing activated. Architecture-INDEPENDENT work is done first regardless
  (goods refund hole: order status writes + restock + discount reversal +
  order-aware refundDepositCore; bundle composition-snapshot table for historical
  integrity), then the standalone infra.
- Reversible? The infra is additive behind the dark gate; the schema change
  (nullable booking_id / standalone order path) is a forward migration, not a
  live-data rewrite. Not activated until the goods-commerce gate is flipped.

**RB1 [ENG/BUILD] — refunds allowed from cancelled/expired/failed when they hold
collected money (2026-08-01).**
- Context: authz-review Finding B (`PAY-RFD-007`). The refund core's status gate
  was `paid/partially_paid/partially_refunded` only, but the transition matrix
  explicitly gives `cancelled`/`expired`/`failed` their own refund edges BECAUSE
  all three are reachable from `partially_paid` and can hold collected money. A
  client whose partially-paid request was cancelled had no self-service path to
  their money.
- Decision (build decision, not escalated): widen `REFUNDABLE_STATUSES` (and the
  refund-settle FROM list) to include the three money-holding states. The state
  model had already decided these refunds are legitimate; the gate just never
  caught up. Amounts stay bounded by `maxRefundable` from real allocations, so a
  nothing-collected request still refuses; the artist-case allowlist still bounds
  WHY (voluntary/cancellation only).
- Alternatives: (a) keep the narrow gate + route these through support manually
  (rejected: strands client money behind a ticket for a case the model designed
  for); (b) auto-refund on cancellation (rejected: moves money without an
  explicit artist action, against the money-path rules).
- Reversible? Yes (narrowing the list back is one edit); nothing live (dark).

### 2026-08-01 — Gallery real upload (Track B)

**GB1 [ENG] — `.rotate()` added GLOBALLY in `processAndUpload`, not gallery-local.**
- Context: no upload pipeline applied EXIF orientation (`.rotate()`): sharp
  strips the orientation tag on re-encode WITHOUT applying it, so portrait
  phone photos land sideways. Latent on the wide cover strip; glaring in a
  square gallery grid (recon H1).
- Decision: add no-arg `.rotate()` (auto-orient) inside `processAndUpload`,
  which backs FOUR existing routes (goods image, profile logo, profile cover,
  flash image) plus the new gallery path. This deliberately changes the four
  existing routes' behaviour.
- Why: the change is strictly corrective everywhere (nobody wants a sideways
  image); fixing it gallery-locally would leave the same latent bug in four
  places and fork the pipeline.
- Alternatives: gallery-local pipeline (rejected: forks one pipeline into two
  and preserves a known defect); `lib/image-processing.ts` reuse (it rotates
  but serves a different surface; consolidating the two pipelines is a bigger
  refactor than this slice warrants).
- Reversible? Cheap (one line). EXIF is stripped either way (privacy unchanged,
  GPS never persisted — re-encode drops metadata).

**GB2 [FOUNDER-product, provisional] — the gallery editor will KEEP the URL
field alongside the new upload button (B2).**
- Why: existing galleries may hold external URLs (the parser accepts any
  http(s) image URL and the data model predates upload), and power users
  hosting elsewhere lose nothing. Upload becomes the primary affordance;
  the URL input stays as the secondary path.
- Confirm: founder can drop the URL field later; removing it is cosmetic (the
  parser keeps accepting stored external URLs either way, so old data never
  breaks).
- Reversible? Cheap.

**GB3 [COUNSEL, provisional] — hosted gallery objects on a public-unlisted
bucket; downgrade hides the page render, not the object (H3).**
- Context: gallery images now live in the `logos` bucket (public objects,
  unlisted since 0040 — URLs work, enumeration does not), like covers, flash
  and product images before them. On DOWNGRADE the gallery block is hidden from
  the public page but the stored object stays fetchable at its stable URL by
  anyone who has it; on REMOVAL from a block the object is deleted by the
  save-diff orphan cleanup.
- Decision (provisional): keep the existing platform posture (public-unlisted,
  render-gated) rather than inventing a signed-URL regime for one block type.
- Why: consistent with every existing image surface; a signed-URL scheme would
  fork the render path and break the settings-JSON model for marginal gain
  (the URL was already shared with whoever holds it).
- Confirm (counsel queue, with the C1 package): Inklee is now the HOST of
  client-photo content (tattoos are health-adjacent personal data on skin);
  confirm the public-unlisted posture + deletion-on-removal + purge-on-account-
  deletion (purgeStoragePrefix already covers `logos/{uid}`) satisfies the
  data-protection analysis, or direct a change.
- Reversible? Moderate (a later signed-URL regime is additive but touches the
  renderer and stored URLs).

### 2026-08-01 — Standalone goods keystone, slice C1 (GC1)

**GC2 [ENG/money] — entangled-PI refund semantics: full refund converges +
restocks + releases the redemption; partial is visibility-only.**
- Context: under the add-on model a deposit and goods share ONE PaymentIntent,
  so a partial `amount_refunded` cannot be attributed per lane. The webhook now
  settles orders on `charge.refunded` (the enum states existed since 0036 with
  no writer).
- Decision: only claim what the event proves. Charge FULLY refunded -> order
  `refunded` + restock + discount-redemption release, all once-only inside the
  flip gate. Partial -> `paid` -> `partially_refunded` as visibility, no
  restock, no release.
- Redemption release = DELETE the redemption row: the cap counts real net
  sales, and a fully unwound sale is not one. The unique (code, order)
  constraint plus the order never returning to `paid` makes re-recording
  impossible.
- Confirm (accountant queue, minor): redemption release on full refund matches
  the intended discount-cap semantics.
- Reversible? Cheap (semantics live in one function, `settleGoodsOrderRefund`).

**GC3 [ENG/money] — refundDepositCore refunds only the DEPOSIT portion when a
goods order shares the intent.**
- Context: recon finding — the deposit refund passed no `amount`, so with a
  paid add-on order on the same PI it silently refunded the goods money too,
  while the order stayed `paid` and stock stayed decremented.
- Decision: read the order on the intent; when it carries goods, pass
  `amount` = the ORDER's own frozen `deposit_amount` (what this PI actually
  charged, not the booking's current figure). Deposit-only intents keep the
  whole-intent refund. On corrupt amounts the helper returns undefined
  (whole-intent, the old behaviour) rather than inventing a number.
- Reversible? Cheap; pure decision in `resolveDepositRefundAmountMinor`, tested.

**GC4 [ENG/product] — the standalone shop sells every ACTIVE product, not only
`is_checkout_addon` ones.** That flag scopes the appointment add-on list (what
an artist offers alongside a deposit), not the shop. Catalog rows are mapped
into the shared compositor's shape with the flag forced true, so its remaining
gates (status, stock, variants, drops, quantity caps) all still run. Reversible?
Cheap (one filter).

**GC5 [ENG/UX, provisional] — the standalone checkout page is SELF-CONTAINED
(v1).** `/[slug]/shop/checkout` lists the products itself (quantity steppers +
variant picker + email + optional code), then swaps to the PaymentElement phase
on the server-created intent. The booking page's wishlist cart is NOT wired
into it yet: the interest context is scoped to the booking surface, and
plumbing it across routes is UX polish for a dark feature. Confirm: founder ok
that v1 checkout is its own page; the ShopTeaser gains a link to it at un-park.
Reversible? Additive (context integration later changes no server contract).

**GC6 [ENG/money] — bundle checkout uses a FIRST-CLASS `'bundle'` order item +
a composition snapshot table (CONFIRMS AND REVISES B2's provisional
one-product-line rule, at the checkout slice as B2 required).**
- Decision: `order_item_type` gains `'bundle'`; `order_items` gains `bundle_id`
  (FK `on delete set null`); new `order_item_bundle_components` table snapshots
  the composition at sale time (order_item_id, product_id `on delete set null`,
  title snapshot, quantity, component list price at sale). The fee base stays
  unambiguously the bundle price (B2's intent), carried on the single bundle
  line's `total_amount`.
- Why the fork went this way. B2's pure `type: "product"` line at the bundle
  price leaves three money-path holes (C4 recon, 2026-08-01):
  1. `decrementInventory`/`restockInventory` branch on `variant_id` then
     `product_id` and silently no-op on a line with neither
     (`order-fulfillment.ts`), so fulfilment AND refund restock would both
     quietly skip bundle sales.
  2. `productHasOrderReferences` (`goods-guard.ts`) keys the archive-vs-delete
     guard on `order_items.product_id`; a component sold only inside bundles
     looks unreferenced, gets hard-deleted, and 0132's `ON DELETE CASCADE`
     erases it from the bundle with no record of what was sold.
  3. `settleGoodsOrderRefund` filters `.eq("type","product")` and would hand
     the bundle line to a restock that restocks nothing.
  With `bundle_id` + the snapshot table: fulfilment expands components at
  paid time from the SNAPSHOT (never live rows), the deletion guard also
  checks `order_item_bundle_components.product_id`, and composition history
  survives product deletion.
- MUST land in the same slice: `goodsBaseMinorFromLines` filters
  `type === "product"` (`order-fees.ts:138`); widening it to include
  `'bundle'` ships WITH the enum value, because under v1's 0% goods rate the
  omission is green and only detonates at the P7 v2 flip.
- Sellability: new shared `bundlePurchasable()` — bundle `is_public_visible`
  and not archived AND every component product active + `is_public_visible` +
  sufficient stock for (component qty x line qty). The artist editor
  legitimately allows hidden/inactive components in a bundle; the checkout
  refuses the bundle rather than selling it short. Money-path re-check lives
  in `goods-checkout.ts` (serviceClient bypasses RLS; same rule as
  SHOP-VIS-001).
- Currency: bundle catalog read filters `.eq("currency", "eur")`, matching
  `addon-products.ts`; the standalone path charges EUR unconditionally.
- Prices snapshot at checkout; nothing later recomputes from live
  `products.price_amount` (`bundleSavings` stays display-only, as documented).
- Alternatives: keep the pure product line (rejected: the three holes each
  need bespoke workarounds and composition history is unrecoverable); expand
  the bundle into N component lines at prorated prices (rejected: invents
  per-item prices nobody set, makes the fee base ambiguous, contradicts B2's
  founder-priced offer).
- Supersession note: the "bundle composition snapshot" half of GC1 Phase 1
  moves here; the refund-hole half already landed in C1
  (`settleGoodsOrderRefund`).
- Reversible? Migration is additive (enum value + nullable column + new
  table); moderate to unwind once orders exist, cheap before un-park.

**GC7 [ENG/product, provisional] — v1 refuses bundles containing
VARIANT-bearing products at checkout (SHOP-VAR-001).**
- Decision: a bundle component whose product has any ACTIVE variant does not
  resolve; the bundle answers "Part of that bundle isn't available right
  now." The artist editor keeps allowing such bundles (display is fine);
  only the SALE refuses.
- Why: v1 bundles cannot express a variant choice (no variant column in
  product_bundle_items, documented), and a variant-stocked parent has
  quantity null, which bundlePurchasable reads as unlimited while
  decrementInventory moves nothing. The same product bought directly
  REQUIRES a choice. Selling it choicelessly inside a bundle sells ambiguous
  goods and skips the stock ledger (round-2 verifier executed the gate at
  line quantity 99 against a null-stock parent: ok).
- Alternatives: variant-aware bundles (a v2 scope: snapshot schema change +
  editor + wire types); treating parent-null stock as sellable (rejected:
  sell-short by another name).
- Reversible? Cheap (one predicate in the component resolution).

**GC8 [ENG/money] — round-2 verifier postures, applied as one batch.**
1. Bundle components pass through `productAvailability` — the SAME drop/
   preorder/status gate the compositor runs for direct purchases
   (SHOP-DROP-001: drops live in the compositor, not the catalog query, so a
   stock-only component check made bundles a drop-gate bypass, proven by
   executing both gates side by side).
2. The stale-order sweep resolves the INTENT, never just the row
   (SHOP-ORD-002): succeeded -> settle (lost-webhook recovery), processing ->
   skip, else cancel the intent FIRST, then the pending-gated row; Stripe
   error -> skip for the next run. Stripe intents do not expire in 24h and
   the buyer holds the client secret; cancelling only the row left money
   capturable against a cancelled order, invisible to everyone.
3. Settlement reads + expands BEFORE its once-only paid flip (SHOP-FUL-003),
   the same posture as the refund side's SHOP-FUL-002: an expansion failure
   returns with the gate unconsumed instead of silently overselling.
4. ONE classifier: the refund read drops its `.in(type, ...)` filter; which
   lines move inventory is decided ONLY by expandInventoryMovements, on both
   sides (the SHOP-FUL-001 structural residual).
5. Post-flip stock writes are best-effort but OBSERVABLE (SHOP-FUL-004):
   both movers and the redemption release now capture their PostgREST errors
   to Sentry. A compensating-retry table was considered and deferred: the
   feature is dark, and observability + manual repair is proportionate until
   real volume exists (recorded, not forgotten).

**GC9 [ENG/money] — standalone settlement outcomes are a TRI-STATE, and only
a pre-flip refusal makes the webhook answer 500 (SHOP-FUL-005, round 3).**
- Decision: `settleStandaloneGoodsOrder` returns
  `settled | already | refused`. The webhook maps `refused` (pre-flip
  expansion failure, once-only gate UNCONSUMED) to HTTP 500 so Stripe's
  retry ladder recovers in minutes; `settled` and `already` answer 200.
- Why: a settle that returned false always answered 200, so recovery from a
  transient read failure fell entirely to the daily sweep (Vercel Hobby
  crons), worst case roughly two days with money captured and the order
  still pending. The route's own precedent for a recoverable money failure
  is a 500 (the sponsorship release). A boolean could not carry the fix: a
  naive 500-on-false retries forever on orders another delivery already
  settled, which is why `already` (lost flip, or sweep-owned order) is
  terminal by construction.
- Sweep bounds land in the same batch (SHOP-ORD-003): 200 rows per run,
  oldest first, `skipped` included in the audit payload (a skip-only run
  used to write no audit at all), and `maxDuration = 60` on the cleanup
  cron so the platform default cannot cut the loop silently.
- Reversible? Cheap (mapping + constants).

### 2026-08-01 — Fee display + tier stamp, Track D (G1/G2, FEE-DSP-001/FEE-STP-001)

**D1 [ENG] — the tier-aware fee display is routed through ONE shared helper
(`appointmentFeeDisplay`), and the composition that resolves the tier moved to
the PURE package.**
- Decision: `packages/shared/src/entitlements.ts` gains
  `appointmentTierFromOverrides` (the exact composition
  `order-fee-sync.ts:appointmentFeeTier` used to inline: `resolveAppointmentTier`
  + `effectivePlanTier` + `canAccess("card_deposit_collection")`).
  `order-fee-sync.ts`'s `appointmentFeeTier` becomes a one-line delegate; every
  server caller is unchanged. `packages/shared/src/fee-schedule.ts` gains
  `appointmentFeeDisplay(tier, version?)`, returning `{ bps, percentLabel } |
  null` (null exactly when the tier cannot transact the appointment lane at
  all — never a fabricated 0%). `getDepositCollection` (already reading
  overrides for the entitlement check) resolves both and returns them
  additively (`feeTier`, `feeDisplay`), so the accept dialog, the payouts
  page, and the mobile payouts route all read ONE resolution.
- Why the move to the pure package: the composition needs to run from a
  CLIENT component (the accept dialog is `"use client"`), and
  `order-fee-sync.ts` is `server-only`. Duplicating the three-call composition
  at the display site would have re-created exactly the split A3 closed for
  the charge path, one layer up, for the display path.
- `platform-fee.ts`'s header comment corrected: it previously read as a
  permanent guarantee of a flat 3% across all tiers; it is now stated as the
  v1 display legacy, with `appointmentFeeDisplay` named as the successor once
  a schedule other than v1 activates. `PLATFORM_FEE_BPS`/`platformFeeCents`
  are unchanged in shape (still one argument — pinned by
  `appointment-fee-unification.test.ts:612`) and still used as the fallback
  on both request-detail surfaces for an intent-less first render and on
  mobile for an older server that predates the additive fields.
- Confirm: no counsel/accountant input needed — this only reroutes a DISPLAY
  number through a helper that resolves the exact same v1 rate today; no live
  number moves.
- Reversible? Cheap (pure functions + additive fields; nothing schema-level).

**D2 [ENG] — the "(card processing included)" parenthetical is conditioned on
the shown rate being exactly 300 bps, not on any other proxy.**
- Decision: the payouts settings page keeps the parenthetical only when
  `feeBps === 300`. When the display is null (a tier that cannot transact the
  lane at all, unreachable under v1), the fee sentences instead state that
  card deposit collection isn't part of the current plan.
- Why: "card processing included" is a COMMERCIAL CLAIM specific to the 3%
  all-in rate — Custom Connect bills Stripe's processing cost to Inklee's own
  platform balance, never the artist's, so the full 3% genuinely is the
  artist's only deduction. At the Plus 0.5% rate that is a different,
  unconfirmed cost/margin split; carrying the same parenthetical there would
  assert something nobody has checked. Gating on the number itself (not on
  "is this v1" or "is this Plus") means the sentence stays correct
  automatically if a schedule is ever added where 300 bps recurs for a
  different reason.
- Confirm (accountant, before P7 activates v2): whether the Plus 0.5% rate's
  cost/margin split can ever carry the same "processing included" claim, or
  needs its own wording.
- Reversible? Cheap (one conditional).

**D3 [ENG] — G2's fee-tier stamp lands on `booking_requests`, `orders`, and
`payment_collections` (migration 0136); deliberately NOT on `payment_requests`,
and deliberately NOT backfilled.**
- Decision: `fee_tier text` (CHECK `in ('free','plus','legacy')` or null) on
  all three, following each table's existing `fee_schedule_version` shape
  (0116, 0125). Stamped at the ORIGINATING write: the deposit intent's
  metadata (`bookings.ts`), the deposit webhook flip
  (`platform_fee_collected_cents`'s sibling column), the goods add-on order
  insert (`request/[token]/actions.ts`, from `resolveOrderFee`'s now-widened
  `FeeSyncOk.tier`), the standalone goods order insert (`goods-checkout.ts`),
  the appointment-payment intent's metadata (`appointment-payment-intent.ts`,
  from `PaymentQuote`'s now-widened `feeTier`), and its settlement stamp onto
  `payment_collections` (`appointment-payment-settlement.ts`, read FROM the
  intent's metadata, never re-resolved from the artist's current overrides).
- Why not `payment_requests`: 0125 (:308-313) already records that the
  artist's OWN client writes `fee_schedule_version` on that table via
  PostgREST (client-writable pre-payment) — a residual, named there rather
  than fixed, because it cannot move a real charge, only show up as a
  reconciliation discrepancy. Adding `fee_tier` to the same writable surface
  would widen that residual instead of closing it. `payment_collections` is
  service-role-only (0125's REVOKE), so the settled stamp lives there.
- Why no backfill: same reasoning as 0116/0131 — an invented tier for a
  pre-migration row is worse than an honest null, and both consumers
  (`fee-savings-query.ts`'s hypothetical, `account-deletion-logic.ts`'s GDPR
  snapshot) already fall back correctly on null.
- Also fixed as part of this slice, both pre-existing tier-WRONG paths named
  in the same review: `fee-savings-query.ts` used to flip a raw
  `overrides.planTier` binary free/plus, which (a) ignored comp expiry and
  (b) collapsed a grandfathered artist's downgrade counterfactual to `free`,
  whose v2 appointment rate is null — `feeMinorUnits` reports that as 0, so
  the "what the other tier would cost" comparison silently priced as nothing
  owed instead of the historical 3% a legacy artist would actually still owe.
  Now resolves the current tier via `appointmentTierFromOverrides` and a
  three-way `fallbackTier` (plus+grandfathered -> legacy, not free), AND
  prefers each ROW's own stamped `fee_tier` over the artist-level
  reconstruction where G2 populated it. `account-deletion-logic.ts`'s GDPR
  financial snapshot used to always recompute the 3% constant, which is wrong
  for a sponsored deposit (waived to 0 by Stripe) — now prefers the ACTUAL
  `platform_fee_collected_cents` stamped at settlement (0116) when present,
  falling back to the computation only for pre-0116 rows.
- Alternatives: recompute the tier at read time from current overrides
  (rejected: exactly the defect above — a GDPR export or a savings figure must
  not change retroactively when an artist's plan changes); a single combined
  `fee_tier_and_version` column (rejected: the two vary independently and
  0116/0125 already precedent separate columns).
- Reversible? Additive migration (nullable columns + guarded CHECK
  constraints); cheap to unwind before any row is written, moderate after
  (dropping a stamped, reconciliation-relevant column).

### 2026-08-01 — Shop + guest-spot surface controls (Track C5, ruling 19)

**S2 [ENG/product, provisional] — surface visibility is PER-SURFACE and
NON-CASCADING.**
- Decision: `hidden: ["shop"]` governs ONLY the booking-page shop teaser and
  finally gets a write path (it was readable everywhere but had no writer). The
  STANDALONE shop's visibility is a NEW `settings.features.shop_checkout`
  boolean (default ON while `goods_module` is on), joining the existing
  `features` keys rather than becoming a bio-page module — it is not a
  booking-page module. The money path re-checks server-side
  (`createStandaloneGoodsCheckoutCore`, page filters never protect the money
  path — the SHOP-VIS-001 lesson).
- Why: the two surfaces are genuinely independent (an artist may want products
  visible on the booking page but no standalone no-appointment checkout, or
  the reverse), and cascading one flag into the other would silently take away
  a choice the artist didn't make.
- Alternatives: a single flag governing both surfaces (rejected: exactly the
  coupling this decision undoes for trips in S3, and the same defect class);
  a THIRD bio-page module for the standalone shop (rejected: the standalone
  checkout is not rendered inside the booking page, so it is not a booking-page
  module by the existing definition).
- Confirm: founder confirms the non-cascading split is the right shape (vs. one
  flag for "goods visibility" everywhere).
- Reversible? Cheap (both are boolean flags; no schema coupling between them).

**S3 [ENG/product] — trips gain `is_public_visible boolean not null default
true`, BACKFILLED from `show_on_booking_form` in the same migration.**
- Decision: migration `0137`. The Hub's guest-spots block used to reuse
  `show_on_booking_form` (the booking-page flag) as its own visibility signal,
  with a comment admitting trips had no public-visibility flag of their own.
  The backfill copies the CURRENT value of `show_on_booking_form` into the new
  column rather than defaulting every row to `true`: until this migration
  shipped, a trip hidden from the booking form WAS, as an observed side
  effect, also hidden from the Hub. Defaulting bare-`true` would surface trips
  an artist had deliberately hidden — a privacy regression, not a neutral
  default. This is copying OBSERVED behaviour forward, which is the opposite
  situation from the 0116/0131 no-backfill precedent (there, no prior value
  existed to preserve, so inventing one would have been worse than an honest
  null; here a prior value genuinely exists). The Hub (and any future public
  surface) now reads `is_public_visible`; the booking page keeps
  `show_on_booking_form` unchanged.
- Why not rename `show_on_booking_form`: 20+ call sites across web + native +
  mobile-wire types reference it by name; a rename is pure churn for the same
  outcome a new column achieves additively.
- Alternatives: rename the existing column and add a new one for the booking
  form (rejected: more churn, no behavioural difference); default the new
  column to `true` unconditionally (rejected: the privacy regression above).
- Reversible? Additive migration (nullable-free but a plain new column);
  cheap to unwind before independent values diverge, and the column-add itself
  is guarded so a re-run cannot re-copy over an artist's later independent
  change (see the migration file's own convergence note).

**S4 [ENG/UX, provisional] — the Hub's "goods" feature block adds
`isModuleVisible(bioPage, "shop")` to its gate.**
- Decision: a narrow, deliberate cascade. The block deep-links to the
  booking page's shop teaser (`feature-blocks.tsx`: `href={data.bookingUrl}`),
  so hiding that teaser (S2) would otherwise leave the Hub's "goods" block
  pointing at a dead end. Gating the BLOCK on the TEASER's own visibility
  suppresses a broken link, not a surface.
- Why this is not the general cascading rule S2 rejects: S2 is about two
  surfaces that each SELL or DISPLAY goods independently; this is one block
  whose only job is to hand the visitor to the OTHER surface, so its
  visibility is derived from what it points at, not an independent choice.
- Revisit note: at the goods-commerce un-park, this block should link to the
  standalone shop instead of the booking page, and this dependency should be
  dropped at that point (the standalone shop is a real, independent
  destination once it takes real orders).
- Reversible? Cheap (one boolean in the gate expression).

**S5 [ENG/product] — every C5 toggle is FREE; no new entitlement key.**
- Decision: neither the shop-teaser toggle nor the standalone-checkout toggle
  is gated by a Plus entitlement. Both ride the existing free `features`
  JSONB / bio-page `hidden` mechanisms.
- Why: visibility control is hygiene, not a paywalled capability — consistent
  with `is_public_visible` (product-level) already being free, and with the
  registry's proposed `goods_tools` entitlement staying unminted (no live,
  server-enforced use for it exists). Per-surface THEMING (S6) rides the
  existing `appearance_custom` entitlement rather than a new key, for the same
  reason: it is the existing gate for the custom layer, not a new capability.
- Confirm: none needed (no paywall introduced; consistent with standing
  entitlement policy).
- Reversible? N/A (no gate to remove); minting a future entitlement here would
  be additive.

**S6 [ENG] — inherited theming lands on the standalone shop.**
- Decision: `/[slug]/shop/checkout` now resolves `surfaceAppearance(artistId,
  settings, "shop")` and applies `data-appearance` + `cssVars` on its outer
  wrapper, the same pattern `[slug]/page.tsx` uses for the `bookingForm`
  surface. `data-appearance` is CLAMPED to `"light"` rather than the resolved
  theme (the same clamp `[slug]/page.tsx` and `[slug]/project/page.tsx` both
  apply): this page's markup uses the generic app tokens (`text-foreground`
  etc.), which have no `[data-appearance="dark"]` CSS block defined, so an
  unclamped dark theme would produce the same invisible-text failure the
  booking page's own comment already documents.
- Why this does not reopen S1: S1 deferred a DISTINCT per-surface appearance
  EDITOR + override for `shop`/`guestSpots` (the "shop" surface slot already
  existed in `APPEARANCE_SURFACES` but was applied nowhere). This wires the
  EXISTING resolver onto a NEW page that did not previously apply any
  appearance system at all (it rendered with plain, unstyled tokens) — it is
  closing a gap the standalone checkout introduced after S1 was written, not
  building the deferred editor. An artist who has set a `shop`-surface
  override in the (still nonexistent) editor would see it here once one
  exists; today everyone gets the GLOBAL appearance, same as any surface with
  no override set.
- Considered and excluded: a per-surface appearance EDITOR (S1's deferral
  stands — still unspecified, still low launch-value); a `/[slug]/shop` index
  page (out of scope, not requested); per-collection surface assignment (a
  different, unscoped feature).
- Reversible? Cheap (the render wiring is additive; removing it reverts the
  page to unstyled tokens with no data loss).

### 2026-08-01 — FOUNDER RULINGS FD1-FD13 (FINAL, not provisional)

The founder processed the consolidated review handoff's section 1a and issued
thirteen FINAL rulings. These are decided; do not re-ask. Each supersedes or
confirms the provisional entry it names. Implementation is tracked as the FD
build board in the consolidated handoff.

**FD1 [FINAL] — dedicated `rich_content_blocks` capability; SUPERSEDES D1.**
Galleries and future rich content sections (video, testimonials) move off
`appearance_custom` onto a new `rich_content_blocks` entitlement.
`appearance_custom` keeps colors/fonts/templates/styling only. No split
gating may remain.

**FD2 [FINAL] — native gallery editing ships BEFORE publication; SUPERSEDES
D4.** Full native scope: device upload, delete, reorder, captions,
visibility, entitlement + downgrade states, progress, retry, unsupported
files, empty states, safe render. Capability grant still waits on fresh
smoke-tested builds (unchanged EAS gate).

**FD3 [FINAL] — "section layouts" = the shipped template + section
arrangement layer; CONFIRMS D6.** Approved wording: "Flexible section layouts
and page templates". No page-builder claims anywhere.

**FD4 [FINAL] — the permanent raw URL field is REMOVED; SUPERSEDES GB2.**
Replaced by a secondary "Import from URL" action that validates, downloads
SERVER-SIDE through the existing upload pipeline, stores in Inklee storage
and persists the Inklee reference. Public gallery images never render from
arbitrary third-party hosts. (Safe to enforce strictly: the gallery
capability has never been granted, so no external-URL gallery data exists.)

**FD5 [FINAL] — wishlist + seller-scoped carts BEFORE goods commerce enables;
SUPERSEDES GC5's deferral.** One cart per artist, never cross-artist
payments, wishlist may span artists, move-to-cart lands in the right seller
cart, Buy-now stays, checkout names the artist as seller. Full list in the
ruling; mobile parity included. Not optional polish.

**FD6 [FINAL] — variant-aware bundles BEFORE publication; SUPERSEDES GC7.**
Bundle components carry product + variant + quantity; checkout validates
existence/ownership/availability/stock/currency/price; historical orders
preserve the purchased variant composition; refund/restock/reconciliation
cover variant-bearing bundles.

**FD7 [FINAL] — independent non-cascading visibility; CONFIRMS S2** and adds
required UX: a clear per-surface visibility summary showing artists where
goods are currently public.

**FD8 [FINAL] — hub goods block gets an EXPLICIT destination setting;
SUPERSEDES S4.** Options: standalone shop (default for new configs) or
booking-page goods section. Only valid destinations offered; unavailable
destination -> warn the artist and hide the public block; never silently
re-route; selection preserved; destination visible in editor + preview. The
S4 hidden coupling is removed except when the booking page IS the selected
destination.

**FD9 [FINAL] — basic visibility controls stay Free forever; CONFIRMS S5.**
No `goods_tools` key for show/hide. Plus may own advanced merchandising
only.

**FD10 [FINAL] — one inherited appearance system is the ARCHITECTURE, not a
deferral; CONFIRMS S1/S6 and closes the question.** Product principle: "One
visual identity with surface-specific content configuration." New in-scope
work: surface-specific hero media, introduction text, featured
products/collections, selected content blocks per surface (within the one
appearance system). No independent theme editors, ever.

**FD11 [FINAL] — v2 legacy rates confirmed; CONFIRMS F14/ruling 14.**
Grandfathered Free appointment 3%, standard Free goods 5%, Plus appointment
0.5%, Plus goods 1%. Grandfathering preserves capability access, never Plus
pricing. v2 stays inactive until the accountant/Terms/notice/activation
chain completes.

**FD12 [FINAL] — partial refunds + native revise are pre-publication scope;
SUPERSEDES the Track A "leftovers by design".** Refund by line / quantity /
custom amount / full, remaining-balance arithmetic, deterministic fee +
processor-cost allocation, restock selection, cap-release behaviour, over-
and duplicate-refund prevention, no repeated cost retention, immutable
history, buyer confirmation, reconciliation, idempotency; historical
purchases stay refundable after archival. Native revise reaches parity with
the web revision flow.

**FD13 [FINAL] — approved marketing claims (default wording, subject only to
release-state verification).** Payments: "Collect deposits and full
appointment payments" / "Take a deposit first or collect the complete tattoo
price when the appointment is ready." Customization: "Customise your booking
page with templates, galleries and flexible sections" / "Shape your page
around your style with custom templates, image galleries and flexible
content layouts." Never "fully customisable", never page-builder claims,
sentence case, no em dashes, every claim verified against the registry.

### 2026-08-01 — FD build slice 1 implementation note (FD1, FD3, FD11, FD13)

Implements the board's slice-1 items from `plus-consolidated-review-handoff.md`
§1a. Full narrative in `docs/product/plus-build-progress.md` (2026-08-01
entry); this note records what moved where and the no-split-gating
verification specifically, since those are the facts a later reader of THIS
file would look for.

**FD1 — what moved.** `rich_content_blocks` is a new entry in
`ENTITLEMENT_FEATURES` (`packages/shared/src/entitlements.ts`) and in
`CAPABILITIES` (`packages/shared/src/app-config.ts`, additive mobile-config
wire — an older client that doesn't know the name simply never matches it).
A new GRANT gate, `richContentBlocksAllowed` (`apps/web/src/lib/server/
entitlement-gates.ts`), replaced `appearanceCustomAllowed` at every gallery
call site: the hub render gate (`app/[slug]/hub/page.tsx`), both save-path
gates (`saveBioPageAction` + `uploadGalleryImageAction` in `link-hub/
actions.ts`, and `POST /api/mobile/settings/hub`), and both editor render
gates (`link-hub/page.tsx`, the mobile `GET` in the same route).
`appearance_custom` keeps every non-gallery use unchanged (styling/templates
only, per its corrected registry row).

**No-split-gating verification.** `grep -rn "appearance_custom" apps/web/src
apps/mobile` (2026-08-01) returns: the `appearanceCustomAllowed` function
definition and its own tests (still valid — it governs styling, unchanged),
the `app-config.ts` lockstep list, one admin label, and comments that
narrate the FD1 supersession for a future reader. Zero call sites gate a
gallery-related check on `appearance_custom` anymore. No grant migration was
needed: `computeLegacyFreeV1Grant` (`entitlements.ts`) only ever produced
`{ features: { custom_templates: true }, limits: {...} }`, so the
legacy_free_v1 cohort never held the gallery capability under the old gate
either, and a new `entitlement-gates.test.ts` describe block
(`richContentBlocksAllowed (FD1: split off appearance_custom)`) pins that a
grandfathered account with `custom_templates` does NOT get
`rich_content_blocks`.

**FD3 + FD13 — where the wording landed.** `PLUS_BENEFITS`
(`packages/shared/src/plus-benefits.ts`) now carries "Collect deposits and
full appointment payments" (replacing "Collect card deposits in-app") and
"Customise your booking page with templates, galleries and flexible
sections" (new), both release-state-verified against
`plus-capability-registry.ts` before adding (payments: A1-A8 built,
registry "ready"; customization: `form_custom` built + the new
`rich_content_blocks` capability, both cited on the registry rows). FD3's
"Flexible section layouts and page templates" phrasing is recorded as
approved-but-withheld on the `appearance_custom` registry row (still "build"
readiness, 5 surfaces + both editors remain) — not published on any live
surface yet. Forbidden-phrasing sweep across `apps/` and `packages/shared/
src` found zero live occurrences of "fully customisable" / page-builder
language in any user-facing string.

**FD11 — verified, nothing rebuilt.** The chain already held, split across
`entitlements.test.ts` (grandfathered Free → `"legacy"` tier, not `"plus"`)
and `fee-schedule-legacy.test.ts` (`"legacy"` → 300bps under v2, not the
Plus 50bps). Added one explicit test naming the full composition
(`entitlements.test.ts`, "FD11: a grandfathered artist without Plus does not
get Plus pricing"). Per-transaction `fee_tier` stamps confirmed by reading
migration `0136_fee_tier_stamp.sql` and the four write sites
(`bookings.ts:943`, `appointment-payment-intent.ts:689`,
`appointment-payment-settlement.ts:189`, `goods-checkout.ts:473`).

Validation: `npx tsc --noEmit` clean (web + mobile), eslint 0 errors on every
touched file, full `npx vitest run` 164 files / 2831 passed + 1 expected fail
(baseline 2823 passed + 1 expected fail, +8 exactly matching the tests this
slice added), zero regressions.

### 2026-08-01 — FD4 implementation note (gallery "Import from URL")

Implements board item FD4 (`plus-consolidated-review-handoff.md` §1a):
"the permanent raw URL field is REMOVED; SUPERSEDES GB2." Full narrative in
`docs/product/plus-build-progress.md`.

**What changed.** `link-hub/bio-page-form.tsx`'s per-image editable url
`<input>` (the field an artist could paste ANY url into) is gone, replaced by
a read-only thumbnail plus an "Import from URL" control beside "Upload
image". The new `importGalleryImageFromUrlAction` (`link-hub/actions.ts`)
downloads the artist-supplied URL SERVER-SIDE — under an SSRF guard
(`lib/server/ssrf-guard.ts`: resolves the hostname via DNS, refuses a
private/loopback/link-local/cloud-metadata address, fails closed on a lookup
error) plus `redirect:"error"` (no bypass via a redirect to an internal
host) plus a mid-stream byte-count abort (`gallery-url-import.ts`: the 4MB
cap holds even against a body with no, or a false, Content-Length) — then
re-encodes and stores it through the SAME `processAndUpload` pipeline a
direct upload uses. A 20/artist/hour rate limit
(`checkGalleryImportRateLimit`, `lib/ratelimit.ts`) sits before the fetch,
since this action spends Inklee's own egress on an otherwise-arbitrary host.
The shared parser (`sanitizeHostedGalleryImageUrl`, `packages/shared/src/
bio-page.ts`) now ALSO refuses a gallery image whose url is not on this
project's Supabase Storage `logos` bucket, so a hand-crafted save payload
naming an external URL is dropped at the data layer, not merely hidden by
the editor UI. Safe to enforce this strictly, retroactively: the gallery
capability has never been granted (verified against
`computeLegacyFreeV1Grant`, entitlements.ts, same check as FD1), so no
external-URL gallery data exists anywhere to break.

**Scope boundary.** Web-only, matching D4's existing web-only-editing-v1
posture: the native editor is unchanged (still a read-only summary) and does
not gain an import affordance in this slice — native gallery editing,
including import, is FD2 (a separate, already-queued build item), not part
of FD4.

**Residual risk, recorded rather than hidden**
(`docs/audit/findings.yaml`): the SSRF guard validates the resolved address
BEFORE the request, not the address the eventual `fetch()` call actually
connects to. A DNS-rebinding attacker who controls a domain's records could
in principle serve a public address to the check and a private one moments
later to the real connection. `redirect:"error"` closes the OTHER classic
SSRF bypass (redirect-to-internal-host) completely, since there is no second
hop to rebind. Fully closing the DNS-rebinding gap needs resolving to ONE
validated address and connecting to it directly (bypassing the independent
DNS lookup inside `fetch`) via a custom dispatcher — a larger change than
this slice, flagged rather than silently accepted as solved. The SAME gap
exists, more exposed, in the pre-existing `downloadInstagramThumbnail`
(`instagram-storage.ts`), which runs unattended in background sync rather
than from a single explicit artist action and has no address-validation step
at all today (only a fixed CDN host-suffix allowlist).

Validation: `npx tsc --noEmit` clean (web + mobile), eslint 0 errors on every
touched file; new/updated tests: `ssrf-guard.test.ts` (12), `gallery-url-
import.test.ts` (12), `upload-gallery-image.test.ts` (extended, 14 total: 7
original + 7 new in the import/rate-limit describe block), `bio-page-settings.test.ts`
(extended with the FD4 hosted-only parser tests + a dedicated
`sanitizeHostedGalleryImageUrl` describe block). Full `npx vitest run`: 166
files, 2868 passed + 1 expected fail (2869 total), up from the
2831-passed/1-expected-fail FD1 baseline by exactly the 37 tests this slice
added, zero regressions. `docs/audit/findings.yaml` updated: new findings
`HUB-GAL-002` (the guard's DNS-rebinding residual risk, self-flagged rather
than left unrecorded) and `HUB-GAL-003` (an earlier draft of the byte cap
read the WHOLE response via `res.arrayBuffer()` before checking its length,
found re-reading against this brief's own "cap DURING streaming"
requirement and fixed in the same slice by switching to a
`res.body.getReader()` running-total mid-stream abort; mutation-proven —
deleting the abort check flips exactly the MID-STREAM test) plus coverage
rows; `pnpm audit:validate` and `pnpm audit:generate` both clean.
