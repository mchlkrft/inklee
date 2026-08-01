# Plus build — consolidated review handoff (founder / counsel / accountant)

**Date: 2026-08-01. State: the complete intended Plus + goods product is BUILT,
integrated, tested and dark.** This is the one consolidated package the
2026-07-31 no-deferral directive pointed at: every decision that still needs a
human owner, in one place, grouped by who answers it. Reasoning and
alternatives for every provisional entry live in
`docs/product/plus-build-time-decisions.md` (cited by id); evidence lives in
`docs/audit/findings.yaml`; item history in
`docs/product/plus-open-decisions-handoff.md` (whose per-owner queues this
document supersedes as the review list).

**Build state in one paragraph.** Local `master` is **123 commits ahead** of
`origin/master`, unpushed. Migrations **0125-0141 are NOT applied to
production**; pushing master deploys code that expects them, so the release
requires the sequencer flow (apply catalog-verified, then push, never a casual
push), and 0140 must follow 0138. Everything money-adjacent is behind gates:
`ACTIVE_FEE_SCHEDULE_VERSION` = v1, fee-refund policy v0,
`GOODS_COMMERCE_ENABLED` off, `consumer_sales_launch_approved` unrecorded,
three capabilities parked and three ungranted. The audit register holds **129
findings and 86 coverage areas**; the web suite is 3101 passing and the
database suite 255 passing (it ran for the first time on 2026-08-01 and
immediately found a real defect). **All thirteen founder rulings FD1-FD13 are
implemented** — see `docs/product/fd-rulings-completion-report.md` for the
per-ruling status, what is verified, and what explicitly is not.

**The one hard line (unchanged).** Nothing in this document is an approval.
Building against a provisional call is not going live: no fee/refund flip, no
launch key, no irreversible Stripe object, no un-park happens on the strength
of an entry here.

---

## 1. FOUNDER — decisions and go-actions

### 1a. FOUNDER RULINGS RECEIVED 2026-08-01 — FD1-FD13 are FINAL

All thirteen items were ruled the same day (full text in
`docs/product/plus-build-time-decisions.md`, FD rulings section). Do not
re-ask. Implementation state is the FD build board below.

| # | Ruling (disposition of the provisional entry) | Build state |
|---|---|---|
| FD1 | New `rich_content_blocks` capability; galleries move OFF `appearance_custom` (supersedes D1) | in build (slice 1) |
| FD2 | Native gallery editing ships BEFORE publication (supersedes D4); grant still EAS-gated | queued (#48) |
| FD3 | "Section layouts" = shipped template layer, confirmed (D6); approved phrasing "Flexible section layouts and page templates" | in build (slice 1) |
| FD4 | URL field removed; secondary server-side "Import from URL" into Inklee storage (supersedes GB2) | queued (#43) |
| FD5 | Wishlist + seller-scoped carts BEFORE goods enables (supersedes GC5's deferral); Buy-now stays | queued (#49, after FD6/FD8) |
| FD6 | Variant-aware bundles BEFORE publication (supersedes GC7) | queued (#46) |
| FD7 | Non-cascading per-surface visibility confirmed (S2) + a visibility summary UX required | queued (#44) |
| FD8 | Hub goods block gets an explicit destination setting, default standalone shop (supersedes S4's hidden coupling) | queued (#44) |
| FD9 | Basic visibility controls stay Free forever (confirms S5); no `goods_tools` | done (nothing gated today; verified in slice 1) |
| FD10 | ONE appearance system is FINAL architecture (closes S1); surface content config (hero/intro/featured) is in scope | queued (#45) |
| FD11 | v2 legacy rates FINAL: 3% legacy appt / 5% Free goods / 0.5% Plus appt / 1% Plus goods; grandfathering ≠ Plus pricing | verify in slice 1 (encoded + stamped already) |
| FD12 | Partial refunds (line/quantity/custom) + native revise = pre-publication scope (supersedes Track A leftovers) | queued (#47) |
| FD13 | Marketing claims approved as default wording (payments + customization headlines) | in build (slice 1) |

### 1b. Go-actions only the founder can execute (activation checklist, in order)

| # | Action | Blocks |
|---|---|---|
| FA1 | **Release the build**: apply migrations 0125-0137 to prod (catalog-verified, release-sequencer flow), then push master | Everything below; nothing is deployable before it |
| FA2 | G-5 live-money test (real Connect onboarding + charge + refund) — no real charge has EVER been observed end-to-end | Any external payment use |
| FA3 | Fresh EAS build — current `da93749b` predates image-gallery, bundles, featured_collection, the payments screens | Granting `goods_collections` / `goods_bundles` / gallery block capabilities |
| FA4 | Stripe dashboard: verify the dispute events subscription on the LIVE webhook (F11; handler is built + tested) | Dispute handling live |
| FA5 | Un-park `custom_templates` / `analytics` / `entitlement_caps` (X3); re-run the legacy recompute IMMEDIATELY before cap enforcement (F4 tail) | F12 |
| FA6 | Run `migrate-deposits-key.cjs` against prod (X4) | Payment entitlement cutover |
| FA7 | Insert the `founder_offer_policy` row at release (F7; offer stays closed until then) | Founder offer |
| FA8 | Re-record the 4 engineering approval keys against the final release candidate (F10) | F12 |
| FA9 | Stage-6 versioned Terms edit (includes X2 line-76 wording + the GS/PAY items counsel returns) via the enforced snapshot workflow, counsel re-confirm | F12, fee v2 flip, refund v1 flip |
| FA10 | Record `consumer_sales_launch_approved` — the final gate, by design (F12) | Consumer sales |
| FA11 | Flip `ACTIVE_FEE_SCHEDULE_VERSION` to v2 AFTER accountant sign-off (A3) + Terms/advance notice | Real fee revenue |
| FA12 | Un-park `GOODS_COMMERCE_ENABLED` — only after GS1-GS4 + GA1-GA2 below are answered AND FA2 | The whole goods shop |

---

## 2. COUNSEL — one batch, queued with the C1 final sign-off package

The consumer/withdrawal/VAT/subscription ARCHITECTURE is confirmed; none of
this reopens it. These are the final-implementation items, including the one
surface counsel has NEVER seen: the standalone goods shop (guest consumers
buying physical goods from artists on Inklee-hosted checkout).

| # | Item | What exists (provisional posture) | What counsel decides |
|---|---|---|---|
| CL1 | **C1 final sign-off package** | Final Terms draft, checkout disclosures, declarations, withdrawal flow, the implementation itself; 6-point checklist in the old handoff. Goods-marketplace wording = the never-reviewed component, now materially widened by CL2-CL6. | The one consolidated approval, recorded against versioned artifacts. |
| CL2 | **GS1 — distance-selling duties on the standalone checkout** | Items, prices, server-confirmed total on the pay button, artist named as counterparty; plain "Pay" button. | Full Art. 6/8 CRD information set at order time? "Order with obligation to pay" button label? |
| CL3 | **GS2 — goods return right** | Refund machinery exists (full/partial, restock, cap release); NO return-right or Art. 16(c) personalised-goods disclosure anywhere. | Return-right wording, return-cost allocation, where 16(c) is claimed. |
| CL4 | **GS3 — durable goods order confirmation** | Buyer receipt email: items, total, artist, "arranged with the artist directly". No seller identity/address, no return instructions, no terms. | Must it carry the Art. 8(7)-style set, and exactly what content? |
| CL5 | **GS4 — guest-buyer GDPR** | Guest email stored on the order, used for receipt + fulfilment. No privacy notice on the page, no records-of-processing entry. NEW since the last board: cancelled/abandoned standalone orders retain the guest email with no purge path (the 24h sweep cancels the row but nothing erases it; flagged in SHOP-ORD-001's remediation note). | Privacy notice, RoP entry, retention rule for cancelled-order emails vs the 7-year financial-records rule. |
| CL6 | **GB3 — hosted client photos** | Gallery images on the public-unlisted bucket; downgrade hides the render, not the object; deletion paths built. Tattoo photos are health-adjacent personal data on skin. | Public-unlisted OK, or direct signed URLs (moderate rework)? |
| CL7 | **PAY-RFD-002 Terms half** | Artist-cancellation refunds retain only the evidenced processor cost (built + verified). | Terms coverage of the retained-cost rule BEFORE the fee-refund policy v1 flip. |
| CL8 | **C4 / LO-10 round** | Preliminary directions given; brief written. | Schedule + close before real client money. |
| CL9 | **C3 administrative tail** | E1-E5 approved and verified in-product. | Record `consumer_withdrawal_copy_approved` once the C2 screenshot is in the C1 package; E4 pre-login cancellation fast-follow stays logged in `plus-launch-followup.md`. |
| CL10 | **FD4 external image import** (BUILT, `45a44bee` + `6bac9914`) | "Import from URL" fetches an artist-supplied URL server-side, re-encodes it through the same pipeline as a direct upload, and stores it in Inklee storage; the public page then serves Inklee's copy, never the third party. SSRF-guarded (private/loopback/metadata ranges refused, the whole IPv6 family refused, redirects refused, streaming size cap, credentials refused, 20 per artist per hour) and independently verified. Inklee becomes the HOST of content fetched from arbitrary origins on the artist's instruction. | Copyright and liability posture for artist-instructed imports; whether an artist attestation is needed at import time; how this interacts with the GB3 hosted-photo analysis (same bucket, same downgrade posture). |
| CL11 | **FD5 carts and wishlists for guests** (BUILT, `9621e44b`, migration 0141) | Guest identity is an opaque random token in an httpOnly cookie; only its SHA-256 hash is stored (the pattern booking tokens already use). Server-side rows: one cart per guest identity per artist, plus a cross-artist wishlist. Cart rows store POINTERS ONLY (product, variant or bundle id plus quantity), never prices or titles. No buyer accounts exist in the product, so there is one buyer identity, not two. | The cookie plus hashed-token mechanism needs the GS4 privacy-notice and records-of-processing treatment: it is a new personal-data store, however minimal. Retention for abandoned carts belongs with the cancelled-order email question already in GS4. Per-cart seller identification folds into GS1's marketplace-clarity answer. |
| CL12 | **FD12 partial-refund disclosures** (BUILT, `c3699793`, migration 0139) | Refund by line, by quantity, by custom amount and in full, across both the appointment and goods lanes, with an immutable refunds and refund_lines ledger and a buyer confirmation email. Fee and processor-cost treatment reuse the PAY-RFD-002 decision tree. | The buyer-facing refund confirmation's content, and any disclosure required where a processor cost is retained rather than returned, fold into CL7's Terms coverage. Partial refunds also land on GS2's return-right wording: a partial return of a multi-item goods order is exactly the case that text must address. |

## 3. ACCOUNTANT — one batch

| # | Item | What exists | What the accountant confirms |
|---|---|---|---|
| AC1 | **A1 — price display co-sign** (head of the launch chain, irreversible Stripe Price semantics) | 3.00 EUR/mo inclusive, `tax_behavior=inclusive`, live Price exists; VAT-absorption caution drafted. | Co-sign; record the caution. |
| AC2 | **A2 — thresholds + monitoring** | 35k EE / 8k EU-B2C alerts built; quarterly cadence proposed (accountant monitors, founder owns re-approval). | Confirm numbers, cadence, and that FEE revenue counts toward them. |
| AC3 | **A3 — fee schedule v2 sign-off** | v2 fully encoded (Plus 0.5% / legacy 3% appointment; Free 5% / Plus 1% goods), inactive; per-transaction version + tier stamps now persisted (Track D). Conditions already named: Terms + advance notice for the new Free goods fee. | Sign off the flip preconditions. |
| AC4 | **GA1 — standalone goods flow classification** | Artist merchant of record (`on_behalf_of` + destination charge); Inklee's only take = `application_fee_amount` (0% under v1). | Model unchanged? How goods fee revenue classifies for the thresholds (ties into AC2/LO-10). |
| AC5 | **GA2 — goods invoicing** | Receipt email "on behalf of the artist"; no invoice document for goods (A4 covered Plus subscriptions only). | Whether artist-as-seller goods sales need a document beyond the email, and whose obligation it is. |
| AC6 | **GC2 — discount-cap release on full refund** | A fully refunded order deletes its redemption, freeing the code's cap. | Matches intended discount semantics (minor). |
| AC7 | **D2 — "(card processing included)" at 0.5%** | The parenthetical is now conditional on the shown rate being exactly 300 bps; at Plus 0.5% it is suppressed pending this answer. | Can the 0.5% rate's cost/margin split ever carry that claim, or does it need its own wording? |
| AC8 | **PAY-RFD-002 fee treatment** | Retained-processor-cost refunds built + verified, policy v1 inactive. | Fee/tax treatment of the retained cost BEFORE the v1 flip. |
| AC9 | **FD12 partial-refund allocation** (BUILT, `c3699793`, migration 0139) | Per-line application-fee allocation proportional to each refund's share; processor cost retained only up to what is proven and never twice (guarded by a recorded-retained column); an immutable per-line ledger; and a refusal, not a clamp, whenever the per-line ledger disagrees with the order-level balance. Fee schedule version AND resolved tier are stamped per transaction (Track D, migration 0136). | That this allocation method matches the intended accounting treatment; how partially refunded transactions classify; whether a retained processor cost needs separate treatment from a returned fee in the books. |
| AC10 | **FD6 variant-bearing bundle refunds** (BUILT, `88c9e544`, migration 0138) | A sold bundle keeps a sale-time composition snapshot carrying each component's product, variant, quantity and list price, so a refund restocks the exact variant sold even after the product, variant or bundle is archived or deleted. | Reconciliation impact only, and minor: it rides AC9's method. Worth one look at whether the snapshot's per-component list prices are ever needed for the books, or remain records only. |

---

## Answers (counsel + accountant review, 2026-08-01)

Nothing in §6 is re-asked. The goods shop (CL2-CL6, AC4-AC5) is the genuinely
new surface and gets the most substance; everything else confirms or carries a
prior condition forward.

### CL2 (GS1) — standalone checkout: the current build is NOT sufficient

Two hard requirements:

1. **The pay button must carry an "Order with obligation to pay" label** (or
   equally unambiguous wording). A plain "Pay" fails Art. 8(2) CRD; the
   consequence of failure is that the consumer is not bound by the order. Same
   standard already applied to the Plus checkout — apply it here verbatim.
2. **The full Art. 6(1) information set at order time**, on or directly
   reachable from the checkout screen: the **artist's identity and geographic
   address** (seller disclosure — "artist named as counterparty" is not enough;
   the trader's address is a listed item), main characteristics, total price
   including any delivery cost or the statement that delivery is arranged and
   charged separately, delivery arrangements, the return right (CL3), and the
   complaint/contact route. Since the artist is the seller, Inklee's artist
   Terms must oblige artists to keep their seller identity data current — the
   checkout can only display what the platform holds.

### CL3 (GS2) — return right: build the disclosure before un-park; the silence is expensive

Goods carry their own 14-day return right, distinct from the services
withdrawal already built. Required: return-right wording at checkout and in the
confirmation (CL4); **return-cost allocation stated expressly** (the consumer
bears return shipping only if told beforehand — silence means the seller pays);
the model withdrawal form available. **Art. 16(c)** (personalised /
custom-made goods) must be claimed **per product, expressly, at checkout** —
a per-product "custom made to your specification — no return right" flag set
by the artist, not a blanket Terms clause. The penalty for not disclosing the
return right is the Art. 10 extension: the return window runs up to **12
months**, and the consumer owes nothing for diminished value. This is the
costliest omission in the goods build; treat it as un-park-blocking.

### CL4 (GS3) — goods confirmation: yes, the Art. 8(7) set applies

The current receipt ("items, total, artist, arranged with the artist
directly") is not a conforming confirmation. It must add: the **artist's
seller identity and address**, the return instructions and model form (or the
16(c) claim where flagged), the delivery arrangement, and the applicable terms
— on the durable medium itself (in the email or an attachment, not only a
link). Same principle already applied to the Plus E2 email; extend the pattern.

### CL5 (GS4) — guest-buyer GDPR: three items, one is a real gap

1. **Privacy notice at collection:** a short notice at the email field
   ("used for your receipt and order handling; shared with the artist for
   fulfilment; kept as part of the order record") linking the full policy. The
   guest email's lawful basis is Art. 6(1)(b) (contract) — no consent box.
2. **RoP entry:** add guest-order processing to the Art. 30 record (data
   categories: email, order contents; recipients: the artist, Stripe;
   retention: below).
3. **Retention — the gap:** completed orders follow the 7-year financial-
   records rule (Art. 6(1)(c)). **Cancelled/abandoned orders have no such
   basis** — a cancelled row's guest email has no legal-obligation anchor and
   currently no purge path (SHOP-ORD-001). Required: a purge job erasing or
   pseudonymising guest contact data on cancelled/abandoned orders after a
   short operational window (30 days is defensible; pick one and record it).
   **Un-park-blocking**, cheap to build.

### CL6 (GB3) — hosted client photos: conditional pass, signed URLs as bounded fast-follow

Unguessable URLs are not access control, and tattoo photos are health-adjacent
personal data — Art. 32 proportionality points to signed URLs. Position:
public-unlisted is **acceptable at launch only** on all of: high-entropy
object paths, no directory listing, bucket excluded from indexing, and —
correcting the current behaviour — **downgrade/removal deletes or relocates
the object, not just the render**. "Hides the render, not the object" is the
part that fails even the interim standard: an ex-subscriber's client photos
remaining fetchable is a live confidentiality exposure. Move to signed URLs as
a **dated** fast-follow (same discipline as the E4 pre-login route), before any
gallery marketing push. Related: **LO-5 (the booking-image DPIA) still has no
completion record**, and the gallery + guest checkout widen its scope — fold
both into the DPIA and complete it before FA10; the account-deletion handoff
already makes it release-gating.

### CL7 — confirmed, carried forward

The retained-cost rule enters the Terms in the single FA9 re-roll, before the
fee-refund v1 flip. The three 2026-07-31 conditions stand (Terms first,
evidenced cost only, client's refund unaffected). Built-and-verified on the
code side per PAY-RFD-002; the Terms half is what FA9 closes.

### CL8 — unchanged

Schedule the LO-10 round; the 2026-07-31 preliminary directions stand. The
binding boundary remains: **closed before beta artists take real client
money** (FA2 as a founder-run test is fine; FA12/goods and real deposits are
not).

### CL9 — record it

E1-E5 approved and verified; record `consumer_withdrawal_copy_approved` when
the C2 screenshot enters the C1 package. The E4 fast-follow stays logged.

### CL1 — final package: checklist updated for the goods surface

The 6-point checklist from the prior handoff stands, with these substitutions:
item 5 (goods wording) is now **CL2-CL5 as implemented** — checkout screenshot
with the obligation-to-pay button and seller disclosure, the return-right and
16(c) flag as rendered, the conforming confirmation email, and the guest
privacy notice + purge rule; add **CL6's interim photo controls + the
completed LO-5 DPIA** as item 7. One Terms re-roll (FA9) carries X2 + CL2-CL5
texts + CL7 in a single version bump. Sign-off records against the final
hashes, per the version-bound design.

### AC1 — co-sign recommended (unchanged from 2026-07-31)

Inclusive 3.00 EUR is the correct D1/D2 implementation; record the
VAT-absorption caution in the A2 trigger file. Note the live Price already
exists — the co-sign is now ratification, which is acceptable since the
replaceable-Price design keeps a future correction non-destructive.

### AC2 — confirm, with the conservative counting rule

35k EE / 8k EU-B2C alerts, quarterly accountant check, founder/board owns
re-approval. Until LO-10 settles fee-revenue classification (AC4), **count all
platform-fee revenue toward the 40k Estonian counter** — over-counting toward
an alert threshold is safe, under-counting is the silent failure mode.

### AC3 — preconditions confirmed; F14 closed by FD11

Sign-off scope: no VAT on any v2 fee line while unregistered; the flip waits
on FA9 (Terms + advance notice for the new Free goods 5%) — notice period
recommendation: 30 days to existing users. The former UNDEFINED cell is now
encoded (legacy 3%/5% per FD11), so the schedule is complete; approve against
v2 as encoded.

### AC4 (GA1) — model confirmed; classification answer

`on_behalf_of` + destination charge + `application_fee_amount` keeps the
artist as merchant of record and Inklee's take as a platform fee — consistent
with the LO-2/LO-10 deposit analysis; no change to the MoR position. For the
thresholds: the goods platform fee is a **B2B service to the artist-as-trader**
(an artist selling goods to the public acts in trade for this purpose,
regardless of the consumer-framed Plus subscription). Fees to Estonian artists
count toward the 40k domestic counter; fees to other-EU artists are
customer-country supplies and count toward neither Estonian counter — but per
AC2, count everything to the alert until LO-10 confirms.

### AC5 (GA2) — no separate Inklee invoice to the buyer; extend the receipt

Any buyer-facing invoicing obligation for goods belongs to the **artist as
seller**, and consumer goods sales generally require none unless requested or
local law demands it. Inklee's receipt "on behalf of the artist" is the right
construction, but it must carry the CL4 content (artist identity/address —
that closes both items at once). Inklee's own document obligation is its **fee
invoice to the artist** once the goods fee is non-zero — reuse the A4
non-registered format. Recommend the artist Terms state that buyer-requested
invoices are the artist's obligation, with Inklee providing the order data.

### AC6 (GC2) — confirmed

Full refund deleting the redemption and freeing the cap is coherent: the
discount was never economically consumed. No tax dimension while unregistered.

### AC7 (D2) — the claim is true if, and only if, fees.payer stays "application"

"(card processing included)" states who bears the processing cost, not the
margin. With `fees.payer: application`, Inklee pays Stripe's fee at any rate,
so the parenthetical is factually accurate even at 0.5% — where it is a
deliberate subsidy (Stripe's ~1.5% + 0.25 exceeds the fee). Two conditions:
(1) founder confirms the per-transaction subsidy at 0.5% is intended
commercial policy, recorded; (2) if the fee-payer model ever changes, the
claim flips to misleading — bind the parenthetical to the `fees.payer`
setting, not to the rate. Suggested robust wording either way: **"no separate
card processing fees."** Keep suppressed until (1) is recorded.

### AC8 — treatment confirmed; document it on the credit note

The retained processor cost is fee income recognised at refund time,
offsetting the Stripe expense; no VAT while unregistered. The credit note
shows the retained amount as its own line ("retained card-processing cost,
per Terms §[x]") so the artist-facing document reconciles to the evidenced
cost. Confirm before the v1 flip; pairs with CL7's Terms half in FA9.

### Summary

| Item | Outcome |
|---|---|
| CL1 | Checklist updated: CL2-CL5 evidence + CL6 controls + completed LO-5 DPIA; one FA9 re-roll |
| CL2 | Not sufficient: obligation-to-pay button + full Art. 6(1) set incl. seller address |
| CL3 | Un-park-blocking: return-right + cost allocation + per-product 16(c) flag (Art. 10 = 12-month risk) |
| CL4 | Yes: Art. 8(7)-conforming confirmation; extend the E2 pattern |
| CL5 | Notice + RoP + **purge path for cancelled-order emails** (gap; un-park-blocking, cheap) |
| CL6 | Conditional pass; delete-object-on-removal now; signed URLs as dated fast-follow; fold into LO-5 DPIA |
| CL7 | Carried: Terms in FA9 before refund-v1 flip |
| CL8 | Schedule LO-10; close before real client money |
| CL9 | Record the key with the C2 screenshot |
| AC1 | Co-sign (ratification); record VAT caution |
| AC2 | Confirm; count all fee revenue to the alert until LO-10 |
| AC3 | Approve v2 as encoded; 30-day notice for the Free goods fee via FA9 |
| AC4 | Model confirmed; goods fee = B2B to artist-as-trader; conservative counting |
| AC5 | Artist owes buyer invoicing; extend receipt per CL4; A4-format fee invoice |
| AC6 | Confirmed |
| AC7 | True only while `fees.payer: application`; bind claim to the setting; founder records the subsidy intent |
| AC8 | Confirmed; retained cost as its own credit-note line; before v1 flip |

**Net effect on the sequence in §4:** unchanged in shape. Additions: the FA12
goods un-park gains three named blockers (CL3 disclosure build, CL5 purge
path, CL6 delete-on-removal) and the **LO-5 DPIA completion** attaches to FA10
via the account-deletion release gate.

---

## 4. Sequence (who is blocked on whom)

```
AC1 price co-sign ──► CL1 final package (incl. CL2-CL7 answers) ──► FA9 Terms re-roll ──► FA10 launch key
AC3 + FA9 ─────────► FA11 fee v2 flip
CL7 + AC8 + FA9 ───► fee-refund policy v1 flip
CL2-CL5 + AC4/AC5 + FA2 + FA3 ──► FA12 goods un-park
FA1 (migrations + push) precedes ALL of the above reaching production.
```

## 5. Engineering tail (no owner decision needed — listed so the picture is honest)

Not for this review, tracked in the register: the round-3 test-gap batch
(TEST-VAC-004..007, in flight), SHOP-FUL-004's behavioural verification once
its tests land, migrations 0125-0137 + the db suites in CI (no local Postgres
has ever run them), PAY-RFD-008's Stripe test-mode reproduction, the two new
mobile settings routes awaiting native screens, and the Stripe-side
cancel-vs-confirm race exercise flagged in SHOP-ORD-002's residual.

## 6. Already approved — do not re-ask

Consumer strings E1-E5, refund method, cancel parity, price-adjacent-to-pay
(built + verified), invoice/credit-note format for Plus subscriptions,
part-month proration without tax adjustment, stay-unregistered posture +
Stripe-invoices-as-is (2026-07-25 walkthrough), the 18/18 activation gate's
recorded keys, and the 20 rulings of 2026-07-31 (operating model, caps,
analytics boundary, fee encoding, scope completions). Re-asking these is the
overhead the no-deferral rule exists to prevent.
