# Deferred Items

Things intentionally skipped and why. Revisit before launch.

## Resend account + domain (inklee.app)

**Blocked by:** no account or domain yet  
**Affects:** Slice 6 (booking emails), auth confirmation emails  
**State:** Code is in place (`src/lib/email/`, `src/app/api/auth/email-hook/`). Just needs `RESEND_API_KEY` + DNS records + Supabase hook registration.  
**Workaround:** Email confirmation disabled in Supabase. Auth works without it.

## Slice 6 — Booking email system

**Blocked by:** Resend  
**What's missing:** Customer confirmation on submit, approval/rejection emails, artist notification on new request, `/settings/templates` UI.  
**State:** Console.log placeholders exist in all status-transition server actions.

## Upstash Redis (rate limiting)

**Blocked by:** no credentials yet  
**Affects:** Booking form rate limit (5 req/hour per IP)  
**State:** `src/lib/ratelimit.ts` gracefully skips if env vars are absent. Add `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` to activate.
