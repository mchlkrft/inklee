# G-2 — Sandbox money-path verification (Stripe test mode)

The deposit feature's code is complete (Slice 79/79d + Slice 80 audit fixes) but has **never run against a real Stripe charge**. This is the joint founder + Claude session that verifies every money path end-to-end in **test mode** before any live deposit. Founder drives the browser + Stripe dashboard; Claude observes + checks the DB/code.

**Test cards:** success `4242 4242 4242 4242` · declined `4000 0000 0000 0002` · any future expiry, any CVC, any postcode.

Tick each box as it passes. If a step fails, stop and capture the symptom — don't push past a money bug.

---

## Phase 0 — Preflight (environment ready)

- [x] **0.1** `.env.local` has test keys (`pk_test_`/`sk_test_`) — confirmed.
- [x] **0.2** Migration **0044** applied via Supabase SQL Editor (drizzle journal only tracks 0000, so `db:migrate` is NOT the mechanism — used the SQL Editor with `ADD COLUMN IF NOT EXISTS`). `deposit_currency` confirmed (one row).
- [x] **0.3** Connect enabled in the Stripe **test** sandbox ("Inklee OÜ"). For LOCAL testing, `stripe listen` forwards all events, so no dashboard endpoint config needed.
- [x] **0.4** `pnpm dev` running (started in background; localhost:3000 serving HTTP 200).
- [x] **0.5** `stripe listen` running; its `whsec_…` already matched `STRIPE_WEBHOOK_SECRET` in `.env.local`.

## Phase 1 — Connect onboarding (in-app KYC, no Stripe redirect)

- [x] **1.1** Tester artist (ouchy) `/settings/payouts` → status "Not connected", in-app KYC form present, no redirect. ✅ 2026-06-05
- [x] **1.2** KYC form filled (DE, test individual, IBAN DE89…) and submitted. ✅
- [x] **1.3** No redirect; status went straight to **Connected / verified** — Charges enabled: Yes, Payouts enabled: Yes, Country DE, synced live from Stripe. ✅
- [ ] **1.4** (optional) Stripe dashboard → Connect → confirm the account is **Custom** + `fees.payer: application`. (In-app status already reflects Stripe's charges_enabled=true.)

## Phase 2 — EUR deposit happy path (THE core split)

- [x] **2.1** Booking created via public page (testclient → ouchy), deposit of **€200** requested directly from pending. ✅ 2026-06-05
- [x] **2.2** Deposit policy + EUR 200.00 shown to client; "Inklee adds no fee for you" disclosure present. (Artist-side fee preview not separately screenshotted; split verified authoritatively below.)
- [x] **2.3** Customer pay page showed the **test-mode banner** (P0-4) + EUR 200.00; paid with `4242…` → "Payment received". ✅
- [x] **2.4** ✅ Booking flipped to **Accepted**; "Deposit paid" in the timeline; Refund + Cancel buttons appeared; notification count rose. **Root cause of initial miss:** `stripe listen` was running WITHOUT `--forward-to`, so events never reached the app — a test-setup issue, NOT a code bug. Fixed by starting `stripe listen --forward-to localhost:3000/api/stripe/webhook`; real event re-delivered with a valid signature → webhook 200, booking flipped. **Runbook note for G-5/deploy: the deployed webhook endpoint must be configured in the Stripe dashboard (this local-only gap doesn't apply in prod, but verify the prod endpoint + events).**

### Findings during G-2 (batch-fix after the live run)

- **G2-F1 [UI]** The DEPOSIT card on the booking detail page shows the amount + "Due <date>" even after the deposit is **paid** — it should show a clear "Paid" state and drop/replace the due-date line once `deposit_paid_at` is set. Surface: `src/app/(artist)/bookings/requests/[id]/page.tsx` deposit card.
- [x] **2.5** ✅ VERIFIED via Stripe API: charge `amount` 20000 eur, `application_fee_amount` **600 (€6)**, `on_behalf_of` + `destination` = artist `acct_1TepeQHRzRukdnOm`; **artist connected balance €194.00 pending**, **platform application fee €6.00 collected**. The full-3% Custom model is correct end-to-end.

## Phase 3 — Multi-currency (non-EUR artist)

- [ ] **3.1** Onboard a second test artist with a non-EUR country (e.g. **GB** → gbp).
- [ ] **3.2** Request a deposit. `deposit_currency` = gbp; the intent is created in **gbp**; the fee preview, pay page, and emails all render in **GBP**.
- [ ] **3.3** Pay; confirm the split lands in gbp on the connected account (no FX at payout).

## Phase 4 — Refunds & cancellation (D-f / P0-2 + P1-1, the new work)

- [x] **4.1 Artist-cancel a PAID booking** ✅ VERIFIED 2026-06-05. Cancel booking → confirm → Stripe: refund €200 succeeded, charge refunded:true, **application fee €6 refunded**, artist connected balance reversed to €0. Exercises P0-2 artist-cancel + RS-6 refund engine + P1-1 charge.refunded.
- [x] **4.2 Client-cancel a PAID booking** ✅ VERIFIED 2026-06-05 (session 2). Forfeit warning shown; on confirm: booking cancelled, `customer_cancelled` + `deposit_forfeited` audit rows, Stripe charge `refunded=false` (artist keeps the deposit). Asymmetric D-f direction proven (opposite of 4.1). Also re-confirmed the Slice 81 entitlement gate end-to-end (comped ouchy got the card flow + €6 fee).
- [x] **4.3 Client-cancel an UNPAID `deposit_pending` booking** ✅ VERIFIED 2026-06-05 (session 2). Client cancelled before paying → booking cancelled, deposit never paid, and the live PaymentIntent (`pi_3TevmA…`) is now `canceled` in Stripe — the magic link can no longer charge a dead booking. No orphaned charge.
- [ ] **4.4 Dashboard-refund reconciliation (P1-1)** → refund a paid deposit from the **Stripe dashboard** → `charge.refunded` webhook → detail page shows "Refunded" and the in-app refund button is gone (no double-refund possible).

## Phase 5 — Manual fallback + edges

- [ ] **5.1 Un-connected artist** requests a deposit → **no** PaymentIntent created; portal shows the manual "deposit requested" panel (no card form); artist marks it received manually → booking approved.
- [ ] **5.2 F7 race** → in-app deposit, artist marks received manually while the intent is live → intent canceled, client can't be double-charged.
- [ ] **5.3 payment_failed** → pay with declined card `4000…0002` → `deposit_payment_failed` audit row; booking stays `deposit_pending`.
- [ ] **5.4 Reuse / disconnect (P1-6)** → request a card deposit, then deauthorize the Connect account in Stripe, then re-request the deposit → the dead intent is canceled and the booking converts to a **manual** deposit (no broken card form).

---

## Session 1 — 2026-06-05 (paused, resume here next time)

**Verified PASS (core money path proven against real Stripe test data):**

- ✅ Phase 0 preflight (migration 0044 applied via Supabase SQL Editor; app + forwarder up)
- ✅ Phase 1 — in-app Custom KYC onboarding: artist went Not connected → **Connected/verified, charges+payouts enabled, no Stripe redirect**
- ✅ Phase 2 — EUR €200 deposit: customer paid exactly €200; **split verified via Stripe API: application_fee €6 (full 3%), on_behalf_of+destination=artist (MoR), artist net €194 pending, platform fee €6 collected**; webhook flipped the booking to Accepted + "Deposit paid" timeline + notification
- ✅ Phase 4.1 — artist Cancel booking → **auto-refund verified: refund €200 succeeded, application fee €6 refunded, artist balance reversed to €0**

**Not yet done (resume here):**

- ⏳ **4.2 client-cancel forfeit** — was set up but not confirmed; client cancels a PAID booking → deposit kept by artist (no refund) + forfeit warning + `deposit_forfeited` audit row. (Server action, does NOT need the webhook.)
- ⏳ **4.3 client cancels an unpaid deposit** → live intent canceled. (Server action, no webhook.)
- ⏳ **4.4 dashboard-refund reconciliation (P1-1)** → refund from Stripe dashboard → app shows Refunded. (Needs a webhook event — replay it, see below.)
- ⏳ **Phase 3 multi-currency** (non-EUR artist) and **Phase 5** (manual fallback, declined card `4000…0002`, reuse/disconnect).

**Findings captured:**

- **G2-F1 [UI, batch-fix]** deposit card shows "Due <date>" even after paid → should show a "Paid" state. Surface: `bookings/requests/[id]/page.tsx`.

**Operational gotcha (NOT a code bug) — local webhook tunnel is flaky:**

- The local `stripe listen` CLI tunnel repeatedly drops its websocket in the background, so deposit payments don't always auto-flip _locally_. The webhook code is correct (it flipped both bookings when the event arrived). In production this doesn't apply — the deployed endpoint is a real URL Stripe calls directly.
- **To resume / nudge a stuck local payment:** ensure `pnpm dev` + `stripe listen --forward-to localhost:3000/api/stripe/webhook` are running. To force-deliver a specific paid booking's event, re-create the tiny replay script (fetch the `payment_intent.succeeded` event for the booking_id from the Stripe API, HMAC-sign `t.rawbody` with `STRIPE_WEBHOOK_SECRET`, POST to `/api/stripe/webhook`). This was used twice this session and worked reliably.
- **G-5/deploy:** confirm the PROD webhook endpoint + events (`payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, `account.updated`, `account.application.deauthorized`) are configured in the live Stripe dashboard.

## Sign-off

- [~] **G-2 CORE verified 2026-06-05** (onboarding + deposit split + webhook flip + artist-cancel refund). Edge paths (4.2–4.4, Phase 3, Phase 5) pending a follow-up session.
- Remaining launch gates after G-2: **G-3** (D-d economics), **G-4** (counsel sign-off, incl. the subprocessors "Express→Custom" wording bump), **G-5** (Phase D live walkthrough).
