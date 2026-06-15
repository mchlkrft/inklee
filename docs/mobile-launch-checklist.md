# Inklee mobile — launch checklist (founder)

**Owner:** Michel · **Branch:** `feat/mobile-e1` · **As of:** 2026-06-09 (HEAD `e887a15`)

This is the single source of truth for getting the iOS + Android app live. The
**code is done** — every artist feature is built, reviewed, and pushed. What
remains is almost all **founder / operational / legal**, plus one code task
(push delivery) that is *blocked* on the store accounts below.

> Companion docs: `docs/mobile-implementation-plan.md` (the slice plan),
> `project_inklee_mobile.md` (memory, per-slice state), `docs/payment-audit-2026-06-05.md`
> + the payment-feature memory (the deposit/Connect gates that the app shares).

---

## Where the build stands ✅

The Expo app (`apps/mobile`) covers the **whole artist surface**, all on
`origin/feat/mobile-e1`, all gates green (web tests 353 · web+mobile typecheck ·
lint · expo iOS bundle · husky `next build`):

- Auth (Apple + Google + password), first-run onboarding O0–O4
- Booking inbox + actions (approve / reject / cancel / deposit request / refund)
- Calendar, clients, notifications feed, editable settings
- Deposits + Stripe-Connect **KYC handoff** (magic-link in-app browser)
- Flash, guest-spots / travel, goods showcase, on-device **image upload**
- Analytics event taxonomy, **push token lifecycle + tap-to-route** (device side)
- In-app account deletion (counsel-ruled)

**Not yet done in code:** push **delivery** — the server→Expo (APNs/FCM) send
half. The device registers its token and routes a tapped notification; the
*sending* needs EAS push credentials, which need the store accounts. This is the
only remaining code task and it's gated on **T2** below.

**Reality check:** none of this has been run on a device since the SDK-54
sign-in confirmation. The device pass (**T1**) is the first thing to do.

---

## Founder action items (ordered by dependency)

### T1 · On-device bug sweep  ← do this first, no blockers
Install the dev build / run via Expo and walk the whole app on a real iPhone
**and** a real Android device. Collect a bug list (screen, what you did, what
happened). Everything below can proceed in parallel, but T1 gates the polish
pass and the store submission.
- [ ] iOS device pass → bug list
- [ ] Android device pass → bug list
- [ ] Hand the list back for a fix sweep

### T2 · Store developer accounts  ← unlocks push delivery + submission
- [ ] **Apple Developer Program** ($99/yr). Needs a D-U-N-S number for the org →
      that path wanted an **Estonian phone number**; resolve that first.
- [ ] **Google Play Developer** ($25 one-time).
- [ ] Bundle IDs are already set: `ee.inkl.app` (both platforms, in `app.json`).

### T3 · EAS push credentials  ← needs T2
- [ ] Apple: create the **APNs key** in the developer portal, add to EAS.
- [ ] Android: **FCM** server key / service account, add to EAS.
- [ ] Once present, the **push-delivery code task** can land (server reads
      `device_tokens`, sends via the Expo push API, wired into the
      notification-creation points — see "Next code session" below).

### T4 · Legal  ← parallel with T1–T3
- [ ] **DPIA** for the mobile app (data flows: Supabase auth, push tokens,
      analytics, Stripe KYC handoff).
- [ ] **Counsel review** of the app's data handling + the App/Play privacy
      disclosures (privacy nutrition labels / Data Safety form).
- [ ] Confirm the in-app account-deletion flow satisfies the store requirement
      (built) and the web GDPR-deletion gap is closed.

### T5 · Payment / deposit gates (shared with the web launch)
These live on the **`payment-stripe`** branch and gate *money*, not the app
shell. From the payment-feature memory + `docs/g2-sandbox-verification.md`:
- [ ] **G-2 remainder** (sandbox): client-cancel forfeit, client-cancel-unpaid,
      dashboard-refund reconcile, multi-currency non-EUR, manual/declined/reuse edges.
- [ ] **G-3 · unit economics decision** (D-d) — Custom €2/mo + payout fees make
      low-volume artists net-negative. **Biggest strategic blocker.** One-function
      change in `src/lib/platform-fee.ts` once decided.
- [ ] **G-4 · counsel sign-off** on the Stripe **Custom** model (+ subprocessors wording).
- [ ] **G-5 · Phase D live walkthrough** (founder-driven; re-covers deposit + fee + refund).
- [ ] Minor: **G2-F1** — deposit card shows "Due" after paid → should show "Paid".

### T6 · Release  ← needs T1 fixes + T2/T3 + T4 + branch convergence
- [ ] Converge **`feat/mobile-e1` ↔ `payment-stripe`** (the app needs the
      current deposit/Connect/fee logic; resolve before the release build).
- [ ] **Slice 12 release pack:** EAS build profiles, app icons + splash + store
      screenshots, store listings (name/desc/keywords), age rating, privacy labels.
- [ ] **TestFlight** (iOS) + **Play internal testing** (Android) → soak.
- [ ] Submit for review → release.

---

## Critical path (the short version)

```
T1 device pass ─┐
T2 accounts ────┼─> T3 EAS push creds ─> push-delivery code ─┐
T4 legal ───────┘                                            ├─> T6 release
T5 payment gates (G-3 decision is the strategic blocker) ────┘
   └─ needs T6 branch convergence (feat/mobile-e1 ↔ payment-stripe)
```

The two things only the founder can unblock and that everything waits on:
**T2 (store accounts)** and **T5/G-3 (the fee × subscription-tier decision)**.

---

## Next code session starts here

- Branch `feat/mobile-e1`, HEAD `e887a15`, clean + pushed. All gates green.
- **If T2/T3 are done →** build **push delivery**: a `apps/web/src/lib/server/push.ts`
  that loads `device_tokens` for an artist and POSTs to the Expo push API
  (`https://exp.host/--/api/v2/push/send`), then call it from the existing
  notification-creation points (e.g. `apps/web/src/lib/server/bookings.ts` —
  search where `notifications` rows are inserted). The device contract is already
  set: payload `data: { booking_id }` (or an allowlisted `path`) →
  `notificationTarget` routes the tap. Handle Expo "DeviceNotRegistered"
  receipts by deleting the stale token row.
- **Else →** apply the **T1 device-bug fixes**, or start the **T6 branch
  convergence** with `payment-stripe`.
- Standing workflow per change: build → 3–5-lens adversarial review → fixes →
  web tests + web/mobile typecheck + lint + expo bundle + husky `next build` →
  commit + push.
