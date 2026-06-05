# Deferred Items

Things intentionally skipped and why. Revisit before launch.

## Upstash local dev credentials

**Blocked by:** no local credentials in `.env.local`  
**Affects:** Local parity for rate limiting during development only  
**State:** Production is already active in Vercel. Locally, `src/lib/ratelimit.ts` still skips rate limiting when the Upstash env vars are absent.

---

## Payment audit 2026-06-05 — deferred (Slice 80 Tier 2 + parked)

Not launch-blocking. Full context: `docs/payment-audit-2026-06-05.md` + `SLICES_CONTINUATION.md` Slice 80.

- **C-2 / P2-4 — column-scoped RLS for `stripe_*` profile columns.** Already mitigated (KYC never stored in our DB; no client-side `select("*")` on profiles; anon profiles SELECT dropped in migrations 0030/0031). Proper belt-and-braces fix = a column-scoped policy migration. **Founder-applied.**
- **M-3 / P2-3 — unify IP extraction for rate-limit keys.** Auth/booking limiters (login, forgot-password, download) still use the raw `x-forwarded-for` chain; route them through the shared `getClientIp()` (already used by KYC). Rate-limit-evasion hardening on auth endpoints.
- **P2-2 — rate-limit `submitConnectKycAction` + `requestDeposit`** (each amplifies to Stripe; all paths are authed + self-scoped, so low blast radius).
- **P2-1 — assert `event.account` on the `payment_intent.succeeded` webhook branch** (amount-check is the real backstop; defense-in-depth).
- **P2-5 — server-side minimum-deposit floor** in `requestDeposit` (UI enforces min=1; server only checks `>0`, so sub-~€0.17 yields a 0 fee).
- **Partial refunds + `deposit_refunded_at` column** — refund state is currently derived from `audit_log`; v1 is full-refund-only. Add when partial refunds are needed.
- **Custom "hold deposit until appointment date" payout timing** — deferred; reintroduces money-holding/safeguarding/PSD2 concerns. Standard payout schedule for now.
- **Goods commerce un-park** — `GOODS_COMMERCE_ENABLED` default OFF (D-c park-not-delete); F8/F13 dormant; goods-currency (UX-20) and goods checkout only matter if revived.

---

## Completed (no longer deferred)

- [x] **Supabase migration history normalization** - remote migration history repaired for `0000-0009`; `supabase db push --dry-run` now reports production up to date
- [x] **Upstash production activation** - Vercel production env includes `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`, so live rate limiting is configured
- [x] **Resend account + domain** - verified on inklee.app, emails sending in production
- [x] **Slice 6 - Booking emails** - all 5 templates wired, `/settings/templates` UI live
- [x] **Vercel deployment** - inklee.app live on Frankfurt region
- [x] **Supabase auth hook** - email confirmation sending via Resend
