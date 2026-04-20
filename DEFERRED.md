# Deferred Items

Things intentionally skipped and why. Revisit before launch.

## Upstash local dev credentials

**Blocked by:** no local credentials in `.env.local`  
**Affects:** Local parity for rate limiting during development only  
**State:** Production is already active in Vercel. Locally, `src/lib/ratelimit.ts` still skips rate limiting when the Upstash env vars are absent.

---

## Completed (no longer deferred)

- [x] **Supabase migration history normalization** - remote migration history repaired for `0000-0009`; `supabase db push --dry-run` now reports production up to date
- [x] **Upstash production activation** - Vercel production env includes `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`, so live rate limiting is configured
- [x] **Resend account + domain** - verified on inklee.app, emails sending in production
- [x] **Slice 6 - Booking emails** - all 5 templates wired, `/settings/templates` UI live
- [x] **Vercel deployment** - inklee.app live on Frankfurt region
- [x] **Supabase auth hook** - email confirmation sending via Resend
