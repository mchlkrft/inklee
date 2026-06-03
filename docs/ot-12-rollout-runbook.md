# OT-12 Stripe Connect — deposit-fee rollout runbook

**Rewritten 2026-06-03 for the money-scope reset.** The original runbook was a
goods-checkout cutover (flip `CHECKOUT_ADDONS_PROD_READY`). That is **obsolete**:
goods are now showcase-only and parked behind `GOODS_COMMERCE_ENABLED` (default
OFF), so there is nothing to flip for goods. This runbook verifies the
**deposit + 3% platform-fee** flow end to end.

What OT-12 now means: an artist optionally connects Stripe, collects a deposit
by card into their **own** account (destination charge + `on_behalf_of`), and
Inklee keeps a **3% all-in platform fee** (`application_fee_amount`). See
`docs/restructure-money-scope-2026-06-03.md` and
`docs/payment-flow-for-counsel.md` for the model.

Three phases:

1. **Local test-mode QA** — verify the deposit-fee + refund wiring end to end.
2. **Production readiness** — confirm live-mode Connect webhook events (no env
   flip needed for deposits).
3. **First real artist** — onboard, take a real deposit, soak.

Phase 1 is ~20 minutes solo. Phase 2 is a 5-minute Stripe Dashboard check.
Phase 3 is external (needs a real artist).

---

## Phase 0: Preflight

- [x] **Migration 0039 applied** (`profiles.stripe_*` columns) — done + verified
      2026-06-02. To re-confirm, run in the Supabase SQL Editor:

  ```sql
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'profiles' AND column_name LIKE 'stripe_%';
  ```

  Expect 6 rows: `stripe_account_id`, `stripe_account_status`,
  `stripe_charges_enabled`, `stripe_payouts_enabled`, `stripe_account_country`,
  `stripe_account_updated_at`.

- [ ] **Connect events enabled** on the Stripe **test-mode** webhook endpoint.
      Stripe Dashboard → Test mode → Developers → Webhooks → the endpoint for
      `/api/stripe/webhook` (or your `stripe listen` endpoint). Add:
  - `account.updated`
  - `account.application.deauthorized`
  - (`payment_intent.succeeded` stays.)

- [ ] **`.env.local` has Stripe TEST keys** and leaves goods parked:

  ```
  STRIPE_SECRET_KEY=sk_test_...
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
  STRIPE_WEBHOOK_SECRET=whsec_...        # the test-mode secret
  NEXT_PUBLIC_APP_URL=http://localhost:3000
  # Do NOT set GOODS_COMMERCE_ENABLED — goods stay showcase-only (parked).
  ```

- [ ] **Two terminals:**
  - A: `pnpm dev`
  - B: `stripe listen --forward-to localhost:3000/api/stripe/webhook`

If any step is unclear or fails, stop and tell me — I'll diagnose first.

---

## Phase 1: Local test-mode QA (~20 minutes)

Use a **dedicated test artist account** (not your founder/admin account).

### Test 1: Connect onboarding in the artist's country (not US)

- [ ] Go to `http://localhost:3000/settings/payouts`. Status reads **"Not
      connected"**. Copy reads as **optional** ("Connect Stripe only if you want
      clients to pay deposits by card here…") and mentions the **3% fee**.
- [ ] A **country selector** is shown (defaults to **Germany**). Pick your real
      country (this is fixed at account creation).
- [ ] Click **"Connect Stripe"** → redirected to Stripe Express onboarding.
- [ ] Fill Stripe's test data **for the country you picked**:
  - **EU (e.g. Germany):** test IBAN `DE89 3704 0044 0532 0130 00`, any test
    name/DOB/address Stripe accepts; use Stripe's instant-verify test values.
  - **United States (only if you picked US):** SSN `000-00-0000`, routing
    `110000000`, account `000123456789`.
- [ ] Submit → bounced back to `/settings/payouts`, status now **"Connected"**.
- [ ] The detail row shows **Country = the country you picked** (NOT `US`, unless
      you picked US). This is the F9 fix — verify it.
- [ ] **DB check:**
  ```sql
  SELECT stripe_account_status, stripe_charges_enabled, stripe_account_country
  FROM profiles WHERE id = '<test-artist-id>';
  ```
  Expect `active`, `true`, and your chosen country code.
- [ ] **Terminal B**: `account.updated [evt_...] -> 200`.

### Test 2: Deposit request → Connect-routed intent WITH the platform fee

- [ ] In an incognito window, submit a booking for the test artist's slug.
- [ ] As the artist, open `/bookings/requests/[id]` → **Request deposit** → EUR
      **50**, due in 7 days. Before submitting, the form shows the fee line:
      **"Inklee fee (3%, incl. card processing): −EUR 1.50 · You receive EUR
      48.50"**. Submit.
- [ ] **PaymentIntent shape** (Stripe Dashboard → Test mode → Payments → newest):
  - "On behalf of" = the artist's connected account.
  - Transfer data → destination = the artist's `acct_...`.
  - Amount = `5000` (EUR 50.00).
  - **Application fee** is present and = **`50` cents** (EUR 0.50). This is what
    Inklee KEEPS (3% of €50 = €1.50, minus Stripe's standard €1.00 absorbed →
    €0.50). Confirm a non-zero application fee exists — that is the RS-4 fee.
- [ ] **audit_log check:** `details.stripe_connect_routed = true` on the latest
      `status_changed` row for the booking.

> Note on small amounts: on a €50 deposit Inklee's kept fee is only €0.50
> because it absorbs Stripe's standard cut out of the 3%. On a €200 deposit the
> kept fee is ~€2.75. Both are correct — see `platform-fee.ts`.

### Test 3: Customer pays → split lands correctly

- [ ] Open the customer magic link → pay with `4242 4242 4242 4242`, any future
      expiry/CVC/postcode.
- [ ] Booking flips to **approved**. Terminal B: `payment_intent.succeeded ->
    200`.
- [ ] **Artist's Connect balance** (Dashboard → Connect → Accounts → test artist
      → Balance): the deposit transfer appears, net of the application fee.
- [ ] **Platform balance** shows the **application fee** (€0.50) as Inklee's
      revenue.
- [ ] **audit_log:** the `deposit_paid` row's `details.application_fee_eur` =
      `0.5`.
- [ ] **booking_requests:** `status='approved'`, `deposit_paid_at` recent.

### Test 4: Refund → client made whole, Inklee returns its fee

- [ ] On the booking detail, in the **Deposit** card, click **"Refund deposit"**
      → confirm. (Visible only because this is a paid in-app deposit.)
- [ ] **Stripe Dashboard → the charge → Refunds:** a full refund of EUR 50; the
      **application fee is refunded** too (Inklee returns its €0.50).
- [ ] **Artist's Connect balance:** reduced by the reversed transfer (the
      artist absorbs Stripe's non-refundable processing fee — expected).
- [ ] **audit_log:** a `deposit_refunded` row with `refund_id`, `amount_eur`.
- [ ] The deposit card now shows **"Refunded EUR 50.00 to the client."** and the
      refund button is gone (double-refund guard).

### Test 5: Manual deposit + the F7 cancel-on-manual-mark guard

- [ ] Sign in as a **different artist who has NOT connected Stripe**.
- [ ] `/settings/payouts` reads "Not connected"; `/bookings/deposits` shows
      **"In-app card deposits are off"** with the manual explanation.
- [ ] Create a booking → **Request deposit**. The form explains this is a
      **manual** deposit (no card form) and nudges Connect. Submit.
- [ ] **No PaymentIntent is created** (audit_log `stripe = false`); the customer
      portal shows the amount + note, no card field.
- [ ] As the artist, the deposit_pending view shows the primary **"Mark deposit
      received"** button (manual path). Click it → booking approved.
- [ ] **F7 check (connected artist path):** repeat with a CONNECTED artist who
      requested an in-app deposit. The deposit_pending view now shows **"Waiting
      for card payment"** with the manual mark demoted under "Client paying
      another way?". Use that override → confirm the live PaymentIntent is
      **canceled** in the Stripe Dashboard (so the client can't be charged
      afterward).

### Test 6: Disconnect handling

- [ ] Stripe Dashboard → Connect → Accounts → test artist → disconnect.
- [ ] Terminal B: `account.application.deauthorized -> 200`.
- [ ] `/settings/payouts` reads "Not connected"; DB: `stripe_account_status='unset'`,
      charges/payouts `false`, but `stripe_account_id` retained.
- [ ] A new deposit request for that artist now creates a **manual** deposit
      (no intent), since `routeCharges` is false.

### Test 7 (quick): goods are showcase-only

- [ ] On the public page Shop overlay, products render as a **gallery** — there
      is **no "Add to cart"** control and no cart, because `GOODS_COMMERCE_ENABLED`
      is off. Confirm a deposit checkout shows **deposit only** (no goods rows).

---

## Phase 1 done → Phase 2

If all of Phase 1 passed, the deposit-fee + refund wiring is correct. If
anything failed, stop and triage before production.

---

## Phase 2: Production readiness (~5 minutes, no env flip)

Deposits have been live since 2026-05-22, so there is **no feature flag to flip**
for this. The only production prerequisites are the Connect webhook events and
keeping goods parked.

- [ ] **Live-mode Connect webhook events.** Stripe Dashboard → **Live mode** →
      Developers → Webhooks → the production `/api/stripe/webhook` endpoint.
      Confirm it listens to:
  - `payment_intent.succeeded` (already there — deposits)
  - `account.updated` (**add**)
  - `account.application.deauthorized` (**add**)
- [ ] **Live keys present** in Vercel prod (`sk_live_...`, `pk_live_...`,
      live-mode `STRIPE_WEBHOOK_SECRET`). Already true since 2026-05-22.
- [ ] **`GOODS_COMMERCE_ENABLED` is NOT set in production** (goods stay
      showcase-only). There is intentionally nothing to enable here.
- [ ] **No `CHECKOUT_ADDONS_PROD_READY` needed.** If it's still set in Vercel
      from the old plan, it's now inert (goods are gated by `GOODS_COMMERCE_ENABLED`
      upstream) — safe to delete for cleanliness.

No redeploy is required for any of the above (webhook events are a Stripe-side
config, not an app build).

---

## Phase 3: First real artist (external)

1. A real artist visits `/settings/payouts` on production, **picks their
   country**, and completes **live-mode** Stripe Express onboarding (real ID +
   bank verification).
2. **You** (or a real client) submit a booking; the artist approves and requests
   a small real deposit (e.g. EUR 20).
3. Pay with a **real card**. Verify:
   - the deposit lands in the artist's **live** Connect balance net of the fee;
   - Inklee's **platform balance** shows the application fee;
   - the artist's deposit form showed the correct "you receive" figure.
4. Optionally exercise a **real refund** from the booking detail and confirm the
   client is made whole and Inklee's fee is returned.

That first real deposit closes OT-12 and starts the first-artist soak
(roadmap §3.4).

---

## Rollback / panic button

There is no goods kill-switch to worry about anymore. If you need to stop
**in-app deposit collection** platform-wide in an emergency:

- **Per artist:** the artist can disconnect from their Stripe dashboard, or you
  can set their `stripe_account_status` to a non-active value in the DB — either
  makes `routeCharges` false, so new deposits fall back to manual (no money
  through Inklee).
- **Platform-wide:** removing the Stripe keys from Vercel prod disables all card
  processing (deposits revert to manual tracking); existing paid deposits and
  refunds are unaffected. Use only as a true emergency stop.

For an outright bad deploy, promote the previous good production deployment in
Vercel (Deployments → the prior build → ⋯ → Promote to Production) to revert
instantly without a rebuild.
