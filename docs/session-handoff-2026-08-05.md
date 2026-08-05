# Session handoff — 2026-08-05

Prepared at the end of the 2026-08-04 go-live session. Read this first next
session. Everything below was verified by command against git / the prod DB /
Stripe / the live site during the session.

## What happened: CONSUMER PLUS SALES WENT LIVE (2026-08-04)

The full activation ladder ran and is verified. This is the first live revenue in
Inklee's history (0 paying customers before).

- **C1 counsel sign-off** (Terms + Privacy version 2026-08-04, hash-bound) — the
  one remaining counsel gate — CLEARED (`8c3b5be1`).
- **Migration 0156** (DSA §4 threshold) applied to prod. **Prod is at 0156.**
- **Ledger**: `terms_approved` re-bound to the 2026-08-04 hash, `privacy_notice_approved`
  created, `consumer_sales_launch_approved` recorded (the go-live decision key,
  through the guarded recorder), `consumer_refund_creditnote_tested` upgraded to
  LIVE evidence. **b2c gate 8/8 OPEN**, technical 4/4, b2b 7/7.
- **Capability unpark**: `DISABLED_CAPABILITIES` cleared in Vercel prod (was
  `custom_templates,analytics,entitlement_caps`), verified `[]` live. Grandfather
  invariant held (0 corrections).
- **Flip**: `PLUS_CONSUMER_LAUNCH_ENABLED = true` (`7bf3e1be`, deployed, verified
  live on inklee.app + inkl.ee). Vercel prod Stripe confirmed `sk_live`.
- **First live purchase verified end-to-end** (founder's own account
  `tattoo-artist`/`sub_1U0iBk…`, mode=live): purchase confirmation with the full
  Art. 8(7) set, withdrawal + real refund `re_3U0i9A…`, credit note present +
  consistent. Independently verified by a separate instance.

**`/pricing` fully live too**: flipped indexable, added to sitemap + IndexNow,
linked from the marketing nav (`pill-nav.tsx`) + footer (Company group). Executed
the founder-approved 2026-07-25 SEO proposal (`docs/seo/seo-implementation-log.md`).

## NEXT MILESTONE: app store submission (Android + Apple)

**Runbook: `docs/app-store-submission-runbook-2026-08-04.md`** (the SoT — follow
it top to bottom). App version is **0.3.0** (unbuilt; the last EAS build was
0.2.0(3), ~360 commits behind — no OTA, so a fresh build is required).

Pre-submission readiness audit (2026-08-04) verdict: **READY AFTER FIXES** —
IAP/steering CLEAN (no in-app purchase/checkout/upgrade/price/steering, per D17),
parity OK for submission (no blocking gaps, deploy alignment verified), build +
iOS submit config release-ready. **No code changes needed** — all remaining
blockers are founder console/asset work.

**Done:** phone screenshots · Play Console listing + full dashboard checklist ·
**demo/review account** (`tattoo-artist`, login `support@inklee.app`, seeded with
10 bookings + 10 waitlist entries across 5 cities, junk removed).

**Critical path to "in review":**
1. **Cut fresh 0.3.0 production builds** (both platforms) — Claude can run
   headless: `npx eas-cli build -p android/ios --profile production`.
2. **Android**: upload the 0.3.0 AAB (Play listing done → just the binary; first
   artifact binds `app.inklee`, accept Play App Signing) → send for review.
3. **iOS**: `eas submit -p ios --latest` (wired) → complete the App Store listing
   (Phase 6: App Privacy labels, age rating, Apple-size screenshots, copy from
   `mobile-store-assets.md §F`, demo account in review notes) → Submit for Review.
4. **DSA trader status** on both stores (Apple likely already cleared; verify).
5. **Real-iPhone sweep** (recommended pre-release — only tested on iPad in compat
   mode; notch/safe-area unvalidated).

## Open, tracked, non-blocking

- **Tax-snapshot follow-ups** (`findings.yaml`): `BILL-TAX-001` (no sale-side
  `kind='charge'` tax snapshot is written — known deferred b2b-tax workstream,
  `BDEL-TTS-001`; not a launch regression) and `BILL-TAX-002` (consumer credit
  note fell to `manual_review`/`vat=0`). Worth pulling forward before volume.
- **Founder TODOs**: Sentry alert rule for `BILL-CONF-001`; `#91` refund
  close-out (`ch_3U0H4fHkG0exykzF1tTcZvJZ` still unrefunded); `CRON-SEC-001`
  credential scope/rotate.
- **Separate future activations** (NOT done, deliberately): goods commerce
  (`GOODS_COMMERCE_ENABLED`), the goods fee-v2 (30-day advance-notice clock
  started when Terms published 2026-08-04 → earliest ~2026-09-03),
  deposit refund-policy v1.
- **Test coverage gaps** (logged by test-integrity, none blocking): a real-policy
  DB test for the gallery interim-suppression query; the `.tsx` gallery render
  wiring; `buildOrderReceiptBody` with `termsSection: null`.
- **Standing boundary** (⚖️): no beta artist takes real client money before the
  LO-10 deposit-fee round closes.

## Repo state at handoff
- master HEAD `1b6ca71a`, pushed. Prod deploy tracks master.
- Test suite GREEN (0 failed / 3664 passed at HEAD; +3 new tests this session).
- Prod DB at migration **0156**. Stripe LIVE. `PLUS_CONSUMER_LAUNCH_ENABLED=true`.
- New this session: email-change bug fixed for all users (`AUTH-EML-001`,
  `4833b923`, tested + verified).
