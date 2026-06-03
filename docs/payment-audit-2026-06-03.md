# Payment feature audit — kickoff scaffold (start here next session)

**Created 2026-06-03 to be executed next session.** Goal: a full audit of the
**entire payment feature** across four lenses — **logic, functionality,
structure, UX + UI** — measured against the locked money scope. Output: a
prioritized findings list that refines/feeds the restructure slices
(RS-3…RS-8). This is capture-first; batch fixes after.

**Read before starting:** `docs/restructure-money-scope-2026-06-03.md` (locked
scope §1, process-flow audit §2, blockers §3, slices §4, open decisions §5),
`DECISIONS.md` (money-scope row, 2026-06-03), and memory
`project_inklee_commerce_layer.md`.

## Current state (as of 2026-06-03)

- Branch **`feat/bio-page-goods`**, HEAD around `00b834b` (RS-2 = `02efea8`).
- **Money-scope reset done + documented.** RS-1 (scope/docs) ✅, **RS-2 (gate in-app deposits on active Connect — manual deposit for un-connected artists) ✅.** RS-3…RS-8 pending.
- Migrations 0000–0042 applied. Dev server stopped. OT-12 test flow dropped.
- Stripe sandbox is configured (platform business model = Platform, integration choices confirmed). No artist has a persisted `stripe_account_id` yet.

## Audit scope — surfaces & the four lenses

Walk each surface and note findings under **L** logic, **F** functionality, **S** structure, **U** UX/UI, plus **scope-fit** (does it match §1 locked scope?).

### Artist side

- `/settings/payouts` — Connect onboarding (`page.tsx`, `payouts-controls.tsx`, `actions.ts`). Onboarding friction/country (US-sandbox vs EU), opt-in framing, "never holds your money" copy, status badges, refresh path.
- `/settings/deposits` — deposit defaults (amount/due/note).
- Deposit request — `bookings/requests/[id]/status-actions.tsx` (+ `page.tsx` `canCollectInApp`). In-app vs manual mode clarity, note field, mark-received.
- `/bookings/deposits` — deposits list/overview.
- Sidebar: Payouts now in `nav-config.ts` (fixed 2026-06-03).

### Customer side

- `/request/[token]` — `page.tsx` + `customer-portal.tsx` + `addons-checkout.tsx`. Deposit display, card payment (Stripe Elements), **manual-deposit display** (no intent → amount + note), success/used/expired states.

### Server / logic

- `requestDeposit` (`bookings/actions.ts:529`) — intent creation gated on `routeCharges` (RS-2); **no `application_fee` yet (RS-4)**; reuse path; audit_log `stripe_connect_routed`.
- `prepareCheckoutAction` (`request/[token]/actions.ts:271`) — goods add-on total/order build (**to remove, RS-3**).
- Webhook (`api/stripe/webhook/route.ts`) — `payment_intent.succeeded` (deposit paid + order create), `account.updated`, `account.application.deauthorized`.
- `stripe-connect.ts` — `deriveConnectStatus`, `deriveConnectRouting`, account create/link/sync.
- `orders.ts` / `goods.ts` / `addon-products.ts` / `booking-interests.ts` — goods/order layer (**showcase split, RS-3**).

### Structure / cross-cutting

- Deposit vs goods entanglement in the portal + webhook + orders.
- Manual-deposit path vs in-app path coherence.
- `application_fee` absence (Inklee takes 0% today).
- `CHECKOUT_ADDONS_PROD_READY` gate (moot once goods→showcase).
- Marketing (`/tattoo-deposit-tool`, homepage "deposits") + legal (Stripe/fee/VAT) references.

## Open decisions to settle during/after the audit

- **D-a** fee model (on-top vs deducted) · **D-b** fee % (+flat) · **D-c** goods code park vs delete · **D-d** fee × tier interaction · **D-e** counsel (fee VAT/invoicing, customer disclosure, refund-of-fee).

## Findings

Captured 2026-06-03 by reading every surface in §"Audit scope". Severity
**B**locker / **H**igh / **M**edium / **L**ow. Each tagged with lenses
(**L**ogic / **F**unctionality / **S**tructure / **U**X-UI), scope-fit, and the
RS slice it feeds. Capture-only — no fixes applied. Fix batching notes at the
bottom.

### Blockers (live exposure or money-correctness)

**F1 — No platform fee anywhere → the §3 revenue stream does not exist.**
`requestDeposit` builds the destination-charge intent with `on_behalf_of` +
`transfer_data.destination` but **no `application_fee_amount`**
(`bookings/actions.ts:600-610`). Result: 100% of every in-app deposit settles
to the artist; Inklee earns €0 on transactions. The locked scope's core
monetization (§1.3) is unimplemented. Also unverified: who bears Stripe's
processing fee under `on_behalf_of` + destination + no app-fee (likely the
connected account, but confirm in RS-4 so the fee % in D-b actually clears it).
Lenses: **L**, scope-fit. → **RS-4** (gated on **D-a/D-b**).

**F2 — Goods checkout still wired into the live deposit-payment path (scope
violation + money path).** The customer portal routes _every_ deposit through
`AddonsCheckout` → `prepareCheckoutAction`, which can recompute the intent
amount to `deposit + goods`, build `orders`/`order_items`, and stamp
`order_id` metadata (`request/[token]/actions.ts:386-461`,
`addons-checkout.tsx:104-135`). Under showcase-only scope (§1.5) goods must not
be payable at all. While it's live, an artist with `is_checkout_addon` products

- active Connect + `CHECKOUT_ADDONS_PROD_READY` could still sell goods through
  the deposit intent (money to their Connect account as a "deposit"). Lenses:
  **L S**, scope-fit. → **RS-3** (gated on **D-c**).

**F3 — `/settings/deposits` copy asserts the OLD platform-charge model, now
false + legally misleading.** The live-mode card states _"Real card payments
process through Inklee's Stripe account. Funds settle to the operator"_
(`settings/deposits/page.tsx:21-24`). Under the locked model the artist is
merchant of record and funds settle to the _artist's_ Connect account; Inklee
only keeps the fee. This copy contradicts LO-2 and the customer-disclosure
posture. Compounding it, the status shown keys off **global**
`detectStripeMode(publishable_key)`, not the artist's Connect state — so an
un-connected artist on prod reads "Stripe is connected in live mode / payments
process through Inklee" even though they can only do _manual_ deposits. Lenses:
**L U**, scope-fit, legal. → **RS-5 + RS-7**.

### High

**F4 — Customer never sees Inklee's fee before paying (B3).** Portal +
`addons-checkout` show Deposit / Goods / Total only (`addons-checkout.tsx:217-232`),
no service-fee line, and the manual-deposit panel shows bare amount + note
(`customer-portal.tsx:297-322`). The moment F1 lands, EU surcharge/transparency
rules require the fee be itemised pre-payment and the artist net be shown. Build
the fee line **with** RS-4, not after. Lenses: **U**, scope-fit, legal. →
**RS-4 / RS-7** (**D-e**).

**F5 — `requestDeposit` reuse path updates the DB amount but NOT the Stripe
intent (latent amount-mismatch, masked only by goods code).** When a deposit is
re-requested and an intent already exists, the handler updates
`deposit_amount` in the DB but never calls `paymentIntents.update`
(`bookings/actions.ts:549-574`). Today this self-heals because
`prepareCheckoutAction` rewrites the intent amount right before
`confirmPayment`. **Once F2/RS-3 removes that prepare step, the customer would
be charged the stale original amount** and the webhook's amount check
(`webhook/route.ts:176`) would 409 the payment. Must be fixed _in the same
slice_ that drops `prepareCheckoutAction`. Lenses: **L**, → **RS-3/RS-4**.

**F6 — Webhook amount validation hard-codes deposit-only and will reject the
fee'd intent.** `expectedAmount = round(deposit_amount*100)` and any mismatch is
a 409 (`webhook/route.ts:163-183`). With "fee on top" (D-a) the intent amount
becomes `deposit + fee`, so this check must become deposit+fee-aware or every
real payment 409s. Forward dependency, not a live bug. Lenses: **L**, →
**RS-4**.

### Medium

**F7 — Dual deposit-confirm path lets in-app deposits be hand-marked,
desyncing money from booking state.** In `deposit_pending`, the artist always
sees a prominent "Mark deposit received" button (`status-actions.tsx:345-357`),
even when `canCollectInApp` (an in-app card intent is outstanding). Artist can
flip booking→approved with no payment; the PaymentIntent stays live, so the
client can still pay later → money captured against an already-approved booking,
webhook treats it as a replay (`bookingAlreadyDone`). For in-app deposits, "Mark
received" should be hidden or demoted to an explicit "cancel the card request &
mark manually" that voids the intent. Lenses: **L U**. → **RS-2 follow-up /
RS-6**.

**F8 — Webhook still runs the full goods-order fulfilment fan-out.** `order`
lookup, pending→paid flip, `decrementInventory`, itemised goods confirmation
email, and "reserved N items for pickup" notification all remain
(`webhook/route.ts:142-363`). Dead under showcase-only, but reachable for any
existing/`order_id`-stamped intent and a large surface to keep correct. Simplify
to deposit(+fee)-only confirmation when RS-3 lands. Lenses: **S**, scope-fit. →
**RS-3**.

**F9 — Connect accounts are created without the artist's country.**
`ensureConnectAccount` only forwards `country` when `stripe_account_country` is
already on the profile — but that column is populated _from Stripe after_
account creation (`stripe-connect.ts:142-182`, `payouts/actions.ts:53-60`). So
first-time creation passes no country and Stripe defaults to the platform
country (US in the current sandbox). EU artists need a pre-onboarding country
collect + pass-through. Lenses: **F U**, scope-fit. → **RS-5** (**B9**).

**F10 — No deposit refund path exists (B4).** Nothing in the codebase refunds a
paid deposit; cancelling after payment strands the money and never reverses the
(future) application fee. Needs defined semantics (refund the fee? who eats
Stripe's cut?) + implementation. Lenses: **F**. → **RS-6** (**D-e**).

**F11 — Dead pre-checkout catalogue computation on every portal load.**
`request/[token]/page.tsx:99-162` runs the booking_interests × addon-catalogue
intersection on each `deposit_pending` render to build payable rows — pure goods
machinery, removable with RS-3. Lenses: **S**, scope-fit. → **RS-3**.

### Low / cleanup

**F12 — "Opt-in" is implicit, not a setting.** Scope §1.2 frames deposit
collection as an explicit opt-in, but in the build every artist can request a
deposit (manual if un-connected, in-app if Connected); the only gate is Connect
state. Decide whether "optional opt-in" means a real toggle or simply
"Connect = opt-in to in-app." Likely fine as-is; note for scope alignment.
Lenses: **U**, scope-fit. → decision, feeds RS-5 copy.

**F13 — `CHECKOUT_ADDONS_PROD_READY` + "flip the live switch" framing is moot.**
Payouts page footer + `getAddonProducts` gate (`payouts/page.tsx:111-125`,
`addon-products.ts:96-116`) reference a goods-checkout production switch that
showcase-only scope deletes. Remove with RS-3; rewrite payouts copy in RS-5.
Lenses: **S U**, scope-fit. → **RS-3/RS-5**.

**F14 — Payouts status copy bundles goods + omits the fee.** `STATUS_DESCRIPTION`
("receive deposits **and sell goods**", "Deposits + goods payments will route…")
(`payouts/page.tsx:14-25`) needs the goods clause dropped and the platform-fee +
"opt-in to in-app card deposits" framing added. Lenses: **U**, scope-fit. →
**RS-5**.

**F15 — Marketing/legal still say "collect deposits" flatly (B8).**
`/tattoo-deposit-tool` + homepage/SEO copy present deposits as a core feature
with no opt-in/fee framing; terms have no platform-fee/VAT clause. Lenses: **U**,
legal. → **RS-7** (**D-e**).

## Decision dependencies (must settle before fixing)

The fix order is **RS-3 → RS-4 → RS-5 → RS-6 → RS-7**. Two decisions gate the
highest-value slice (RS-4) and should be settled first:

- **D-a fee model** — on-top vs deducted. Founder leaned on-top; confirm.
- **D-b fee %** (+ flat?) — must clear Stripe's processing fee with margin.
- **D-c** goods park-behind-flag vs delete (sequences RS-3).
- **D-d** fee × tier interaction. **D-e** counsel (fee VAT/invoicing, customer
  disclosure wording, refund-of-fee).

## Fix-batching recommendation

1. **RS-3 first** (F2, F8, F11, F13) — decouple goods from the deposit path;
   this shrinks the surface every later slice touches. Carry **F5** into this
   slice (the reuse-path amount bug is only safe while `prepareCheckoutAction`
   exists). ✅ **DONE 2026-06-03** — parked behind `GOODS_COMMERCE_ENABLED`
   (default OFF, D-c=park). Closes **F2, F5, F11**; **F8/F13** dormant-parked
   (webhook goods fan-out + `CHECKOUT_ADDONS_PROD_READY` retained but
   unreachable). Portal now uses the deposit-only `DepositPaymentForm`.
2. **RS-4** (F1, F4 — **F6 mostly dissolved** by the deducted-fee model, D-a)
   — add `application_fee_amount` (intent amount stays = deposit), show the
   artist net + customer fee disclosure. **Gated on D-b (the %).**
3. **RS-5** (F3, F9, F12, F14) — onboarding country, opt-in framing, fix the
   false `/settings/deposits` + payouts copy.
4. **RS-6** (F10, F7) — refunds + the dual-confirm cleanup.
5. **RS-7** (F15, residual F3/F4 legal) — marketing + terms/VAT, counsel pass.
