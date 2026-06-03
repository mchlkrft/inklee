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

_Appended next session. Severity B/H/M/L. Tag each L/F/S/U + scope-fit + which RS slice it feeds._
