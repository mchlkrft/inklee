# Paid plan upgrade triggers

Running tally of capabilities gated behind paid tiers on Supabase and Vercel. As reasons accumulate, revisit whether the ROI justifies upgrading.

Each entry: **what** + **why it matters** + **how we're working around it now** + **date discovered**.

---

## Supabase — currently on Free

### Hard triggers (already hitting the limit)

- **Leaked password protection (HIBP) — Pro only.** Security Advisor flags this as a warning; the toggle is hidden behind Pro. Without it, signups can use passwords from public breach lists. Workaround: nothing — the warning will keep flagging on the dashboard. _Discovered 2026-05-10._

### Soft triggers (good-to-haves, no incident yet)

- **PITR window extension.** Free = 7 days, Pro = 30 days. Documented in `RUNBOOK.md` Slice 40 as a recovery limit. Bigger window = more breathing room before backup-restore stops being possible.
- **Daily backups → continuous PITR.** Free has daily backups; Pro has minute-granularity PITR. Worth it once real artist data exists and a 24h loss window becomes meaningful.
- **Log retention.** Free = 1 day of logs, Pro = 7 days. Currently fine because traffic is low; will be a debugging blocker when something happens 25 hours after the user notices.
- **Bandwidth + storage caps.** Free: 5GB egress / 1GB storage. Plenty for now. Will become a real trigger once a few artists with reference photos are on the platform.

---

## Vercel — currently on Hobby

### Hard triggers (already working around)

- **~4.5 MB request body cap.** Mobile photos easily exceed this. Working around with browser-side image compression in `src/lib/image-compress.ts` before public booking-form submission. Compression is fine but adds CPU work, image-quality risk, and is one more thing that can break. Pro raises the cap. _Discovered during Slice 32 hardening._
- **Function timeout ceiling 60s.** Used `export const maxDuration = 60` for the Instagram sync route. No headroom — a slow Instagram CDN minute could clip the sync. Pro raises to 300s default. _Discovered 2026-05-10 during Instagram thumbnail caching._

### Soft triggers (good-to-haves)

- **Cron job count + frequency.** Hobby is limited; Pro lifts the cap. We have several scheduled tasks (reminders, deposit reconciliation, cleanup) — fine for now but room is finite.
- **Team / collaboration features.** N/A while solo, becomes a trigger when anyone joins.
- **Speed Insights / Analytics on prod.** Hobby gives a slice; Pro gives the full picture. Plausible already covers the user-side analytics, so this is low priority.
- **Higher build minutes.** Not yet a constraint. Worth watching as the project grows.

---

## When to actually upgrade

Don't upgrade because the list is long — upgrade when one specific item starts blocking real work or putting real artists at risk. Re-read this list before the public launch and again after the first real artist signs up. Most "soft" items will likely turn into "hard" triggers in that window.

Today's count (2026-05-10): 1 hard Supabase trigger (HIBP), 2 hard Vercel triggers (body cap workaround, function timeout headroom). The body-cap workaround is shipped and stable, so the only items currently producing recurring friction are HIBP (a dashboard warning) and the timeout headroom (theoretical but not biting yet). **Not urgent enough to upgrade today.** Revisit before public launch.
