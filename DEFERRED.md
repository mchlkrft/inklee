# Deferred Items

Things intentionally skipped and why. Revisit before launch.

## Upstash rate limiting

**Blocked by:** no credentials yet  
**Affects:** Booking form rate limit (5 req/hour per IP)  
**State:** `src/lib/ratelimit.ts` gracefully skips if env vars are absent. Add `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` to Vercel production env vars to activate.

---

## Completed (no longer deferred)

- ✅ **Resend account + domain** — verified on inklee.app, emails sending in production
- ✅ **Slice 6 — Booking emails** — all 5 templates wired, `/settings/templates` UI live
- ✅ **Vercel deployment** — inklee.app live on Frankfurt region
- ✅ **Supabase auth hook** — email confirmation sending via Resend
