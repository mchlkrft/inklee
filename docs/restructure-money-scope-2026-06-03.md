# Restructure: money scope + process-flow audit (2026-06-03)

Founder reset the monetization scope mid-OT-12-testing. This doc locks the new
scope, audits the full booking→payment flow against it, lists the interconnected
problems/blockers, and breaks the restructure into slices. Companion to
`docs/roadmap.md` (§3) and `DECISIONS.md`.

---

## 1. Locked scope (2026-06-03)

1. **The booking process is universal and free of any payment setup — no tradeoffs.** Intake, organization, calendar, waitlist, flash, guest spots all work with zero Stripe. This is the part every artist gets.
2. **Deposit collection is an optional opt-in.** Only artists who want the comfort of collecting deposits in-app turn it on.
3. **All deposit money flows through Inklee, and Inklee adds a percentage platform fee** on top (covers Stripe fees + margin) → a **transaction-fee revenue stream** alongside subscriptions.
4. **Artists stay merchant of record** (Stripe Connect destination charge: `on_behalf_of` + `transfer_data.destination` + **new** `application_fee_amount`). Inklee never holds artist money beyond the platform fee.
5. **Goods are showcase-only** — products/variants display on the bio page; **no in-app checkout, no appointment add-ons**.
6. **Connect onboarding is opt-in, minimized, and clearly framed** ("Stripe verifies you so deposits land in _your_ account; Inklee never holds your money").

**Why this is coherent:** the friction (Stripe KYC) is now strictly opt-in and only borne by artists who _choose_ in-app collection; everyone else is unaffected. The fee is what makes the optional feature a real, profitable use case. Artist-as-MoR (LO-2, counsel-cleared) is preserved — `application_fee` rides on top of the existing destination-charge design.

---

## 2. Process-flow audit (current → required)

| Stage                                                                                                               | Today                                                                                                                                 | Required under new scope                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **1. Public booking submit** (`/[slug]` → `booking_requests` pending)                                               | No money. Works without Stripe.                                                                                                       | ✅ No change. This is the universal core.                                                                                  |
| **2. Artist reviews request** (dashboard)                                                                           | No money.                                                                                                                             | ✅ No change.                                                                                                              |
| **3. [opt] Request deposit** (`requestDeposit`, `bookings/actions.ts:529`)                                          | Connected artist → destination charge, **no fee**. **Un-connected artist → platform charge (money lands in Inklee's account).**       | **Gate on active Connect** (block/hide for un-connected). **Add `application_fee_amount`.**                                |
| **4. Customer pays** (`/request/[token]` portal + `addons-checkout.tsx` + Stripe Elements `confirmPayment`)         | Deposit **+ goods add-ons** combined; `prepareCheckoutAction` recomputes total, builds `orders`/`order_items`, updates intent amount. | **Remove the add-on checkout.** Deposit-only payment. **Show Inklee's fee transparently** (Deposit + Service fee = Total). |
| **5. Webhook** `payment_intent.succeeded`                                                                           | Marks deposit paid, booking approved, **creates goods order + decrements inventory + itemized email**.                                | Deposit-only confirmation. Orders simplify to deposit/fee records (or drop).                                               |
| **6. Goods module** (CRUD + bio cards + `is_checkout_addon` + `booking_interests` + Accept-time availability popup) | Full commerce: cart at booking, confirm-availability on Accept, payable at checkout.                                                  | **Showcase only** — keep product/variant display on the bio page; remove cart/interests/checkout/orders-product-lines.     |
| **7. Connect onboarding** (`/settings/payouts`)                                                                     | Express, US-sandbox-flavored in test, full upfront.                                                                                   | Opt-in framing, artist-country (EU), progressive/minimal onboarding, "never holds your money" copy.                        |

---

## 3. Interconnected problems & blockers

- **B1 — Deposit collection isn't gated on Connect (blocker + live exposure).** `requestDeposit` proceeds for un-connected artists and routes the deposit to **Inklee's** platform account → Inklee becomes MoR + holds funds, the exact thing to eliminate. Fix: hard-gate deposit collection on `routeCharges` (active Connect + charges_enabled), server-side and in every deposit UI surface (dashboard, booking detail, `/bookings/deposits`).
- **B2 — No platform fee (blocker).** `application_fee_amount` does not exist anywhere. Add it to the deposit PaymentIntent. Decide **fee model** (D-a) + **percentage** (D-b).
- **B3 — Fee transparency (legal/UX blocker).** Customer must see Inklee's fee before paying (EU consumer/surcharge transparency). Artist must see "you receive X, Inklee fee Y." Counsel item.
- **B4 — Refunds with fee + Connect.** On cancellation/refund of a deposit: refund the application fee? Who eats Stripe's processing fee? Define + implement (check current refund support — appears absent).
- **B5 — VAT on Inklee's fee.** The platform fee is Inklee revenue → VAT + invoicing (ties to LO-7 Estonian VAT threshold). Counsel item.
- **B6 — Goods-removal blast radius.** `booking_interests` (cart), `addon-products.ts`, `orders`/`order_items` product lines, the Accept-time availability popup, `prepareCheckoutAction` goods path, `CHECKOUT_ADDONS_PROD_READY`. Decide **park vs remove** (D-c). Keep product/variant display for showcase.
- **B7 — Business-model interaction.** Transaction fee vs subscription (Solo Plus). Does the deposit fee apply on all tiers? Is it the free-tier monetization, reduced/removed on paid tiers? (D-d) — interconnected with BM phases in `business-model.md`.
- **B8 — Marketing reframe.** `/tattoo-deposit-tool` + homepage/SEO "collect deposits" → optional feature + fee disclosure.
- **B9 — Onboarding country/UX.** Create Connect accounts in the artist's country (not US default); reduce upfront fields; opt-in framing.
- **B10 — OT-12.3 cutover + runbook now wrong.** `CHECKOUT_ADDONS_PROD_READY` + goods E2E become moot. OT-12 reduces to deposit-Connect + application fee. `docs/ot-12-rollout-runbook.md` needs a rewrite.
- **B11 — Phase D walkthrough** must re-cover the revised deposit + fee flow.

---

## 4. Restructure slices

| Slice    | Title                                        | Closes            | Risk        | Notes                                                                                                                                                                       |
| -------- | -------------------------------------------- | ----------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RS-1** | Scope lockdown + docs/memory                 | —                 | Low         | This doc + roadmap/DECISIONS/memory. **Done in this pass.**                                                                                                                 |
| **RS-2** | Gate deposit collection on active Connect    | B1, B9 (exposure) | Low         | Block `requestDeposit` unless `routeCharges`; deposit UIs show "Connect to collect deposits". Kills the Inklee-MoR-for-deposits path. Do first — small + removes live risk. |
| **RS-3** | Goods → showcase                             | B6                | Medium      | Remove cart/interests/checkout/orders-product-lines + Accept popup; keep bio-page product display. Park behind flag or delete (D-c). Decouples the portal.                  |
| **RS-4** | Platform fee (`application_fee_amount`)      | B2, B3            | Medium      | Fee model + % (D-a/D-b); add to intent; customer fee line + artist net display.                                                                                             |
| **RS-5** | Onboarding friction + framing                | B9                | Low         | Opt-in copy, artist country, progressive onboarding.                                                                                                                        |
| **RS-6** | Refunds with fee + Connect                   | B4                | Medium      | Define + implement deposit refund semantics.                                                                                                                                |
| **RS-7** | Marketing + legal reframe                    | B3, B5, B8        | Low/Counsel | Deposit pages, fee disclosure, terms/VAT.                                                                                                                                   |
| **RS-8** | OT-12.3 + runbook rewrite + Phase D re-audit | B10, B11          | Low         | Replace goods-gate cutover with deposit-fee cutover.                                                                                                                        |

**Sequencing:** RS-1 → **RS-2** (kill live exposure) → **RS-3** (decouple goods) → **RS-4** (fee) → RS-5 → RS-6 → RS-7 (counsel) → RS-8.

---

## 5. Open decisions (need founder / counsel)

- **D-a — Fee model:** "on top" (customer pays Deposit + Fee; artist receives full Deposit) vs "deducted" (artist receives Deposit − Fee). Founder leaned **on top**. → mechanics: intent `amount = (D + F)`, `application_fee_amount = F`, `transfer_data.destination` settles `D` to the artist; Inklee keeps `F − Stripe fee`.
- **D-b — Percentage (+ fixed?):** the actual % (and any flat component) so `F` clears Stripe's fee with margin.
- **D-c — Goods code:** park behind a flag vs delete the checkout path (showcase display stays either way).
- **D-d — Tier interaction:** does the deposit fee apply on all plans, or is it the free-tier monetization that paid tiers reduce/remove?
- **D-e — Counsel:** fee VAT + invoicing (LO-7), customer fee-disclosure wording, refund-of-fee policy. Reopens nothing on MoR (artist stays MoR) but adds the platform-fee service.

---

## 6. What does NOT change

- The entire non-payment product (booking intake, dashboard, calendar, waitlist, flash, guest spots, bio page) — untouched and remains usable by everyone with no Stripe.
- Artist-as-merchant-of-record (LO-2) — preserved; `application_fee` rides on the existing destination-charge design.
- Subscription monetization (Solo Plus / BM phases) — still valid; the transaction fee is additive, pending D-d.
