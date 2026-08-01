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
