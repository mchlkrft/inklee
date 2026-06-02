# OT-12 Stripe Connect — rollout runbook

Operational checklist for moving OT-12 from "shipped in code" to "real artist takes real money". Three phases:

1. **Local test-mode QA** — verify the wiring end-to-end without touching prod.
2. **Vercel env-var flip** — turn on prod goods checkout.
3. **First real artist** — onboard, transact, soak.

Total time for Phases 1–2 (the part you can do solo today): ~25 minutes including Stripe Dashboard clicks. Phase 3 is external (needs a real human artist).

---

## Phase 0: Preflight

Before any QA, complete these one-time setup steps:

- [ ] **Migration 0039 applied** to your Supabase project. SQL is in `supabase/migrations/0039_stripe_connect.sql` — paste into Supabase SQL Editor and run. To verify, in SQL Editor run:

  ```sql
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'profiles' AND column_name LIKE 'stripe_%';
  ```

  You should see 6 rows: `stripe_account_id`, `stripe_account_status`, `stripe_charges_enabled`, `stripe_payouts_enabled`, `stripe_account_country`, `stripe_account_updated_at`.

- [ ] **Connect events enabled** on your Stripe **test-mode** webhook endpoint. Stripe Dashboard → toggle to **Test mode** (top right) → Developers → Webhooks → click the endpoint that's already configured for `/api/stripe/webhook` (or the CLI endpoint if you use `stripe listen`). "Listen to events" → add:
  - `account.updated`
  - `account.application.deauthorized`
  - (Existing `payment_intent.succeeded` stays.)
  - Save.

- [ ] **`.env.local` has Stripe TEST keys.**

  ```
  STRIPE_SECRET_KEY=sk_test_...
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
  STRIPE_WEBHOOK_SECRET=whsec_...   (the test-mode secret)
  NEXT_PUBLIC_APP_URL=http://localhost:3000
  ```

  If you've been using `stripe listen --forward-to localhost:3000/api/stripe/webhook`, the `whsec_...` it printed is your `STRIPE_WEBHOOK_SECRET`.

- [ ] **Two terminals open:**
  - Terminal A: `pnpm dev` (Next.js server on :3000)
  - Terminal B: `stripe listen --forward-to localhost:3000/api/stripe/webhook` (forwards webhook events from Stripe to your local server)

If any of these is unclear or fails, stop and tell me — I'll diagnose before you waste time on the QA.

---

## Phase 1: Local test-mode E2E QA (~15 minutes)

Use a **dedicated test artist account** (e.g. a fresh signup, or your existing test account — NOT your founder/admin account). All references below assume you're signed in as that test artist.

### Test 1: Connect onboarding round-trip

- [ ] Navigate to `http://localhost:3000/settings/payouts`. Status badge reads **"Not connected"** in muted gray.
- [ ] Click **"Connect Stripe"** → browser redirects to `https://connect.stripe.com/express/onboarding/...`.
- [ ] Fill the form with Stripe's test data:
  - Business type: **Individual** (or whatever; doesn't matter for the test)
  - SSN: **000-00-0000** (Stripe test value, instantly accepted)
  - DOB: **01/01/1901**
  - Phone: any number (e.g. **+1 000-000-0000**)
  - Bank account: routing **110000000**, account **000123456789**
  - Click through any extra screens with whatever sample data
- [ ] Submit. Stripe redirects to `http://localhost:3000/settings/payouts/return`.
- [ ] You're bounced back to `/settings/payouts`. Status badge now reads **"Connected"** (mustard or green).
- [ ] Page shows: account id `acct_...`, country (`US` for the test data above), Charges enabled: **Yes**, Payouts enabled: **Yes**, Last synced: just now.
- [ ] **Verify in DB** (Supabase SQL editor): `SELECT id, stripe_account_id, stripe_account_status, stripe_charges_enabled FROM profiles WHERE id = '<your-test-artist-id>';`
  - Expect: `stripe_account_status='active'`, `stripe_charges_enabled=true`.
- [ ] **Verify webhook fired** in Terminal B: you should see something like `account.updated [evt_...] -> 200`.

### Test 2: Deposit request → Connect-routed PaymentIntent

- [ ] In a separate browser (or incognito), submit a new booking via the public form for your test artist's slug.
- [ ] Back in the artist dashboard, open the booking at `/bookings/requests/[id]`.
- [ ] Click **"Request deposit"** → fill in EUR **50**, due date 7 days out, no note. Submit.
- [ ] **Verify the audit_log entry** (Supabase SQL):
  ```sql
  SELECT details FROM audit_log
  WHERE booking_id = '<the-booking-id>' AND action = 'status_changed'
  ORDER BY timestamp DESC LIMIT 1;
  ```

  - Expect `details.stripe_connect_routed = true`.
- [ ] **Verify the PaymentIntent shape** in the Stripe Dashboard (Test mode → Payments → most recent):
  - "On behalf of" shows your test artist's connected account name.
  - The intent's "Transfer data" → destination = `acct_...` (matches the artist's id).
  - Amount = `5000` cents (EUR 50.00).

### Test 3: Customer pays deposit → money lands on Connect

- [ ] Open the customer's magic link (from the email — check Terminal A for the dev email log, or copy from the booking row's hash).
- [ ] On the customer portal, pay with **`4242 4242 4242 4242`**, any future expiry, any CVC, any postcode.
- [ ] After confirmation, the booking flips to **approved** in the artist dashboard.
- [ ] **Verify in Terminal B**: `payment_intent.succeeded [evt_...] -> 200`.
- [ ] **Verify in the artist's Stripe Connect account** (Stripe Dashboard → toggle to Test mode → Connect → Accounts → click your test artist → Balance):
  - Pending balance shows the EUR 50 transfer (minus Stripe's small platform fee — usually 0 in test mode unless application_fee was set).
- [ ] **Verify the booking_requests row**:
  ```sql
  SELECT status, deposit_paid_at FROM booking_requests WHERE id = '<id>';
  ```

  - `status='approved'`, `deposit_paid_at` is recent.

### Test 4: Goods checkout end-to-end

- [ ] On the artist dashboard, navigate to `/goods` → pick a product → ensure "Offer as an add-on when a client pays their deposit" is **checked** (the `is_checkout_addon` flag).
- [ ] On the public booking form (incognito), submit a new booking, and in the shop overlay add 1 of that product to the cart.
- [ ] Back as artist: approve the booking. The popup appears with the goods item; confirm it as **available**.
- [ ] Request a deposit (EUR 50).
- [ ] On the customer portal:
  - You should see the goods row under "You marked interest in these".
  - Set qty to 1.
  - Total reflects EUR 50 + the product price.
- [ ] Pay with `4242`.
- [ ] **Verify Stripe**: the new PaymentIntent in the dashboard has the higher amount AND `on_behalf_of` set.
- [ ] **Verify orders + order_items rows**:
  ```sql
  SELECT id, status, subtotal_amount, fulfillment_status
  FROM orders WHERE booking_id = '<id>';
  SELECT type, title_snapshot, quantity, total_amount
  FROM order_items WHERE order_id = '<order-id>';
  ```

  - Expect `status='paid'`, `fulfillment_status='pending_pickup'`, one `type=deposit` and one `type=product` line.
- [ ] **Verify goods inventory decremented**: variant stock dropped by 1 (or product quantity dropped by 1).
- [ ] **Verify the goods order confirmation email** in Terminal A's dev log.

### Test 5: Disconnect handling

- [ ] In Stripe Dashboard → Connect → Accounts → your test artist → Settings → scroll to "Disconnect" → confirm.
- [ ] **In Terminal B**: `account.application.deauthorized [evt_...] -> 200`.
- [ ] Refresh `/settings/payouts` in the artist dashboard. Status badge should now read **"Not connected"**.
- [ ] **Verify DB**: `stripe_account_status='unset'`, `stripe_charges_enabled=false`, `stripe_payouts_enabled=false`, BUT `stripe_account_id` is still set (we keep it for booking history).
- [ ] Submit a new booking and try to go to deposit checkout. The customer portal should show deposit-only (no goods rows), because `getAddonProducts` returns empty for non-connected artists.
- [ ] Click "Connect Stripe" again → flows back through onboarding (uses the same `stripe_account_id`) → status flips back to connected after submit.

### Test 6: Un-connected artist (negative)

- [ ] Sign in as a DIFFERENT artist (one who has never connected Stripe).
- [ ] Visit `/settings/payouts` → status reads "Not connected".
- [ ] Create a booking and request a deposit.
- [ ] **Verify audit_log**: `details.stripe_connect_routed = false`.
- [ ] **Verify the PaymentIntent in Stripe Dashboard**: NO `on_behalf_of`, NO `transfer_data`. Money lands in the platform balance (existing pre-OT-12 behavior).
- [ ] Customer pays normally. All status flips happen as before.

---

## Phase 1 done → green-light Phase 2

If everything in Phase 1 passed, the wiring is correct. Phase 2 is just flipping the production gate.

If anything in Phase 1 failed or behaved unexpectedly, stop and triage — don't move to Phase 2.

---

## Phase 2: Vercel production env flip (~5 minutes)

This is the moment goods checkout actually becomes possible in production. The env var was deliberately added in the audit-fix sweep as a kill switch so this flip is explicit, not a side effect of a code change.

### Step A: Add the env var in Vercel

1. Open **https://vercel.com/mchlkrfts-projects/inklee** in your browser.
2. Click the **Settings** tab at the top.
3. In the left sidebar, click **Environment Variables**.
4. Click the **Add New** button (or "Save" form at the top).
5. Fill in:
   - **Key**: `CHECKOUT_ADDONS_PROD_READY`
   - **Value**: `true` (lowercase, no quotes)
   - **Environments**: check **Production** only. Leave Preview and Development unchecked — non-prod environments don't need this flag (the code's `NODE_ENV !== "production"` branch covers them).
6. Click **Save**.

### Step B: Trigger a redeploy

Env var changes only take effect on the NEXT deployment — your current production deployment was built without it.

1. Stay in the Vercel dashboard. Click the **Deployments** tab at the top.
2. Find the latest deployment with the **Production** tag (it'll be the one aliased to inkl.ee — currently `5df82f3` or later).
3. Click the **⋯** (three dots) menu on the right of that row.
4. Click **Redeploy**.
5. A modal appears. Leave **"Use existing Build Cache"** checked (faster, same code) and click **Redeploy** to confirm.
6. Wait ~2–3 minutes for the new deployment to go green.

### Step C: Verify the env var landed

1. Once the redeploy is "Ready", open `https://inkl.ee/<a-test-artist-with-active-connect-and-an-addon-product>`.
2. Submit a booking, mark the addon product as interest, approve it as artist, request a deposit.
3. The customer portal should now show the goods row. Before the env-var flip, it would have shown deposit-only even for fully-onboarded artists.

If goods rows still don't appear, double-check:

- The artist's profile has `stripe_account_status='active'` AND `stripe_charges_enabled=true` (Phase 1 verifies this in test mode — they need to repeat onboarding in **live** mode).
- The product has `is_checkout_addon=true` AND `is_public_visible=true` AND `currency='eur'`.
- The artist's `profiles.settings.features.checkout_addons` defaults to `true` (which it does for everyone unless explicitly set false).

---

## Phase 3: First real artist (external)

After Phase 2, the system is _capable_ of taking real goods money — but no real artist is connected yet (their Phase 1 testing was in **test mode** Stripe). For a real-money transaction:

1. **Stripe keys**: confirm production env has live keys (`sk_live_...`, `pk_live_...`, the **live-mode** webhook secret). Per the legal-package memory you've been live for deposits since 2026-05-22, so this is likely already true. If not, swap in the live keys and redeploy.
2. **Webhook (live mode)**: in the Stripe Dashboard, toggle to **Live mode** (top right), Developers → Webhooks → the endpoint pointing at production `/api/stripe/webhook`. Confirm it listens to:
   - `payment_intent.succeeded` (already there)
   - `account.updated` (add it)
   - `account.application.deauthorized` (add it)
3. **First real artist** signs up (or uses their existing account), visits `/settings/payouts` on production, and goes through **live-mode** Stripe Express onboarding — this requires real ID, real bank details, real verification.
4. They list a real goods product, ideally something cheap (EUR 5 sticker pack).
5. **You** (or another real client) submit a booking, the artist approves, requests deposit, **you pay with a real card** for the deposit + the sticker.
6. Verify the money lands in the artist's live Stripe balance after the standard payout delay.

That transaction is what closes OT-12 and starts the first-artist soak (§3.4 in roadmap).

---

## Rollback / panic button

If anything goes wrong in Phase 2 after the env-var flip and you need to disable goods checkout in prod immediately:

1. Vercel → Settings → Environment Variables → find `CHECKOUT_ADDONS_PROD_READY`.
2. Change value from `true` to `false` (or delete the variable entirely).
3. Trigger a redeploy.

Within ~2 minutes, `getAddonProducts` returns empty for every artist in prod and goods checkout silently disappears from every customer portal. Existing deposits are unaffected.

For an even faster panic stop: in the Vercel dashboard, navigate to the older "good" production deployment (the one before Phase 2's redeploy) → **⋯** → **Promote to Production**. This instantly aliases inkl.ee back to the pre-flip build without waiting for any new build.
