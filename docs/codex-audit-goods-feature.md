# Goods commerce feature — Codex audit brief

**Status:** live in production on the unmerged `feat/bio-page-goods` branch, commit `51aaabd`, 241/241 vitest tests green.
**Migrations applied:** 0000–0038.
**Production money safety net:** the `checkout_addons` paywall flag is **OFF in prod** until OT-12 Stripe Connect ships (locked decision D3). Production additionally requires the env var `CHECKOUT_ADDONS_PROD_READY=true` to lift the deployment-wide gate (commit `c964f72`); without it, `getAddonProducts` returns an empty catalogue in prod regardless of per-artist settings.

**Audit-fix sweep, 2026-06-02 (this branch, commits `a31abe0` → `51aaabd`):** ten Codex audit findings closed (see §7 "Audit resolution log"). Sections below describe the post-fix state.

The feature ships in two parts: **(1) interest signalling** at the booking-form moment, and **(2) opt-in checkout** of the confirmed-available items at the deposit-payment moment. Goods are stored once with multi-image support, surface in the public shop overlay, on the artist booking detail page, in the approval email, and at the deposit checkout.

Interest signalling and checkout eligibility are **two distinct catalogues** (D11): the shop overlay lets the client mark interest in any public, active, EUR product; only products explicitly flagged `is_checkout_addon=true` are available to actually pay for at the deposit checkout.

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

| ID      | Decision                                                                                                                                                                                                                                                                                                                                                                               |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1**  | Slices 72–76 ship before public launch.                                                                                                                                                                                                                                                                                                                                                |
| **D2**  | Single combined Stripe **PaymentIntent** for deposit + goods. No Stripe Checkout Session. Itemised in our own `order_items`. Inventory decrement only after `payment_intent.succeeded`; concurrent oversell theoretically possible and accepted for v1.                                                                                                                                |
| **D3**  | **Stripe Connect (OT-12) is a hard gate for production goods money.** Until then the whole flow is built + tested in Stripe test mode. Implementation: per-artist `checkout_addons` flag + deployment-wide `CHECKOUT_ADDONS_PROD_READY` env var (commit `c964f72`). Production fails closed until the env var is `true`; non-prod (dev / preview / vitest) trusts the per-artist flag. |
| **D4**  | Add-ons attach at the deposit-payment moment in `/request/[token]`. Booking-interests later moved the _selection_ upstream to the booking-form; checkout became opt-in over the confirmed list.                                                                                                                                                                                        |
| **D5**  | Appointment pickup only. No shipping, no standalone cart, no buyer accounts, no discounts. One artist + one booking per checkout.                                                                                                                                                                                                                                                      |
| **D6**  | Paywall **readiness** only. `profiles.settings.features` flags + `canUseGoods()` / `canUseCheckoutAddons()` helpers default ON. No billing logic.                                                                                                                                                                                                                                      |
| **D7**  | **Booking-interests** — client marks goods to buy at request time; artist confirms availability per item on Accept (combined popup with optional studio confirm); decisions surface in the approval email.                                                                                                                                                                             |
| **D8**  | **Multi-image per product** — up to 3 (variant-less) OR `variantCount + 1` (with variants); first image is hero.                                                                                                                                                                                                                                                                       |
| **D9**  | Email is always required on the public booking form; per-field Required toggles for everything else. Instagram-OR-email rule reverted.                                                                                                                                                                                                                                                 |
| **D10** | Goods at checkout are **opt-in** — even confirmed-available items render with qty 0 default. The client actively adds, doesn't feel forced.                                                                                                                                                                                                                                            |
| **D11** | **Interest signalling is broader than checkout.** Public shop interest = any `status='active'`, `is_public_visible=true`, `currency='eur'` product. Checkout eligibility adds `is_checkout_addon=true` on top. A product without the addon flag is signal-only — the artist sees it on the booking but it cannot be paid for at the deposit moment.                                    |

---

## 3. End-to-end flow

### 3.1 Artist sets up goods (`/goods`)

- Grid of tiles (`goods-tile.tsx`); each shows the first image, status badge, and a `+N` multi-image badge when the gallery has more than one. Click reveals **Sold out / Edit** actions.
- **Inline edit modal** (`goods-edit-modal.tsx`) — replaces the `/goods/[id]` subpage for normal flow; subpage stays as a direct-URL fallback. Lazy-loads via `loadProductForEditAction`.
- **Multi-image picker** (`product-form-fields.tsx`): thumbnail grid with X-to-remove + `+ Add image` tile. Cap is **live**: `variantCount > 0 ? variantCount + 1 : 3`. Drops storage objects when the artist removes an image on save.
- **Multi-input architecture (commit `033fb09`).** Each picked File renders its own dedicated hidden `<input name="images">` (sub-component `NewFileInput`), populated once via `DataTransfer` on mount and then never touched again. The OS picker writes to a **separate** trigger input that has no `name` (so it doesn't post) and is `.value=""`-reset after every pick. This replaces an earlier shared-input + post-pick DataTransfer-resync pattern that lost everything but the most recent pick in some browsers (artists could effectively only add one image per save). The server still reads via `formData.getAll("images")`, in DOM order.
- **Publish/draft** is an explicit required radio choice on the main form (no silent default). `is_checkout_addon` and `is_public_visible` checkboxes under "More settings".
- **Variants** are inline rows (name + override price + stock). Each row round-trips its persisted id through the form (commit `51aaabd`, finding #8). On save `reconcileVariants` UPDATEs existing ids in place, INSERTs id=null rows, and for removed rows soft-archives to `status='hidden'` if there are any `booking_interests` / `order_items` references — keeping the FK pointer alive — or hard-deletes when there aren't. Replaces the previous `replaceVariants` (delete+re-insert) that silently nulled every historical pointer via `ON DELETE SET NULL`.
- **Storage paths:** `<artistId>/goods/<productId>/<uuid>.webp` (per-image, mig 0038). Legacy `<artistId>/goods/<productId>.webp` is still cleaned up on delete. Storage removals re-derive paths via `ownedGoodsStoragePath` (commit `a31abe0`, finding #7) so a path can only resolve to this artist's + product's namespace — a tampered `existing_image_urls` payload cannot reach across artists.

Server: `src/app/(artist)/goods/actions.ts`

- `createProductAction` / `updateProductAction` — both flow through `processProductImages(userId, productId, formData, maxImages, prevImageUrls)` which reads `existing_image_urls` (JSON keep-list) + `images` (FileList — now one File per dedicated input), uploads each new file via `uploadProductImage`, composes the final array, and storage-deletes everything that dropped out of the keep-list. Writes `image_urls` and keeps `image_url = image_urls[0]` for legacy readers. On upload failure, rolls back the just-uploaded files this call produced.
- `deleteProductAction` snapshots `image_urls` first, deletes the row (variants cascade), then sweeps every per-product storage file via `goodsImagePathFromUrl(url)`.

### 3.2 Client opens the public shop overlay

**`src/app/[slug]/shop-teaser.tsx`** — full-screen overlay rendered from the "Shop" header card on `/[slug]`. Major rewrite at commits `b16e87e` (add-to-cart redesign) and `b8642d3` (lightbox + hover zoom); old checkbox/stepper/`reveal-on-hover`/`pendingPicks`/`poppedForItems`/"Got it — anything else?" model is gone.

**Layout:**

- Big `{artistName} shop` headline (text-4xl → text-6xl, centred).
- **Cart-style summary list** beneath the headline when anything is selected — one line per `(product, variant)` selection: `× ✓ Title · Variant × qty`. The `×` is an X-remove button per line. Below the list: a small **"Done, back to booking"** underline link.
- 5-column grid on `lg+` (mobile 2, sm 3), cards inside `max-w-7xl`.
- Persistent **Done** button at the bottom (mustard) — running item count is surfaced when anything is picked.
- Three exit paths: floating X top-right, the cart-list "Done" link, the bottom Done button. All four exit paths (these three + Escape) route through a single `closeShop()` helper that resets both `open` and `lightbox` state.

**Per card (`ProductCard` sub-component):**

- Owns its own `pickedVariantId` local state. After every Add, resets to `null`.
- Variant chips are **always visible** for products with variants (no "click checkbox to reveal" pattern any more).
- Single mustard **Add to cart** button per card. Button label adapts:
  - `Pick an option` — variant product with nothing picked.
  - `Unavailable` — `!interestEligible` or `soldOut`.
  - `Add another (N in cart)` — same combo already in cart, qty `N`.
  - `Add to cart` — default.
- Stock cap for the currently-picked combo is read from `variant.stock` (when present). Product-level `quantity` is **server-enforced** by `computeInterestRows` at submit, not exposed to the public shop type.

**Selection model:**

Selections are keyed by `(productId, variantId)`. Picking the same product in two different variants produces **two cart lines** (not merged). Re-adding the same combo increments the existing entry's quantity. Selections live in **`InterestSelectionsProvider`** (`src/app/[slug]/interest-selections-context.tsx`) so `BookingForm` (rendered elsewhere on the page) reads them on submit.

**Per-card image (`CardImage` sub-component, commit `b8642d3`):**

- Single image: just renders the image.
- Multiple images: small prev/next chevrons and a dot indicator strip inside the card. Arrows `stopPropagation` so they never trigger Add-to-cart.
- **Hover zoom:** `transition-transform` + `group-hover:scale-[1.04]` scoped to a `group` wrapper on the image area only — hovering the title, chips, or Add button does NOT zoom.
- **Click → lightbox:** the image is wrapped in a `<button aria-label="View larger">` with `cursor-zoom-in`. Click invokes the parent's `onZoom(idx)` with the currently-displayed index.

**Lightbox (`Lightbox` sub-component):**

- Fully-controlled: parent owns `urls`, `alt`, and `idx`; lightbox calls `onIdxChange(next)` and `onClose()`.
- Single-image lightbox: just the main image + X close + click-backdrop-to-close.
- Multi-image lightbox: prev/next chevrons, a horizontal thumbnail strip below the main image (active thumbnail outlined in brand-mustard), a `n / m` counter, and keyboard `←`/`→` to step.
- **Positioning gotcha (commit `6bc6c6b`).** The lightbox is rendered as a **sibling** of the shop overlay's outer dialog, not as a child. The shop overlay has `backdrop-blur-sm` (= `backdrop-filter: blur(...)`), which turns it into the containing block for any `fixed`-positioned descendant. Combined with the shop overlay's `overflow-y-auto`, a child lightbox with `fixed inset-0` was being pinned to the shop's scroll area rather than the viewport — it scrolled along with the shop and only "looked correct" once the user scrolled to align it. Hoisting it out as a sibling restores viewport-pinned `fixed`. Guard: `open && lightbox`.
- Body scroll lock from the shop overlay carries over while the lightbox is open. No second lock needed.

**Keyboard:**

- Single document keydown handler in ShopTeaser drives both dialogs.
- `Escape` closes the lightbox first if open, otherwise closes the shop.
- `ArrowLeft` / `ArrowRight` step the lightbox image when multiple are present (no-op for single-image).

### 3.3 Client submits the booking

**`src/app/[slug]/booking-form.tsx`** appends `interests_json` (serialised selections) to the FormData.

**`src/app/[slug]/actions.ts` `submitBookingAction`** validates BEFORE the booking insert:

- `parseInterestSelections(rawInterests)` — lenient JSON parse, drops zero-qty.
- `getInterestEligibleProducts(artistId)` (`src/lib/addon-products.ts`) — fetches the broader interest catalogue: `status='active'`, `is_public_visible=true`, `currency='eur'`. **No** `is_checkout_addon` filter. Gated by `canUseGoods` (`goods_module` flag) — independent of the production money gate (commit `c964f72`, finding #1). The checkout-time flow uses `getAddonProducts`, which adds three gates on top of the strict `is_checkout_addon=true` filter: (a) `canChargeCheckoutAddons` (per-artist `checkout_addons` flag AND the `CHECKOUT_ADDONS_PROD_READY` env var in prod), (b) artist's `stripe_account_status='active'`, (c) artist's `stripe_charges_enabled=true` — the last two added in OT-12.2 so an un-connected, pending, restricted, or disabled artist returns an empty addon catalogue.
- `computeInterestRows(products, selections)`:
  - Aggregates duplicate `(product, variant)` lines (hardens against split-to-oversell client payloads).
  - Rejects unknown / non-active / missing-variant / over-stock / over `MAX_INTEREST_QUANTITY=10`.
  - **No longer rejects non-addon products** (commit `b16e87e`) — the comment in `booking-interests.ts` makes the rationale explicit; checkout still re-validates via `getAddonProducts + computeAddonLines`, which DO enforce the flag.
  - Snapshots `title`, `variant_snapshot`, `unit_price`.
- Returns a form error on validation failure (clean re-prompt).

After the booking row + audit_log are written, `booking_interests` rows are inserted via the service-role client. Insert failure is captured to Sentry but doesn't fail the booking (the row already exists; goods just don't appear on the artist side until next attempt).

Notification: artist's "New booking request" message gains "+ Marked N item(s) they'd like to buy." when interests exist.

### 3.4 Artist accepts (`/bookings/requests/[id]`)

**`page.tsx`** computes:

- `guestSpotStudioName` via **`resolveBookingGuestSpotStudio`** (`src/lib/booking-studio.ts`) — priority: trip-leg studio for the date → slot.flash_day.studio when non-primary → booking.studio_id when non-primary. Returns `null` for primary-studio bookings (no studio popup needed).
- `interests` — joined with `products(image_url, image_urls)` so the popup can show thumbnails. Maps PostgREST embed (object **or** array) into a single object.
- `pendingInterests` = `interests.filter(status === "pending")`, passed to **both** the mobile and desktop `StatusActions` instances (commit `40a6524`, finding #5 — previously the desktop instance was missing this prop and the goods confirmation block didn't render on lg+ screens).

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
- `approveBookingWithInterestDecisions(id, decisions)` — fetches existing interests, updates each `pending` row's `status` + `decline_note`, then runs the approval flow; sends `customer_booking_approved` with `goodsDecisions[]` so the email renders an **"About your goods"** block ("ready for pickup" lines for available items, "not available — <note>" for declined). Per-row guard is now BOTH an app-level early-drop (skip non-pending or unknown rows) AND a SQL-level `.eq("status", "pending")` on the UPDATE (commit `40a6524`, finding #6) so a concurrent decision or rapid double-click matches 0 rows instead of overwriting an already-decided row.
- `applyInterestDecisions(id, decisions)` — same dual guard, but **only** updates interest rows. No status transition, no email. Used by the Request-deposit path.
- `markGoodsPickedUp(orderId)` — `paid` orders only, scoped to artist_id.

Email surface: `src/lib/email/booking-templates.ts` `buildEmailHtml` accepts optional `studio` + `goodsDecisions` and `src/lib/email/send-booking-email.ts` plumbs them through `customer_booking_approved`.

### 3.6 Deposit checkout (test mode only in prod)

**`src/app/request/[token]/page.tsx`** — when `status === 'deposit_pending'`, the portal renders the **intersection** of (a) `booking_interests` rows the artist confirmed `status='available'` for this booking AND (b) the artist's current `getAddonProducts(artistId)` catalogue (commit `c964f72`). Prices, variant names, and stock come from the live catalogue, not interest snapshots — the snapshots are for the artist's "what they marked" view, but the checkout total uses authoritative prices and on-hand stock. Quantity per row is capped at `min(confirmed interest qty, current variant/product stock)`. Non-addon products appear in (a) but not (b), so they stay signal-only and never surface as a payable row.

**`src/app/request/[token]/customer-portal.tsx`** — always renders `<AddonsCheckout>` for `status='deposit_pending'`, even when `addonProducts.length === 0` (commit `c964f72`, finding #9). The previous DepositPaymentForm branch called `stripe.confirmPayment` without going through `prepareCheckoutAction`, which could confirm a stale goods-inclusive PaymentIntent if the user had previously added goods in a prior session.

**`src/app/request/[token]/addons-checkout.tsx`** — Stripe Elements wrapper:

- Each row renders qty stepper, default **0** (strict opt-in).
- Heading hidden when no goods rows; the deposit total + payment element still render.
- On "Pay deposit (and selected items)": ALWAYS calls `prepareCheckoutAction` (empty selection → reset branch) then `stripe.confirmPayment({redirect: 'if_required'})`.

**`src/app/request/[token]/actions.ts` `prepareCheckoutAction`:**

- Validates the booking + status.
- **Authorisation gate (commit `c964f72`, finding #2):** loads this booking's confirmed-available interests and intersects with the incoming selections. Out-of-allowlist → "isn't approved for this booking" error. Over-cap quantity → "up to the quantity the artist confirmed" error.
- `getAddonProducts(artistId)` + `computeAddonLines(products, selections)` recompute the authoritative total **server-side** (never trusts client amounts; same dedup hardening as the interest validator). `getAddonProducts` itself is gated by `canChargeCheckoutAddons` — the strict checkout flag plus the prod money-gate.
- Deletes any prior pending order for this booking; inserts a fresh `orders` row + `order_items` (deposit line + product lines with snapshots).
- Updates the existing deposit PaymentIntent's `amount` + `metadata.order_id`.
- Empty-selection path: drops the order and resets the intent to deposit-only. This is the path that runs from `<AddonsCheckout>` when there are no goods rows.

### 3.7 Webhook + fulfillment

**`src/app/api/stripe/webhook/route.ts`** handles `payment_intent.succeeded`:

- Constructs event via Stripe SDK with `STRIPE_WEBHOOK_SECRET`.
- **Idempotency (commit `9b68137`, finding #4):** booking-side and order-side are independently gated. Booking-side guard = `audit_log` (`deposit_paid` row for this `payment_intent_id`) OR booking already in a terminal status; if neither, the booking-side runs and inserts both. Order-side guard = `.select()`-gated `pending → paid` flip; only the single transaction that observes `status='pending'` runs `decrementInventory`. **Crucially: a partial failure last time (booking succeeded, order flip threw) is now catchable on retry — the order-side still runs even when the booking-side guard says "already done".**
- Amount verification: `intent.amount === expected` where expected is `order.subtotal_amount * 100` (combined) or `booking.deposit_amount * 100` (deposit-only).
- Flips booking → `approved`, rotates the customer token, writes audit.
- Order side (when `metadata.order_id` present): `.select()`-gated `pending → paid` flip ensures inventory decrement runs once even on Stripe retries; `decrementInventory(items)` writes per-variant `stock_quantity` or per-product `quantity` (null = unlimited, skipped).
- Emails: `sendGoodsOrderConfirmation` (when goods), `sendArtistDepositPaidEmail`, and the approval email (with `studio` + `goodsDecisions`).

---

## 4. Production status (2026-06-02)

- Branch `feat/bio-page-goods` HEAD `51aaabd` — **not merged**.
- Migrations 0000–0038 applied.
- `checkout_addons` flag stays OFF in prod (D3); the booking-interest signal layer + the artist popup + the multi-image features + the post-audit hardening are fully live.
- 241 vitest tests green.
- Env var `CHECKOUT_ADDONS_PROD_READY` is the deployment-wide gate (commit `c964f72`). Unset / non-"true" in prod → `getAddonProducts` returns empty regardless of per-artist setting.

Recent post-`220594f` commits relevant to this audit:

| Commit    | Subject                                                                           |
| --------- | --------------------------------------------------------------------------------- |
| `b16e87e` | shop overlay: add-to-cart per variant, decouple interest from `is_checkout_addon` |
| `033fb09` | goods images: one input per picked file so multi-add survives picker reuse        |
| `b9a6fe0` | shop overlay: drop em-dash in cart "Done" link                                    |
| `b8642d3` | shop overlay: hover-zoom + Amazon-style lightbox with thumbnail strip             |
| `6bc6c6b` | shop overlay: pin lightbox to viewport by hoisting it out of the shop dialog      |
| `a31abe0` | security: image storage authorisation + mapsUrl email href sanitiser              |
| `c964f72` | money correctness: feature-gate split, checkout allowlist, live prices, stale PI  |
| `9b68137` | webhook: decouple booking-side and order-side idempotency                         |
| `40a6524` | desktop accept-popup parity + SQL-level interest race guard                       |
| `51aaabd` | reconcile variants instead of delete + recreate                                   |

---

## 5. Where the audit should focus

| Area                                    | Why                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Money correctness**                   | `prepareCheckoutAction` server-recompute + `webhook` amount check + `.select()`-gated order flip + `decrementInventory`. Verify a crafted client can't bypass the total.                                                                                                                                                                                                                   |
| **Webhook idempotency**                 | Stripe retries; concurrent deliveries. Today: audit-log row + status guard up front. Anything else racy?                                                                                                                                                                                                                                                                                   |
| **Authorisation**                       | `submitBookingAction` uses serviceClient (bypasses RLS) but server-validates against `getInterestEligibleProducts(artistId)`. Artist mutations (`approveBookingWithInterestDecisions`, `applyInterestDecisions`, `markGoodsPickedUp`, `setProductStatusAction`) all gate on `auth.uid()` + `artist_id`.                                                                                    |
| **Two-catalogue invariant (D11)**       | Interest vs checkout eligibility split. Verify that **no** code path lets a non-addon product reach a payable `order_items` row. `computeAddonLines` is the only writer; it filters via `getAddonProducts` (strict `is_checkout_addon=true`). Look for any path that would let an interest row template a payable line without re-validation.                                              |
| **Studio resolution**                   | `resolveBookingGuestSpotStudio` priority order (trip leg → slot.flash_day → booking.studio_id) and the parallel `resolveStudioForBooking` used for emails. Edge cases: trip without studios set, slot without flash_day, primary studio missing.                                                                                                                                           |
| **Multi-image pipeline**                | `processProductImages` keep-list + new files + clamp at `maxImages`; `goodsImagePathFromUrl` URL → path derivation; storage cleanup on delete sweeps every per-product file. Look for a save that fails mid-upload (orphaned files) and for any client-side path where the dedicated-`NewFileInput` per-pick architecture could regress to a single shared input that loses earlier picks. |
| **Interest snapshots**                  | The popup decisions email reads `title_snapshot` / `variant_snapshot` / `quantity` from the row (intentionally, in case the product was later edited).                                                                                                                                                                                                                                     |
| **`applyInterestDecisions` invariants** | Only touches `pending` rows; safe against stale client payloads / double-clicks.                                                                                                                                                                                                                                                                                                           |
| **Shop overlay UX**                     | Composite-key `(productId, variantId)` selection model; per-`ProductCard` local `pickedVariantId`; `closeShop()` covers all four exit paths (X, cart Done link, bottom Done button, Escape) and resets lightbox state alongside. Verify no path leaves the lightbox open after the shop closes, and that the same product in different variants always renders as separate cart lines.     |
| **Lightbox positioning**                | The lightbox MUST stay a sibling of the shop overlay's outer dialog in the JSX. The shop overlay's `backdrop-blur-sm` (= `backdrop-filter`) plus its `overflow-y-auto` scroll container would otherwise make `fixed inset-0` resolve against the shop content area rather than the viewport. Any refactor that nests the lightbox inside the shop overlay reintroduces the bug.            |

### Known things deliberately deferred

- Inventory decrement is read-modify-write (not atomic). Plan §4 accepts concurrent oversell for v1.
- No reservation / TTL on stock at interest-marking time.
- No analytics events wired (Slice 76 optional).
- `/goods` dashboard tile + `/goods/[id]` subpage don't show carousel; thumbnail only.
- No end-to-end / Playwright coverage for the shop overlay, popups, lightbox, or multi-image picker; visual regression risk on the UX redesign.
- The `reveal-on-hover` utility in `globals.css` was used by the previous shop-teaser UX and is now **orphaned**; safe to delete in a future cleanup pass.

---

## 6. File map

```
src/db/schema.ts                                                        Drizzle tables
supabase/migrations/0035_goods.sql                                      products + variants + enums
supabase/migrations/0036_orders.sql                                     orders + order_items + enums
supabase/migrations/0037_booking_interests.sql                          booking_interests + status enum
supabase/migrations/0038_product_image_urls.sql                         products.image_urls text[]

src/lib/goods.ts                                                        type defs (PublicProduct, AddonProduct), price helpers
src/lib/orders.ts                                                       computeAddonLines (validation + line composition; CHECKOUT path)
src/lib/addon-products.ts                                               getInterestEligibleProducts (broad) + getAddonProducts (strict)
src/lib/booking-interests.ts                                            parseInterestSelections + computeInterestRows (no addon-flag gate)
src/lib/booking-studio.ts                                               resolveStudioForBooking + resolveBookingGuestSpotStudio
src/lib/order-fulfillment.ts                                            decrementInventory
src/lib/features.ts                                                     paywall flags
src/lib/email/booking-templates.ts                                      buildEmailHtml + EmailGoodsDecision
src/lib/email/send-booking-email.ts                                     sendBookingEmail + sendGoodsOrderConfirmation + sendArtistDepositPaidEmail

src/app/[slug]/page.tsx                                                 public bio page (uses getInterestEligibleProducts for shop)
src/app/[slug]/shop-teaser.tsx                                          public shop overlay — CardImage (hover-zoom + click-to-zoom),
                                                                        ProductCard (composite-key add-to-cart), Lightbox (controlled,
                                                                        sibling of the shop dialog), cart-list with X-remove
src/app/[slug]/booking-form.tsx                                         booking form (reads interest selections)
src/app/[slug]/interest-selections-context.tsx                          shared client state
src/app/[slug]/actions.ts                                               submitBookingAction (persists interests via interest-eligible catalogue)

src/app/(artist)/goods/page.tsx                                         goods grid
src/app/(artist)/goods/goods-tile.tsx                                   tile + action stack + +N image badge
src/app/(artist)/goods/goods-edit-modal.tsx                             inline edit modal
src/app/(artist)/goods/product-form-fields.tsx                          form fields + multi-image picker (NewFileInput per pick + trigger input) + publish/draft radio
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

src/app/globals.css : reveal-on-hover                                   orphaned utility (used by the pre-b16e87e shop overlay)
src/components/deposit-payment-form.tsx                                 orphaned post-c964f72 (customer-portal always uses AddonsCheckout)
```

---

## 7. Audit resolution log (2026-06-02)

Ten Codex audit findings closed in commits `a31abe0` → `51aaabd`.

| #   | Finding                                | Resolution                                                                                                                                                                                                                                                              | Commit    |
| --- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 1   | Feature gates                          | `getInterestEligibleProducts` now uses `canUseGoods` (`goods_module`). `getAddonProducts` uses new `canChargeCheckoutAddons` which adds env-gated `CHECKOUT_ADDONS_PROD_READY` on top of the per-artist `checkout_addons` flag — prod fails closed without the env var. | `c964f72` |
| 2   | prepareCheckoutAction authorisation    | Selections are intersected with `booking_interests` rows where `status='available'` for THIS booking. Out-of-allowlist → clear "isn't approved" error. Over-cap qty → "up to confirmed quantity" error.                                                                 | `c964f72` |
| 3   | Portal renders authoritative prices    | `addonProducts` for the portal are now the intersection of confirmed interests AND the current `getAddonProducts` catalogue. Prices, variant names, stock come from the catalogue; qty capped at min(confirmed qty, on-hand stock).                                     | `c964f72` |
| 4   | Webhook idempotency                    | Booking-side and order-side now independently idempotent: booking-side guarded by audit_log + terminal status, order-side by the existing `.select()`-gated `pending → paid` flip. Catch-up retries can now flip the order on a delivery after the booking already ran. | `9b68137` |
| 5   | Desktop accept popup missing interests | Desktop `StatusActions` now receives the same `pendingInterests` mapping the mobile one did.                                                                                                                                                                            | `40a6524` |
| 6   | Interest decision race                 | Added `.eq("status", "pending")` to both UPDATE WHERE clauses in `approveBookingWithInterestDecisions` and `applyInterestDecisions`. Concurrent decisions / double-clicks now no-op at the SQL level instead of overwriting an already-decided row.                     | `40a6524` |
| 7   | Image storage authorisation            | `processProductImages` filters keep-list entries against the product's current `image_urls` — anything not in `prevImageUrls` is dropped. New `ownedGoodsStoragePath` re-validates derived paths against `${userId}/goods/${productId}/` on every removal.              | `a31abe0` |
| 8   | Variant edits                          | `replaceVariants` → `reconcileVariants`. Existing ids round-trip through the form; UPDATE in place; INSERT for new; for removed rows, count FK refs in `booking_interests` + `order_items` and soft-archive (`status='hidden'`) when referenced, hard delete otherwise. | `51aaabd` |
| 9   | Deposit-only stale PaymentIntent       | `customer-portal.tsx` always renders `<AddonsCheckout>` now; its `handlePay` always runs `prepareCheckoutAction` (empty selection takes the reset branch) before `stripe.confirmPayment`. Stale goods-inclusive intent can no longer be confirmed under a deposit UI.   | `c964f72` |
| 10  | Email mapsUrl                          | New `sanitizeHrefForEmail()` parses with `URL`, requires http(s), HTML-escapes the result. Studio rendering in `buildEmailHtml` drops invalid hrefs silently.                                                                                                           | `a31abe0` |

### Carry-forward / not addressed

- **Atomic inventory decrement.** Read-modify-write still; concurrent oversell accepted for v1 per Plan §4.
- **Stock reservation at interest-marking time.** Still not implemented.
- **Slot flip via webhook path.** When a deposit_pending booking has a `slot_id`, the artist-side approve actions flip `slots.status = 'booked'`. The webhook path does not; the booking goes to approved but the slot stays as-is. Not flagged by this audit but worth a follow-up.
