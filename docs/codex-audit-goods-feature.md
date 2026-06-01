# Goods commerce feature — Codex audit brief

**Status:** live in production on the unmerged `feat/bio-page-goods` branch, commit `99e3c25`, deploy `inklee-p3irxmuxw`, aliased to **inkl.ee**.
**Migrations applied:** 0000–0038. 233/233 vitest tests green.
**Production money safety net:** the `checkout_addons` paywall flag is **OFF in prod** until OT-12 Stripe Connect ships (locked decision D3). The deposit-payment checkout path exists, is wired end-to-end, and runs in test mode only.

The feature ships in two parts: **(1) interest signalling** at the booking-form moment, and **(2) opt-in checkout** of the confirmed-available items at the deposit-payment moment. Goods are stored once with multi-image support, surface in the public shop overlay, on the artist booking detail page, in the approval email, and at the deposit checkout.

---

## 1. Data model

| Table                          | Notes                                                                                                                                                                                                                                                                                                                 |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `products`                     | id, artist_id, title, description, category (enum), `image_url` (legacy single), **`image_urls text[]`** (canonical, mig 0038), price_amount, currency, status (`active`/`hidden`/`sold_out`), pickup_note, `is_public_visible`, `is_checkout_addon`, quantity (nullable = unlimited), sort_order. RLS = artist owns. |
| `product_variants`             | product_id (cascade), name, price_amount_override (nullable), stock_quantity (nullable = unlimited), status, sort_order.                                                                                                                                                                                              |
| `booking_interests` (mig 0037) | artist_id, booking_id, product_id (set null), variant_id (set null), **snapshots** (title, variant, unit_price), quantity, **status** `pending` / `available` / `unavailable`, **decline_note**, timestamps. RLS = artist owns.                                                                                       |
| `orders` (mig 0036)            | artist_id, booking_id, client_email, stripe_payment_intent_id, status (`pending`/`paid`/…), deposit_amount, goods_amount, subtotal_amount, fulfillment_status.                                                                                                                                                        |
| `order_items` (mig 0036)       | order_id, type (`deposit`/`product`), product_id (set null), variant_id (set null), **snapshots**, quantity, unit/total amounts.                                                                                                                                                                                      |

`inventory_movements` is **deliberately not created** — optional table per plan §4; not needed for v1.

`products.image_url` stays synced to `image_urls[0]` for any legacy reader; new code prefers `image_urls`.

---

## 2. Locked product decisions

| ID      | Decision                                                                                                                                                                                                                                                |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1**  | Slices 72–76 ship before public launch.                                                                                                                                                                                                                 |
| **D2**  | Single combined Stripe **PaymentIntent** for deposit + goods. No Stripe Checkout Session. Itemised in our own `order_items`. Inventory decrement only after `payment_intent.succeeded`; concurrent oversell theoretically possible and accepted for v1. |
| **D3**  | **Stripe Connect (OT-12) is a hard gate for production goods money.** Until then the whole flow is built + tested in Stripe test mode and `checkout_addons` is OFF in prod.                                                                             |
| **D4**  | Add-ons attach at the deposit-payment moment in `/request/[token]`. Booking-interests later moved the _selection_ upstream to the booking-form; checkout became opt-in over the confirmed list.                                                         |
| **D5**  | Appointment pickup only. No shipping, no standalone cart, no buyer accounts, no discounts. One artist + one booking per checkout.                                                                                                                       |
| **D6**  | Paywall **readiness** only. `profiles.settings.features` flags + `canUseGoods()` / `canUseCheckoutAddons()` helpers default ON. No billing logic.                                                                                                       |
| **D7**  | **Booking-interests** — client marks goods to buy at request time; artist confirms availability per item on Accept (combined popup with optional studio confirm); decisions surface in the approval email.                                              |
| **D8**  | **Multi-image per product** — up to 3 (variant-less) OR `variantCount + 1` (with variants); first image is hero.                                                                                                                                        |
| **D9**  | Email is always required on the public booking form; per-field Required toggles for everything else. Instagram-OR-email rule reverted.                                                                                                                  |
| **D10** | Goods at checkout are **opt-in** — even confirmed-available items render with qty 0 default. The client actively adds, doesn't feel forced.                                                                                                             |

---

## 3. End-to-end flow

### 3.1 Artist sets up goods (`/goods`)

- Grid of tiles (`goods-tile.tsx`); each shows the first image, status badge, and a `+N` multi-image badge when the gallery has more than one. Click reveals **Sold out / Edit** actions.
- **Inline edit modal** (`goods-edit-modal.tsx`) — replaces the `/goods/[id]` subpage for normal flow; subpage stays as a direct-URL fallback. Lazy-loads via `loadProductForEditAction`.
- **Multi-image picker** (`product-form-fields.tsx`) — thumbnail grid with X-to-remove + `+ Add image` tile. Cap is **live**: `variantCount > 0 ? variantCount + 1 : 3`. Drops storage objects when the artist removes an image on save.
- **Publish/draft** is an explicit required radio choice on the main form (no silent default). `is_checkout_addon` and `is_public_visible` checkboxes under "More settings".
- **Variants** are inline rows (name + override price + stock).
- **Storage paths:** `<artistId>/goods/<productId>/<uuid>.webp` (per-image, mig 0038). Legacy `<artistId>/goods/<productId>.webp` is still cleaned up on delete.

Server: `src/app/(artist)/goods/actions.ts`

- `createProductAction` / `updateProductAction` — both flow through `processProductImages(userId, productId, formData, maxImages, prevImageUrls)` which reads `existing_image_urls` (JSON keep-list) + `images` (FileList), uploads each new file via `uploadProductImage`, composes the final array, and storage-deletes everything that dropped out of the keep-list. Writes `image_urls` and keeps `image_url = image_urls[0]` for legacy readers.
- `deleteProductAction` snapshots `image_urls` first, deletes the row (variants cascade), then sweeps every per-product storage file via `goodsImagePathFromUrl(url)`.

### 3.2 Client opens the public shop overlay

**`src/app/[slug]/shop-teaser.tsx`** — full-screen overlay rendered from the "Shop" header card on `/[slug]`.

UX (latest pass, commit `99e3c25`):

- Big `{artistName} shop` headline (text-4xl → text-6xl, centred).
- **Cart-style summary list** beneath the headline — one line per `(product, variant)` selection: `✓ Title · Variant × qty`.
- 5-column grid on `lg+` (mobile 2, sm 3), cards inside `max-w-7xl`.
- Per-card image **carousel** when `imageUrls.length > 1` (`<CardImage>`).
- **Selection flow:**
  - Variant-less product → checkbox click commits with qty 1.
  - Variant product → checkbox click puts the product in `pendingPicks` and reveals the variant chips. Picking a variant commits (qty 1).
  - Card highlights with a mustard border + soft glow when fully selected.
  - Qty stepper + re-pick chips collapse into a `reveal-on-hover` block (utility in `globals.css`; visible unconditionally on touch via `@media (hover: none)`).
- **"Got it — anything else?" popup** fires once per product on first commit (tracked in `poppedForItems`): **That's all** closes the overlay; **Keep shopping** dismisses.
- Persistent **Done** button at the bottom of the overlay surfaces the running item count.

Selections live in **`InterestSelectionsProvider`** (`src/app/[slug]/interest-selections-context.tsx`) so `BookingForm` (rendered elsewhere on the page) can read them on submit.

### 3.3 Client submits the booking

**`src/app/[slug]/booking-form.tsx`** appends `interests_json` (serialised selections) to the FormData.

**`src/app/[slug]/actions.ts` `submitBookingAction`** validates BEFORE the booking insert:

- `parseInterestSelections(rawInterests)` — lenient JSON parse, drops zero-qty.
- `getAddonProducts(artistId)` — fetches the artist's addon-eligible catalogue (gate: `is_checkout_addon=true`, `status='active'`, `currency='eur'`, paywall flag).
- `computeInterestRows(products, selections)`:
  - Aggregates duplicate `(product, variant)` lines (hardens against split-to-oversell client payloads).
  - Rejects unknown / non-active / non-addon / missing-variant / over-stock / over `MAX_INTEREST_QUANTITY=10`.
  - Snapshots `title`, `variant_snapshot`, `unit_price`.
- Returns a form error on validation failure (clean re-prompt).

After the booking row + audit_log are written, `booking_interests` rows are inserted via the service-role client. Insert failure is captured to Sentry but doesn't fail the booking (the row already exists; goods just don't appear on the artist side until next attempt).

Notification: artist's "New booking request" message gains "+ Marked N item(s) they'd like to buy." when interests exist.

### 3.4 Artist accepts (`/bookings/requests/[id]`)

**`page.tsx`** computes:

- `guestSpotStudioName` via **`resolveBookingGuestSpotStudio`** (`src/lib/booking-studio.ts`) — priority: trip-leg studio for the date → slot.flash_day.studio when non-primary → booking.studio_id when non-primary. Returns `null` for primary-studio bookings (no studio popup needed).
- `interests` — joined with `products(image_url, image_urls)` so the popup can show thumbnails. Maps PostgREST embed (object **or** array) into a single object.
- `pendingInterests` = `interests.filter(status === "pending")`, passed to `StatusActions`.

**`status-actions.tsx`** popup logic:

- `pendingAction: 'accept' | 'deposit' | null` drives the modal.
- `needsAcceptPopup = !!confirmStudio || pendingInterests.length > 0`.
- Accept button → `setPendingAction("accept")` when needed, else `run(approveBooking, "approved")`.
- Request deposit button → `setPendingAction("deposit")` when needed, else opens the inline deposit form directly.
- **Popup body:**
  - Studio block (if `confirmStudio`): "The client will be told to come to {name} on {dateLabel}."
  - Goods block (if `pendingInterests.length > 0`): per-item checkbox (default available) + thumbnail + decline-note textarea (revealed when unchecked). Wording makes clear the client still chooses at checkout.
- **`handlePopupConfirm`:**
  - `accept` → `approveBookingWithInterestDecisions(id, decisions)` (or vanilla `approveBooking` when no interests).
  - `deposit` → `applyInterestDecisions(id, decisions)` to persist the goods decisions, then opens the inline deposit form for amount/due/note.

### 3.5 Approval flow + email surface

**`src/app/(artist)/bookings/actions.ts`:**

- `approveBooking(id)` — vanilla transition + studio-aware email.
- `approveBookingWithInterestDecisions(id, decisions)` — fetches existing interests, updates each `pending` row's `status` + `decline_note` (silently skips non-pending or unknown rows for stale-payload safety), then runs the approval flow; sends `customer_booking_approved` with `goodsDecisions[]` so the email renders an **"About your goods"** block ("ready for pickup" lines for available items, "not available — <note>" for declined).
- `applyInterestDecisions(id, decisions)` — same per-row guard, but **only** updates interest rows. No status transition, no email. Used by the Request-deposit path.
- `markGoodsPickedUp(orderId)` — `paid` orders only, scoped to artist_id.

Email surface: `src/lib/email/booking-templates.ts` `buildEmailHtml` accepts optional `studio` + `goodsDecisions` and `src/lib/email/send-booking-email.ts` plumbs them through `customer_booking_approved`.

### 3.6 Deposit checkout (test mode only in prod)

**`src/app/request/[token]/page.tsx`** — when `status === 'deposit_pending'`, fetches the booking's **confirmed-available** interests (`booking_interests` where `status='available'`) and groups them by product (so two variant interests for the same product become one `AddonProductView` with two variants). The synthetic product carries `stock = interest.quantity` so the qty stepper is capped at what the artist actually vouched for.

**`src/app/request/[token]/addons-checkout.tsx`** — Stripe Elements wrapper:

- Each row renders qty stepper, default **0** (strict opt-in — the client adds; nothing is auto-selected).
- Heading: "You marked interest in these · The artist confirmed each is available — add any you'd still like to grab at your appointment."
- On "Pay deposit and selected items": calls `prepareCheckoutAction` then `stripe.confirmPayment({redirect: 'if_required'})`.

**`src/app/request/[token]/actions.ts` `prepareCheckoutAction`:**

- Validates the booking + status.
- `getAddonProducts(artistId)` + `computeAddonLines(products, selections)` recompute the authoritative total **server-side** (never trusts client amounts; same dedup hardening as the interest validator).
- Deletes any prior pending order for this booking; inserts a fresh `orders` row + `order_items` (deposit line + product lines with snapshots).
- Updates the existing deposit PaymentIntent's `amount` + `metadata.order_id`.
- Empty-selection path: drops the order and resets the intent to deposit-only.

### 3.7 Webhook + fulfillment

**`src/app/api/stripe/webhook/route.ts`** handles `payment_intent.succeeded`:

- Constructs event via Stripe SDK with `STRIPE_WEBHOOK_SECRET`.
- **Idempotency** via `audit_log` (`deposit_paid` row with `payment_intent_id`) + booking status guard (skip if already approved/rejected/cancelled).
- Amount verification: `intent.amount === expected` where expected is `order.subtotal_amount * 100` (combined) or `booking.deposit_amount * 100` (deposit-only).
- Flips booking → `approved`, rotates the customer token, writes audit.
- Order side (when `metadata.order_id` present): `.select()`-gated `pending → paid` flip ensures inventory decrement runs once even on Stripe retries; `decrementInventory(items)` writes per-variant `stock_quantity` or per-product `quantity` (null = unlimited, skipped).
- Emails: `sendGoodsOrderConfirmation` (when goods), `sendArtistDepositPaidEmail`, and the approval email (with `studio` + `goodsDecisions`).

---

## 4. Production status (2026-06-01)

- Branch `feat/bio-page-goods` HEAD `99e3c25` — ~52 commits ahead of `master`, **not merged**.
- Deploy `inklee-p3irxmuxw`, aliased to `inkl.ee`.
- Migrations 0000–0038 applied.
- `checkout_addons` flag stays OFF in prod (D3); the booking-interest signal layer + the artist popup + the multi-image features are fully live.
- 233 vitest tests green.

---

## 5. Where the audit should focus

| Area                                    | Why                                                                                                                                                                                                                                                                                          |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Money correctness**                   | `prepareCheckoutAction` server-recompute + `webhook` amount check + `.select()`-gated order flip + `decrementInventory`. Verify a crafted client can't bypass the total.                                                                                                                     |
| **Webhook idempotency**                 | Stripe retries; concurrent deliveries. Today: audit-log row + status guard up front. Anything else racy?                                                                                                                                                                                     |
| **Authorisation**                       | `submitBookingAction` uses serviceClient (bypasses RLS) but server-validates against `getAddonProducts(artistId)`. Artist mutations (`approveBookingWithInterestDecisions`, `applyInterestDecisions`, `markGoodsPickedUp`, `setProductStatusAction`) all gate on `auth.uid()` + `artist_id`. |
| **Studio resolution**                   | `resolveBookingGuestSpotStudio` priority order (trip leg → slot.flash_day → booking.studio_id) and the parallel `resolveStudioForBooking` used for emails. Edge cases: trip without studios set, slot without flash_day, primary studio missing.                                             |
| **Multi-image pipeline**                | `processProductImages` keep-list + new files + clamp at maxImages; `goodsImagePathFromUrl` URL → path derivation; storage cleanup on delete sweeps every per-product file. Look for a save that fails mid-upload (orphaned files).                                                           |
| **Interest snapshots**                  | The popup decisions email reads `title_snapshot` / `variant_snapshot` / `quantity` from the row (intentionally, in case the product was later edited).                                                                                                                                       |
| **`applyInterestDecisions` invariants** | Only touches `pending` rows; safe against stale client payloads / double-clicks.                                                                                                                                                                                                             |
| **Shop overlay UX**                     | `pendingPicks` + `poppedForItems` Sets; reveal-on-hover utility; cart-style summary; Done + Keep-shopping popup; carousel arrows stop propagation so they don't toggle the checkbox.                                                                                                         |

### Known things deliberately deferred

- Inventory decrement is read-modify-write (not atomic). Plan §4 accepts concurrent oversell for v1.
- No reservation / TTL on stock at interest-marking time.
- No analytics events wired (Slice 76 optional).
- `/goods` dashboard tile + `/goods/[id]` subpage don't show carousel; thumbnail only.
- No end-to-end / Playwright coverage for the shop overlay or popups; visual regression risk on the UX redesign.

---

## 6. File map

```
src/db/schema.ts                                                        Drizzle tables
supabase/migrations/0035_goods.sql                                      products + variants + enums
supabase/migrations/0036_orders.sql                                     orders + order_items + enums
supabase/migrations/0037_booking_interests.sql                          booking_interests + status enum
supabase/migrations/0038_product_image_urls.sql                         products.image_urls text[]

src/lib/goods.ts                                                        type defs (PublicProduct, AddonProduct), price helpers
src/lib/orders.ts                                                       computeAddonLines (validation + line composition)
src/lib/addon-products.ts                                               getAddonProducts (paywall + fetch)
src/lib/booking-interests.ts                                            parseInterestSelections + computeInterestRows
src/lib/booking-studio.ts                                               resolveStudioForBooking + resolveBookingGuestSpotStudio
src/lib/order-fulfillment.ts                                            decrementInventory
src/lib/features.ts                                                     paywall flags
src/lib/email/booking-templates.ts                                      buildEmailHtml + EmailGoodsDecision
src/lib/email/send-booking-email.ts                                     sendBookingEmail + sendGoodsOrderConfirmation + sendArtistDepositPaidEmail

src/app/[slug]/page.tsx                                                 public bio page
src/app/[slug]/shop-teaser.tsx                                          public shop overlay (carousel, interest flow, popup)
src/app/[slug]/booking-form.tsx                                         booking form (reads interest selections)
src/app/[slug]/interest-selections-context.tsx                          shared client state
src/app/[slug]/actions.ts                                               submitBookingAction (persists interests)

src/app/(artist)/goods/page.tsx                                         goods grid
src/app/(artist)/goods/goods-tile.tsx                                   tile + action stack + +N image badge
src/app/(artist)/goods/goods-edit-modal.tsx                             inline edit modal
src/app/(artist)/goods/product-form-fields.tsx                          form fields + multi-image picker + publish/draft radio
src/app/(artist)/goods/actions.ts                                       CRUD, uploadProductImage, processProductImages, loadProductForEditAction
src/app/(artist)/goods/[id]/page.tsx                                    direct-URL edit fallback

src/app/(artist)/bookings/requests/[id]/page.tsx                        booking detail
src/app/(artist)/bookings/requests/[id]/status-actions.tsx              Accept + popup (studio + goods) + deposit form
src/app/(artist)/bookings/actions.ts                                    approveBooking, approveBookingWithInterestDecisions, applyInterestDecisions, markGoodsPickedUp

src/app/request/[token]/page.tsx                                        customer portal (deposit + opt-in goods)
src/app/request/[token]/customer-portal.tsx                             portal layout
src/app/request/[token]/addons-checkout.tsx                             opt-in goods rows + Stripe Elements
src/app/request/[token]/actions.ts                                      prepareCheckoutAction

src/app/api/stripe/webhook/route.ts                                     payment_intent.succeeded handler

src/app/globals.css : reveal-on-hover                                   hover-only controls utility
```
