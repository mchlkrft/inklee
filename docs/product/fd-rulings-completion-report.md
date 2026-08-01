# FD1-FD13 completion report

**2026-08-01. Every FD ruling is implemented. Nothing is activated.** Local
`master` is 123 commits ahead of `origin/master`, unpushed; migrations
0125-0141 are not in production. This report is the consolidated answer to the
founder's fourteen required items.

---

## 1. Implementation status, FD1-FD13

| # | Ruling | Status | Where |
|---|---|---|---|
| FD1 | Dedicated `rich_content_blocks` capability; galleries off `appearance_custom` | **Done** | `02c8b814` |
| FD2 | Native gallery editing before publication | **Done** | `18846296` |
| FD3 | "Section layouts" = the shipped template layer | **Done** (confirmed, wording applied) | `02c8b814` |
| FD4 | URL field removed; server-side "Import from URL" | **Done** | `45a44bee`, `6bac9914` |
| FD5 | Wishlist + seller-scoped carts before goods enable | **Done** | `9621e44b` (0141) |
| FD6 | Variant-aware bundles before publication | **Done** | `88c9e544` (0138), `48cfbab2` (0140) |
| FD7 | Non-cascading per-surface visibility + summary UX | **Done** | `db9cbcd3`, `b2da53c7` |
| FD8 | Explicit hub goods-block destination | **Done** | `db9cbcd3` |
| FD9 | Basic visibility controls stay Free; no `goods_tools` | **Done** (verified nothing was gated) | `02c8b814` |
| FD10 | One appearance system + surface content config | **Done** | `f043763f` |
| FD11 | v2 legacy rates final; grandfathering is not Plus pricing | **Done** (verified encoded + stamped) | `02c8b814`, 0136 |
| FD12 | Partial refunds + native revise | **Done** | `c3699793` (0139), `01003200` |
| FD13 | Approved marketing claims | **Done** | `02c8b814` |

Three rulings resolved differently from their literal wording, each recorded
with reasoning rather than quietly reinterpreted:

- **FD2's "gallery visibility controls"** — the web editor has none either. A
  gallery's visibility IS its presence in the block list, which native
  supports. Nothing to port; no gap.
- **FD5's "guest AND authenticated buyer behaviour"** — this product has no
  buyer accounts (verified in the auth code, not assumed). One buyer identity
  exists, so there is one behaviour. No account system was invented to satisfy
  the wording.
- **FD10's guest-spot surface content** — that appearance surface has zero
  renderers. Content config there would be inert past the parser, so it was
  deliberately not built.

## 2. Files changed

Roughly 190 files across 8 feature commits and 6 fix commits. Principal new
modules: `hub-gallery-upload.ts`, `ssrf-guard.ts`, `gallery-url-import.ts`,
`goods-visibility.ts`, `goods-visibility-summary.ts`, `surface-content.ts`
(shared + server + write), `shop-guest-identity.ts`, `shop-cart.ts`,
`shop-wishlist.ts`, `goods-order-refund.ts`, `refund-fee-treatment.ts`,
`refund-ledger.ts`; native `GalleryBlockEditor.tsx` and
`bookings/payments/[id]/revise.tsx`; the `/wishlist` route and
`goods/sales/[id]`.

## 3. Migrations

**0138** bundle item variants (two-constraint NULL solution) · **0139** refund
ledger + order processor-cost columns · **0140** repairs 0138's tautological
RLS check · **0141** shop carts, cart items, wishlist, `orders.cart_id`.
All four are local-only. The release set is now **0125-0141**.

## 4. Capability changes

`rich_content_blocks` minted (galleries and future rich sections);
`appearance_custom` narrowed to styling only. No other key added — FD9
explicitly forbids one for visibility controls, and the registry's proposed
`goods_tools` stays unminted.

## 5. Web work

Capability split with zero residual gallery gating (grep-proven); approved
marketing claims, release-state-verified against the registry; gallery
Import-from-URL with a hardened SSRF guard; per-surface visibility summary and
explicit hub destination; shop surface content (hero, intro, featured
collections) consumed by both the standalone checkout and the booking teaser;
variant-aware bundles end to end; partial refunds across both lanes with
by-line UI and a goods order-detail page; seller-scoped carts and a
cross-artist wishlist.

## 6. Native work

Full gallery editing (upload, delete, reorder, captions, layout, entitlement
and downgrade states, progress, retry, unsupported-file handling, empty
states); the payment-request revise screen; bundle variant pickers. No native
cart or wishlist UI — buyer surfaces are web-only by the established decision,
and the artist-side Sales screens need no change because a cart-originated
order is indistinguishable from a Buy-now order.

## 7. Tests added

Web suite **2823 → 3101 passing** (+278, plus the one long-standing expected
fail). Database suite **235 → 255**, and it now runs at all: no session before
this one had a Postgres, so migrations 0135-0141 had never been executed
anywhere.

## 8. Test results

Web 180 files, 3101 passed + 1 expected fail. Database 255/255. `tsc` clean on
both apps. Full `eslint` clean (a Supabase CLI scratch directory was breaking
it; now ignored). `pnpm audit:check` clean at 129 findings / 86 coverage areas.

## 9. Unresolved engineering defects

Open, none blocking further build:

| Finding | What |
|---|---|
| HUB-GAL-002 | DNS-rebinding TOCTOU in the import guard; risk-accepted, narrowed by the blanket IPv6 refusal |
| HUB-GAL-007 | An image uploaded but never saved is an orphan the diff cannot see; sweep proposed at un-park |
| SHOP-MIG-002 | `order_items.bundle_id` is a single-column FK; risk-accepted (no artist column to compose with) |
| PAY-RFD-008 | Needs a Stripe test-mode reproduction before any code change |
| SHOP-ORD-003, SHOP-FUL-005 | Bounded sweep and settle-posture items, both fixed-unverified |

**Fixed but not independently verified:** PAY-RFD-009, PAY-RFD-010,
TEST-VAC-008, GOODS-VAR-001, HUB-GAL-004/005/006, HUB-DST-001.

**Explicitly NOT verified** (round 5 said so itself, and this report will not
claim otherwise): the refund arithmetic across three or more successive
partial refunds; cart-clear on webhook redelivery and on failed payment; cart
repricing when the catalog moves underneath it; guest cookie handling; FD6's
one-rule `resolveBundleComponent` claim and the expansion's variant
pass-through; the native revise screen. No Stripe call has been made in any
verification round.

## 10. Counsel review items accumulated

CL10 (external image import: Inklee now hosts content fetched from arbitrary
origins on the artist's instruction), CL11 (guest carts and wishlists: a new,
minimal personal-data store needing GS4 treatment and an abandoned-cart
retention rule), CL12 (partial-refund disclosures, which also land on GS2's
return-right wording since a partial return of a multi-item order is exactly
that case). All three are in the consolidated handoff's counsel batch,
described as-built with commit references.

## 11. Accountant review items accumulated

AC9 (partial-refund allocation: proportional per-line fee allocation,
processor cost retained only once and only up to what is proven, refusal
rather than clamping on ledger disagreement) and AC10 (variant-bearing bundle
refunds; reconciliation impact only). Both as-built in the handoff.

## 12. Activation gates still closed

`ACTIVE_FEE_SCHEDULE_VERSION` = v1 · fee-refund policy v0 ·
`GOODS_COMMERCE_ENABLED` off · `consumer_sales_launch_approved` unrecorded ·
`custom_templates`, `analytics`, `entitlement_caps` parked ·
`rich_content_blocks`, `goods_collections`, `goods_bundles` ungranted · no
live Stripe object created · nothing pushed. FA1-FA12 are unchanged and
unstarted.

## 13. Release-sequencer impact

The release set grew from 0125-0137 to **0125-0141** (four new migrations).
Two carry ordering constraints worth stating: **0140 must follow 0138** (it
repairs 0138's policy), and **0139/0141 add tables whose writes are
service-role-only**, so the seed-file REVOKE mirror matters on any local
reset — a gap already found and fixed during FD12. Pushing `master` still
deploys code that expects every one of these, so the migration-first sequence
is unchanged and mandatory.

## 14. Remaining work before a release candidate

1. **Independent verification of what round 5 could not cover** (list in §9).
   The refund arithmetic across successive partials is the highest-value item.
2. **Run the database suite in CI.** It was dark for the entire build and hid
   a real defect for a day; a canary-proven RLS policy sweep should join it,
   since that defect class is invisible to review.
3. **Fresh EAS build** covering the native gallery editor, revise screen and
   bundle variant pickers — it gates granting the mobile-dependent
   capabilities.
4. **The counsel and accountant packages** (§10, §11) with the rest of the
   consolidated handoff.
5. **FA1-FA12** in order, starting with the migration-first release.

Nothing in this list is a product decision. Every FD ruling is resolved.
