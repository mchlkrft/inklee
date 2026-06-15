# Goods checkout — Stripe test-mode QA script

**Purpose:** validate the Slice 72–76 commerce flow end to end in **Stripe test mode** before merging `feat/bio-page-goods` and before any real launch. The unit tests + the webhook amount-check are in place; this script covers what they can't: a real PaymentElement charge, the webhook firing, inventory, emails, and the artist-side panel.

**Scope of truth:** the booking/order only become final when the **webhook** (`/api/stripe/webhook`) receives `payment_intent.succeeded`. The client "Pay" button confirming is NOT enough. So webhook delivery must work in your test environment (see setup).

---

## 0. Prerequisites

- Migrations `0035_goods.sql` + `0036_orders.sql` applied (done).
- The environment under test uses **Stripe test keys**: `STRIPE_SECRET_KEY=sk_test_…`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_…`.
- **Webhook delivery.** Two options:
  - **Local (recommended):** run `pnpm dev`, then in a second terminal:
    `stripe listen --forward-to localhost:3000/api/stripe/webhook`
    Copy the printed `whsec_…` into `STRIPE_WEBHOOK_SECRET` in `.env.local` and restart dev. Leave `stripe listen` running — it forwards the real `payment_intent.succeeded` your test payment produces.
  - **Preview deploy:** deploy the branch with test keys, add a Stripe **test-mode** webhook endpoint pointing at `https://<preview-url>/api/stripe/webhook` (event `payment_intent.succeeded`), and use that `whsec_` as the env secret.
- **Email.** Magic-link + goods emails go through Resend. If email isn't delivering in your test env, you can still complete the flow by reusing the submission magic-link tab (see Step 3); treat email contents as a separate check on a deploy where Resend sends.
- A test artist account you can log in as, with **books open** (Bookings → Booking Settings) so the public form accepts a request.
- Stripe test cards: success `4242 4242 4242 4242`; decline `4000 0000 0000 0002`. Any future expiry, any CVC, any postal code.

Pick the artist's slug (e.g. `your-slug`); the public page is `localhost:3000/your-slug` locally.

---

## 1. Create test goods (artist)

1. Dashboard → **Goods** (sidebar) → **Add product**.
2. Product A — variant product: Title "Studio shirt", Category Shirt, Price `30`. Add two **variants**: `S` (price empty, stock `2`), `L` (price `35`, stock empty). Leave "Show on my public page" + "Offer as an add-on…" checked. Save.
3. Product B — simple product: Title "A4 print", Category Print, Price `15`, Quantity `5`. Both toggles checked. Save.
4. Product C — hidden control: Title "Secret zine", Price `10`, Status **Hidden**. Save.

**Expect:** `/goods` grid shows A, B, C; C shows a "Hidden" badge.

**Verify (Supabase):**

```sql
select id, title, status, price_amount, quantity, is_public_visible, is_checkout_addon
from products where artist_id = '<artist-uuid>' order by created_at;
select p.title, v.name, v.price_amount_override, v.stock_quantity
from product_variants v join products p on p.id = v.product_id
where p.artist_id = '<artist-uuid>';
```

## 2. Public Bio Page shows the shop (anyone)

1. Settings → **Bio page** → confirm **Shop** "Show" is checked. Add a custom link (e.g. Instagram) and a booking policy line; save.
2. Open `localhost:3000/your-slug`.

**Expect:** below the booking form — your custom link, the booking policy, and a **Shop** section with cards for "Studio shirt" and "A4 print" (NOT "Secret zine"). Cards show price, no buy button, and the line "Add these when you confirm your booking."

## 3. Submit a booking + request a deposit

1. On `localhost:3000/your-slug`, submit a booking request as a customer (use an email you can read). Keep the confirmation/magic-link page or email — that link is the customer portal.
2. As the artist: Bookings → open the request → **Request deposit**, amount e.g. `50`, save. Status becomes **Deposit pending**.

**Verify:**

```sql
select id, status, deposit_amount, deposit_payment_intent_id
from booking_requests order by created_at desc limit 1;
```

`status = deposit_pending`, `deposit_payment_intent_id` set (a `pi_…`).

## 4. Scenario A — deposit only (no goods selected)

1. Open the customer magic link → the portal shows the payment area. Because the artist has add-on goods, you see the **add-ons selector** + a Deposit/Total summary + the card field.
2. Do **not** add any goods. Button reads **"Pay deposit"**. Pay with `4242…`.

**Expect:** success state. Webhook fires.

**Verify:**

```sql
select status, deposit_paid_at from booking_requests where id = '<booking>';        -- approved, timestamp set
select count(*) from orders where booking_id = '<booking>';                          -- 0 (no order for deposit-only)
select action from audit_log where booking_id = '<booking>' and action = 'deposit_paid';
```

Booking is **approved**, **no order row**, deposit_paid logged. This proves the deposit-only path is unchanged.

> Reset for the next scenarios: submit a fresh booking + request a deposit again (an approved booking can't be re-paid).

## 5. Scenario B — deposit + goods (the main flow)

1. Fresh booking in **deposit pending**, open its portal.
2. In the add-ons selector, set **Studio shirt · L** quantity `1` and **A4 print** quantity `2`. Watch the total: Deposit `50` + Goods `35 + 30 = 65` = **Total EUR 115.00**. Button reads **"Pay deposit and selected items"**.
3. Pay with `4242…`.

**Expect:** "Payment received" state mentioning pickup.

**Verify:**

```sql
select id, status, deposit_amount, goods_amount, subtotal_amount, fulfillment_status
from orders where booking_id = '<booking>';        -- status paid, deposit 50, goods 65, subtotal 115, fulfillment pending_pickup
select type, title_snapshot, variant_snapshot, quantity, unit_amount, total_amount
from order_items where order_id = '<order>';        -- deposit line 50 + shirt(L) x1 @35 + print x2 @15=30
select status, deposit_paid_at from booking_requests where id = '<booking>';  -- approved
select name, stock_quantity from product_variants where name = 'L';  -- unchanged (L stock was unlimited/null)
select title, quantity from products where title = 'A4 print';       -- 5 -> 3 (decremented by 2)
```

- Order **paid**, amounts correct, item snapshots correct.
- **Inventory:** A4 print quantity dropped 5 → 3. Shirt L had null stock so unchanged.
- Email: customer receives "Your goods are reserved…" with the itemized list (check inbox if Resend sends in this env).
- Artist: Notifications shows "Goods reserved for pickup".

3b. **Artist booking detail:** open `/bookings/requests/<booking>`. The right column shows a **Goods** panel listing shirt (L) ×1 and print ×2, goods total EUR 65.00, state "Paid · awaiting pickup", and a **"Mark goods as picked up"** button. Click it.

**Verify:** `select fulfillment_status from orders where id = '<order>';` → `picked_up`. The button is gone; panel shows "Picked up".

## 6. Scenario C — stock limit + variant required

1. Fresh deposit-pending booking → portal.
2. Try to add **Studio shirt · S** quantity `3` (S stock = 2). The `+` stepper should **stop at 2** (can't exceed stock).
3. Add S ×2 and pay. Verify success, then:

```sql
select name, stock_quantity from product_variants where name = 'S';  -- 2 -> 0
```

4. Fresh booking → portal → add S again. S now shows **sold out** and `+` is disabled (stock 0). Server-side, `computeAddonLines` would also reject it — this is the belt-and-suspenders check.

## 7. Scenario D — safety + idempotency

- **Amount tamper / mismatch:** in Stripe CLI, you don't need to forge anything; the webhook verifies `intent.amount === order.subtotal*100`. To sanity-check the guard, re-trigger delivery of the same succeeded event:
  `stripe events resend <evt_id>` (from the `stripe listen` log).
  **Expect:** second delivery is a no-op — `{ received: true, skipped: true }` (the `deposit_paid` audit row + paid-order guard). Inventory does **not** double-decrement; check the A4 print quantity is unchanged after the resend.
- **Decline:** fresh booking, add goods, pay with `4000 0000 0000 0002`. **Expect:** inline "card declined" error, button re-enabled, no order flips to paid, no inventory change. A pending order row may exist (created at prepare) but stays `pending`.
- **Change selection then pay:** add goods, then remove them all before paying. **Expect:** button returns to "Pay deposit"; on pay, the PaymentIntent was reset to the deposit amount and the booking approves with **no** paid order (the pending order is deleted on the empty re-prepare).

## 8. Feature-flag gate (optional)

To confirm the paywall-readiness gate works (it defaults on):

```sql
update profiles set settings = jsonb_set(coalesce(settings,'{}'), '{features,checkout_addons}', 'false')
where id = '<artist-uuid>';
```

Reload a deposit-pending portal → the add-ons selector is gone, plain **DepositPaymentForm** shows. Set it back to `true` (or remove the key) after.

## 9. Cleanup

- Delete test products in `/goods` (or leave them on the test artist).
- Approved/paid test bookings can stay; or delete the rows.
- Re-enable any flags you toggled.

---

## Pass criteria

- [ ] Deposit-only flow (Scenario A) unchanged: booking approves, no order.
- [ ] Combined flow (B): order paid, amounts + snapshots correct, inventory decremented once, booking approved.
- [ ] Booking-detail goods panel + mark-picked-up work.
- [ ] Stock cap enforced in UI and server; sold-out blocked.
- [ ] Webhook idempotent on event resend; no double inventory decrement.
- [ ] Declined card leaves nothing paid.
- [ ] Goods confirmation email + artist notification fire (email subject "Your goods are reserved with …").
- [ ] Feature flag off hides the add-ons selector.

If all pass: merge `feat/bio-page-goods` → master. Real goods money in production still waits on **Stripe Connect (OT-12)**.
