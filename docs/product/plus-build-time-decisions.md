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
