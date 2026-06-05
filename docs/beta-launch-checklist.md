# Inklee private beta — launch checklist

**Goal:** put the deposit feature in front of a small, hand-picked group of real artists, privately (no public campaign), with Inklee comping their access + fees. Built on the Slice 80/81 work + the G-2-verified money path.

**Format:** ordered phases. Each item is **F** (founder action), **C** (Claude can do), or **J** (joint). Don't skip Phase B — it gates real money.

**Supersedes** the deposit-cutover parts of `docs/ot-12-rollout-runbook.md` (which predates Slice 79/81).

---

## Phase A — Pre-flight (code + data ready)

- [ ] **A1 (C)** Confirm `payment-stripe` is green: `pnpm typecheck` + `pnpm test` + `pnpm lint`, and the branch is pushed to origin.
- [ ] **A2 (F)** Confirm prod Supabase has migrations **0044** (deposit_currency) + **0045** (account_overrides) applied. _(Already applied 2026-06-05 since dev points at the prod DB — just confirm.)_
- [ ] **A3 (C/F)** Decide the deploy path: merge `payment-stripe` → main (auto-deploy) **or** `vercel --prod` from the branch. Recommend a PR merge so prod history is clean.
- [ ] **A4 (F)** Confirm `GOODS_COMMERCE_ENABLED` is unset/false in prod (goods stay showcase-only).

## Phase B — Legal gate (G-4) — ⚠️ DECISION POINT before real money

- [ ] **B1 (F)** Counsel sign-off on the **Custom Connect** deposit model (the 8 questions in `docs/payment-flow-for-counsel.md`): artist-as-merchant-of-record with an `application_fee`, PSD2/intermediary status, fee VAT, forfeiture enforceability. LO-2 was cleared for the older Express framing, not Custom.
- [ ] **B2 (C)** Fix the live `/subprocessors` (+ `/terms` §12) "Express" → "Custom" wording (P1-4) with a version bump + new snapshot. Do this with/after B1 so counsel reviews the final text.
- [ ] **Decision:** if counsel isn't ready, you can still launch the beta with the **free features** (booking/bio/flash/guest-spots) and keep **deposits off** (don't comp the `deposits` entitlement) until B1 clears. Deposits = real money = needs B1.

## Phase C — Stripe LIVE setup (the big one; live mode is separate from the sandbox)

- [ ] **C1 (F)** Switch the Stripe dashboard to **Live mode**. Complete the platform business profile (Inklee OÜ) if prompted.
- [ ] **C2 (F)** Enable **Connect** + **Custom accounts** in **live mode** (sandbox settings do NOT carry over). Confirm the controller/loss-liability settings match the sandbox (Inklee pays Stripe fee; `fees.payer: application`).
- [ ] **C3 (F)** Create a **live webhook endpoint** → `https://inklee.app/api/stripe/webhook` with events: `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, `account.updated`, `account.application.deauthorized`. Copy its **signing secret**.
- [ ] **C4 (F)** In Vercel **Production** env, set the live values:
  - `STRIPE_SECRET_KEY` = `sk_live_…`
  - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` = `pk_live_…`
  - `STRIPE_WEBHOOK_SECRET` = the C3 signing secret (live)
  - confirm `NEXT_PUBLIC_APP_URL`, Supabase, `SUPABASE_SERVICE_ROLE_KEY`, Resend, Upstash, `ADMIN_EMAILS` are all set in prod.
  - _(Once live keys are in, the in-app test-mode banner auto-disappears — that's the detectStripeMode check working.)_

## Phase D — Deploy

- [ ] **D1 (F/C)** Deploy per A3. Watch the build (husky/Vercel) go green.
- [ ] **D2 (C/F)** Smoke-test prod: `/login`, `/ouchy` (a public page), `/admin`, `/settings/payouts`, `/bookings/deposits` all load; legal pages render.

## Phase E — Live money smoke test (ONE small real charge)

The prod webhook is a real URL (no flaky CLI tunnel), so this is the true end-to-end check.

- [ ] **E1 (F)** Onboard a **real** Connect account in live (your own / first tester) via `/settings/payouts` — real name/DOB/address/**real IBAN**. Confirm it reaches Connected.
- [ ] **E2 (J)** Comp that account to Plus (Phase F) so deposits are enabled, then request a **small real deposit** (e.g. €1–5) and pay it with a **real card**.
- [ ] **E3 (C)** Verify via Stripe API: charge paid, `application_fee` = 3%, `on_behalf_of`/`destination` = artist, booking flipped to Accepted (webhook fired from the live endpoint), notification + emails sent.
- [ ] **E4 (J)** **Refund** that test deposit (artist-cancel or the refund button) → confirm money returns. Then you've proven the live rail.

## Phase F — Comp the beta testers (private, per-artist)

For each invited artist (after they sign up):

- [ ] **F1 (F)** `/admin/accounts/<id>` → **Plan → Plus / Comp**, optional **expiry** (e.g. 3 months).
- [ ] **F2 (F)** (optional) **Sponsor deposit fees** → set a **spend cap** (your marketing budget per tester) + expiry. Leave off if testers should pay the normal 3%.
- [ ] **F3 (F)** Add an **admin note** (who they are, invite date). Every grant is audit-logged automatically.
- [ ] _(Bulk option: comp via SQL `INSERT INTO account_overrides … ON CONFLICT …` as used for `ouchy`.)_

## Phase G — Beta operations + success criteria

- [ ] **G1 (F)** Keep it **private** — direct invites only, no `/pricing`, no public announcement (Slice 82 paid billing isn't built; everyone is comped).
- [ ] **G2 (F)** Monitor: Sentry (errors), `/admin` (roster + usage), Stripe live dashboard (charges/refunds/disputes), Resend (email deliverability — verify SPF/DKIM/DMARC).
- [ ] **G3 (F)** Watch sponsorship spend vs caps in the admin panel.
- [ ] **G4 — success gate (roadmap §3.4):** ≥1 real artist using it daily for **4 weeks**, no critical bugs in the last 14 days, deposits + refunds clean. That closes Business Model Phase 1 and unblocks Slice 82 (paid billing → open to paying artists).

## Rollback (if a money bug appears)

- [ ] **R1 (F)** Fastest: in `/admin`, **revoke** the comp / `deposits` entitlement for affected artists → they fall back to manual deposits (no card path) without a redeploy.
- [ ] **R2 (F)** Broader: revert prod to the previous deploy in Vercel. Env (live keys) can stay.
- [ ] **R3** Stripe live keys can be rotated from the dashboard if ever exposed.

---

## Snapshot of what's already done (so the above starts from the right place)

- Slice 80 (audit remediation) + Slice 81 (admin entitlements + fee sponsorship) shipped on `payment-stripe`.
- Migrations 0044 + 0045 applied to prod Supabase.
- G-1 done; **G-2 money path verified working** in sandbox (`docs/g2-sandbox-verification.md`); **G-3 economics decided** (deposits behind Solo Plus, €24/yr first-year, keep 3% — `DECISIONS.md` D-d / `business-model.md`).
- Open: **G-4 counsel** (Phase B), Stripe **live** setup (Phase C), deploy (Phase D), Slice 82 paid billing (only needed to open to _paying_ artists — after the comped beta).
- Low-risk backlog (not beta-blocking): G2-F1 deposit-card "Paid" state; postponed G-2 edges 4.4 / Phase 3 / Phase 5.
