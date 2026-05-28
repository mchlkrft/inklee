# Bio Page + Goods + Appointment Add-ons — plan

**Status:** scoping + phased plan, locked decisions · 2026-05-28
**Owner:** founder + Claude
**Slices:** 72–76 (new pre-launch cluster, sits after Phase D gate, before Phase E mobile)
**Roadmap home:** `docs/roadmap.md` §3.8 (Now horizon) + dependency map §8

This is the design deliverable for the next major Inklee direction: evolve the public artist page from "just a booking form" into a tattoo-native bio page, add a native Goods module, and let clients add artist goods to their deposit payment in one checkout. It is the planning artifact the implementation slices work from. Implementation is sliced; do not build it in one pass.

## 0. Product direction (the guardrails)

Inklee is not becoming a generic Linktree clone or a marketplace. Inklee becomes **the tattoo-native bio link and booking checkout layer for artists**.

Core product sentence: _Inklee replaces a generic bio link with a tattoo-native public page for bookings, flash, guest spots, waitlists, booking policies, custom links, and artist goods._

Commerce direction: help an artist earn more from a client who is already motivated and ready to book. The moment is **after the request is approved and a deposit is requested, before payment** — the client adds goods (shirt, print, sticker, zine, flash sheet) and pays deposit + goods in one Stripe payment, then collects the goods at the appointment.

Naming (use these, avoid SaaS/marketplace language):

- Public page: **Artist Bio Page** / **Public Page**
- Dashboard module: **Goods**
- Public section: **Shop**
- Checkout section: **Add artist goods for pickup**
- Commerce feature: **Appointment Add-ons**

Hard "do not" list: no fake testimonials/reviews/rankings, no marketplace language, no broad shipping promises, no all-in-one studio-OS positioning, no unsupported tax/legal promises. No em-dashes in public-facing copy (AGENTS.md rule); sentence case.

## 1. Current-state audit (verified against the code 2026-05-28)

| Area                    | Reality                                                                                                                                                                                                                                                                                                                       |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework               | Next.js **16.2.4**, React 19.2.4, App Router, route groups `(artist)`/`(auth)`/`(legal)`. Server-action-heavy, no REST layer. Tailwind v4 brand tokens.                                                                                                                                                                       |
| Public page             | `src/app/[slug]/page.tsx` — **monolithic** server component: charcoal header → bone card with `StudioBlock`, active-leg block, `BookingForm` (or `BooksClosedBlock` + `WaitlistForm`). Sub-routes `/flash`, `/flash/[flashSlug]`, `/flash/days/[dayId]`, `/waitlist`. Not modular. All config from `profiles.settings` JSONB. |
| Booking flow            | `submitBookingAction` (`[slug]/actions.ts`) → `booking_requests` (status `pending`), honeypot `inklee_hp_check`, image upload via service client, slot lock, trip auto-tag.                                                                                                                                                   |
| Approval/deposit        | `StatusActions` → `approveBooking`/`requestDeposit`/`markDepositReceived`/`rejectBooking`. `requestDeposit` creates a PaymentIntent (`amount*100`, eur, `metadata.booking_id`+`artist_id`), stores `deposit_payment_intent_id` + `deposit_client_secret`, status `deposit_pending`. Intent is reused if it already exists.    |
| Payment                 | Customer pays at magic-link `/request/[token]` via embedded `DepositPaymentForm` (Stripe Elements `PaymentElement`, `confirmPayment` `redirect:"if_required"`).                                                                                                                                                               |
| Stripe                  | **No Connect.** Single platform account. **PaymentIntents, not Checkout Sessions.** `stripe` is null-safe when unconfigured. Live keys in prod since 2026-05-22.                                                                                                                                                              |
| Webhook                 | `/api/stripe/webhook` handles **only** `payment_intent.succeeded`, matched by `metadata.booking_id`. Idempotent (audit_log + status guards), amount-verified.                                                                                                                                                                 |
| Schema                  | Migrations **0000–0034**, Drizzle (`src/db/schema.ts`) + raw SQL applied via Supabase SQL editor. **No products/orders/goods tables.** `profiles.settings` JSONB is the per-artist config store. RLS-heavy; public reads via `serviceClient`. Money stored as `numeric(10,2)`, converted to cents at intent creation.         |
| Dashboard nav           | `src/components/app-shell/nav-config.ts`: General (Dashboard, Bookings, Flash, Guest Spots) + Tools (Analytics, Notifications, Settings). Mobile = 5-tab bottom nav, Bookings as center FAB.                                                                                                                                  |
| Email                   | `src/lib/email/*` via Resend. 5 template types (`emailTemplateTypeEnum`), per-artist overrides.                                                                                                                                                                                                                               |
| Feature flags / paywall | **None.** No `plan_tier`, no `canAccess`, no flags. `business-model.md` plans Free/Plus €3/Studio €25 but nothing is in code.                                                                                                                                                                                                 |
| Protected wording       | Deposit safe wording present in 7 files (`src/app/page.tsx`, 4 SEO pages, `bookings/deposits/page.tsx`, `public-booking/legal-notice.tsx`). Do not alter.                                                                                                                                                                     |

## 2. Locked decisions

| ID     | Decision                                                                                                                                                                                                                                                        | Rationale                                                                                                                                                                                                                        |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1** | The full cluster (72–76) ships **before public launch**.                                                                                                                                                                                                        | Founder call 2026-05-28. The feature reshapes booking/payment/webhook logic; cheaper to land before any real artist has data, and it is the headline differentiator at launch.                                                   |
| **D2** | Keep the **embedded PaymentIntent** flow. One combined intent (deposit + goods); itemize in Inklee's own `order_items`. No Stripe Checkout Session in v1.                                                                                                       | Reuses the existing embedded Elements UX + webhook + idempotency. Inklee already owns the pre-checkout UX, which is what the direction wants. `stripe_checkout_session_id` is kept nullable on `orders` for forward-compat only. |
| **D3** | **Stripe Connect is a hard production gate for goods money.** Build + test the whole flow in Stripe **test mode** without Connect; the `checkout_addons` feature stays OFF in production until Connect is live and artists are onboarded as connected accounts. | Routing artist goods revenue through Inklee's platform account makes Inklee merchant/seller of record for physical goods (VAT, product liability, refunds, payouts). Not the intended legal posture. See §8.                     |
| **D4** | Add-ons attach to the **deposit-payment moment** in `/request/[token]`, only when `status === deposit_pending` and the artist has goods flagged `is_checkout_addon`.                                                                                            | Strongest conversion moment per the direction: after approval, before payment. Reuses token auth + portal layout + embedded payment.                                                                                             |
| **D5** | v1 is **appointment pickup only**. No shipping, no standalone cart, no buyer accounts, no discounts/coupons, no multi-artist cart, no global product discovery, no reviews. One artist per checkout, one booking per checkout.                                  | Matches the direction's v1 constraints and keeps scope honest.                                                                                                                                                                   |
| **D6** | **Paywall readiness only.** Lightweight `profiles.settings.features` flags + a `canUseGoods()` helper returning `true` for everyone in launch mode. No subscription billing, no public pricing copy, no plan ladder.                                            | No plan system exists; the direction explicitly forbids adding one here. Documents the future Plus-tier gate point without enforcing it.                                                                                         |

## 3. Slice plan

| Slice                                       | Scope                                                                                                                                                                                                                                                                                                                                                                                                               | New DB                                                    | Risk                        | Launch role        |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | --------------------------- | ------------------ |
| **72 — Bio Page modular structure**         | Refactor `[slug]/page.tsx` into ordered modules driven by `profiles.settings.bio_page` (order + per-module visibility). Ship **Custom Links** + **Booking Policy** + a **Shop placeholder** (no products yet). Existing booking form becomes the Booking CTA module. Guest Spots / Flash / Waitlist become modules wrapping existing data. Settings surface for show/hide + order + custom-link CRUD + policy text. | none (JSONB)                                              | Low                         | Safe to ship early |
| **73 — Goods data model + dashboard CRUD**  | Migration 0035. Goods nav item + `/goods`, `/goods/new`, `/goods/[id]`. Create/edit/hide/sold-out, image upload (reuse `sharp`), shirt variants, pickup note, `is_public_visible` + `is_checkout_addon` toggles, sort order. Public Shop cards replace the Slice 72 placeholder.                                                                                                                                    | `products`, `product_variants`                            | Medium                      | Pre-launch         |
| **74 — Pre-checkout add-ons page**          | Enhance `/request/[token]` portal (deposit_pending): booking summary + deposit + optional goods + live total. Server-side total recompute. Updates the PaymentIntent amount + `order_id` metadata before confirmation. "Pay deposit and selected items."                                                                                                                                                            | none                                                      | Medium                      | Pre-launch         |
| **75 — Order + webhook + fulfillment**      | Migration 0036. Webhook reads `metadata.order_id`, marks order paid, decrements inventory **only on `payment_intent.succeeded`**, snapshots title/price/variant into `order_items`. Booking detail shows goods + variants + qty + fulfillment + "Mark goods as picked up." Itemized confirmation emails (customer + artist).                                                                                        | `orders`, `order_items`, `inventory_movements` (optional) | High (money + live webhook) | Pre-launch         |
| **76 — Paywall readiness + analytics + QA** | `profiles.settings.features` flags (`bio_page_modules`, `goods_module`, `checkout_addons`) + `canUseGoods()` helper. Optional Plausible events. Full test + manual QA pass. No billing, no pricing copy.                                                                                                                                                                                                            | none                                                      | Low                         | Pre-launch         |

**Build only Slice 1 (72) after this plan is approved.** Re-confirm scope at each slice boundary.

## 4. Database migration plan

Two migrations, following existing conventions: `uuid` PK `defaultRandom()`, `artist_id` FK → `profiles(id)` `ON DELETE CASCADE`, `timestamptz` with `defaultNow()`, money as `numeric(10,2)`, `pgEnum` for status fields. RLS: artist-owns-rows policies + public reads served through `serviceClient` (matches the post-incident pattern). Provide raw SQL for the Supabase SQL editor (founder's preferred apply path) alongside the Drizzle schema additions.

**0035_goods.sql**

- `product_category` enum: `print, shirt, sticker, zine, flash_sheet, original, patch, other`
- `product_status` enum: `active, hidden, sold_out`
- `product_fulfillment` enum: `appointment_pickup` (only value in v1)
- `products`: `id`, `artist_id`, `title`, `description`, `category`, `image_url`, `price_amount numeric(10,2)`, `currency text default 'eur'`, `status`, `fulfillment_type default 'appointment_pickup'`, `pickup_note`, `is_public_visible bool default true`, `is_checkout_addon bool default true`, `quantity int null`, `sort_order int default 0`, `created_at`, `updated_at`
- `product_variants`: `id`, `product_id` (FK cascade), `name`, `price_amount_override numeric(10,2) null`, `stock_quantity int null`, `status product_status default 'active'`, `sort_order int default 0`

**0036_orders.sql**

- `order_status` enum: `pending, paid, cancelled, refunded, partially_refunded`
- `order_fulfillment_status` enum: `pending_pickup, picked_up, cancelled`
- `order_item_type` enum: `deposit, product`
- `orders`: `id`, `artist_id`, `booking_id` (FK booking_requests), `client_email null`, `client_handle null`, `stripe_payment_intent_id`, `stripe_checkout_session_id null` (forward-compat), `status`, `deposit_amount numeric(10,2)`, `goods_amount numeric(10,2)`, `subtotal_amount numeric(10,2)`, `platform_fee_amount numeric(10,2) null`, `currency text default 'eur'`, `fulfillment_status default 'pending_pickup'`, `created_at`, `updated_at`
- `order_items`: `id`, `order_id` (FK cascade), `type order_item_type`, `product_id null` (FK set null), `variant_id null` (FK set null), `title_snapshot`, `variant_snapshot text null`, `quantity int default 1`, `unit_amount numeric(10,2)`, `total_amount numeric(10,2)`, `currency text default 'eur'`
- `inventory_movements` (optional, only if stock is enabled): `id`, `product_id`, `variant_id null`, `order_id null`, `change_quantity int`, `reason text`, `created_at`

Inventory rule: decrement **only** in the webhook after `payment_intent.succeeded`. Never on page view or intent creation (no reservation-expiry system in v1). If `quantity`/`stock_quantity` is null, treat as unlimited. Conservative stock checks at add-on selection; document that overselling is theoretically possible under concurrent checkout and is acceptable in v1.

## 5. Stripe / payment flow plan

Flow (extends, does not replace, the deposit flow):

1. Artist approves request and requests a deposit → existing `requestDeposit` runs, status `deposit_pending`, deposit-only PaymentIntent created (unchanged).
2. Client opens `/request/[token]`. If `deposit_pending` and the artist has `is_checkout_addon` goods, the portal shows the add-ons selector + booking summary + deposit + live total.
3. On "Pay deposit and selected items," a server action: (a) recomputes the total server-side from current product/variant prices (never trust client amounts), (b) upserts an `orders` row (`pending`) + `order_items` (deposit line + product lines with snapshots), (c) **updates the existing PaymentIntent** amount to the combined subtotal and sets `metadata.order_id`, (d) returns the client secret.
4. Client confirms via embedded `PaymentElement` (unchanged component).
5. Webhook `payment_intent.succeeded`: if `metadata.order_id` present → verify `intent.amount === order.subtotal*100`, mark order `paid`, decrement inventory per product line items, run the existing booking-approval path (status `approved`, token rotation), send itemized emails. If no `order_id` (legacy deposit-only) → existing path untouched. Idempotency: order-status guard + the existing `audit_log` guard.

Production gate (D3): until Stripe Connect is live, `checkout_addons` is OFF in production. The combined-payment code paths are exercised in test mode (dev/preview) and behind the flag. Do not move real goods money through the platform account in production.

## 6. UI route / component plan

- **Bio Page** (`src/app/[slug]/page.tsx`): render an ordered module list from `profiles.settings.bio_page`. Modules: `BookingCta` (wraps existing booking form / books-closed), `GuestSpots`, `Flash`, `Waitlist`, `BookingPolicy` (new), `CustomLinks` (new), `Shop` (new). Keep existing components intact; wrap, do not rewrite. Opinionated structure, no drag-drop page builder.
- **Custom links**: stored in `profiles.settings.bio_page.custom_links[]` (`label`, `url`, `icon?`, `sort_order`, `is_active`). URL safety: allow `http`/`https` (+ optional `mailto`), reject `javascript:`/`data:`/other schemes. Reuse the validation shape already in `[slug]/page.tsx` (`resolveCoverImage`).
- **Dashboard Goods**: new nav item in General group. `/goods` (grid), `/goods/new`, `/goods/[id]` (edit + variants). Reuse the logo/booking image upload + `sharp` pipeline and the Flash designs-grid layout language.
- **Settings**: `/settings/bio-page` (or extend `/bookings/booking-form`) for module visibility + order, custom-link CRUD, booking-policy text. Reuse the deposit-defaults settings pattern (`profiles.settings.*` JSONB, no migration for config).
- **Add-ons portal**: enhance `src/app/request/[token]/customer-portal.tsx` — goods selector + combined total above the existing payment form, only when eligible.
- **Booking detail** (`/bookings/requests/[id]`): attached-order panel (goods, variants, qty, fulfillment status) + "Mark goods as picked up" + cancelled/refunded state mirroring Stripe.

## 7. Legal, tax, operational caution (internal only)

Before native goods checkout goes to production, Inklee needs review of: seller of record, VAT / sales-tax responsibility, receipts/invoices, refund responsibility, product liability, Stripe Connect setup, platform fees, artist payout flow. These tie to existing counsel open items (`docs/roadmap.md` §3.6 LO-2 PSD2/MoR, LO-5 DPIA, LO-7 VAT threshold) and to OT-05 (legal entity on the store/payment side). Do not surface any of this as scary public UI. Do not present Inklee as a marketplace. Document v1 constraints (D5) plainly in artist-facing help text where relevant.

## 8. Paywall readiness (no enforcement)

Future packaging (documented, not built): Free Starter = Bio Page + booking requests + custom links + limited public products with external links. Solo Plus = native appointment add-ons + unlimited goods + variants + inventory + goods-on-bookings + basic sales analytics. Studio (later) = studio shop + multi-artist goods + pickup-by-location + staff fulfillment. For this cluster: add `profiles.settings.features` flags (`bio_page_modules`, `goods_module`, `checkout_addons`) defaulting on, a `canUseGoods(profile)` helper as the single future gate point, and a note in `business-model.md`. Nothing enforces a plan. No Stripe subscriptions.

## 9. Analytics (optional, low effort)

If wired, Plausible custom events: `public_bio_page_view`, `shop_section_view`, `product_view`, `addon_selected`, `addon_removed`, `checkout_started`, `checkout_paid`, `goods_picked_up`. Aligns with Slice 63's event foundation. If skipped, document only.

## 10. Testing + manual QA

Unit/utility tests: product + variant validation, unsafe custom-link rejection, bio-page module visibility, pre-checkout total calc, add-ons total calc, inventory decrease only after webhook success, order-item snapshots, booking confirms with and without goods, hidden/sold-out/unknown product cannot be purchased, hidden product not shown publicly, webhook idempotency, existing booking route still works, existing public profile route still works.

Manual QA checklist:

- Existing booking flow works without goods
- Existing deposit payment works without goods
- Artist can create a product, add shirt-size variants, hide a product, mark sold out
- Public bio page shows custom links, booking policy, shop section
- Client sees add-ons after approval; can pay deposit only; can pay deposit + goods
- Stripe line items / combined amount correct
- Webhook creates/updates order; inventory decreases only after successful payment
- Confirmation email includes goods; booking detail shows goods; mark-picked-up works
- Unknown or sold-out product cannot be purchased
- Auth/dashboard routes remain protected

## 11. Manual setup steps the founder will need

- **Stripe Connect** (before production goods): enable Connect on the platform account, choose Express vs Standard, configure the connected-account onboarding, set platform-fee posture, decide payout flow. Until then keep `checkout_addons` OFF in production.
- **Supabase**: apply migrations 0035 then 0036 via the SQL editor (Claude provides the SQL).
- **Vercel env**: no new secrets for the test-mode build. Connect adds keys later.
- **Webhook**: no new endpoint; the existing `/api/stripe/webhook` is extended. Confirm `payment_intent.succeeded` is still subscribed.

## 12. Hard invariants (do not break)

- Deposit safe wording in the 7 files (§1) stays verbatim.
- Existing public `/[slug]` route and the deposit-only payment path keep working unchanged for artists with no goods.
- Honeypot (`inklee_hp_check`), RLS service-role write pattern, and the webhook idempotency guards stay intact.
- No em-dashes in public-facing copy; sentence case; tattoo-native wording.

## 13. Open tasks (deferred polish)

### Form optimization (open — founder, 2026-05-28)

The public booking page layout needs a refinement pass. Deferred deliberately; functional now, not yet polished:

- **Shop teaser placement** — moving the shop from the end-of-page slot to a clickable note above the booking form is better, but the exact position/styling still needs work.
- **Studio information placement** — `StudioBlock` + the active-leg block currently render above the booking heading and read a bit off; reposition within the form.
- **Goods item presentation** — the product cards inside the full-screen shop overlay (now a 40% charcoal scrim) need a proper design pass (card styling, layout, contrast on the charcoal).
