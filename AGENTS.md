<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes - APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

## Supabase Migration Gotcha

- Migration history for `0000-0009` was normalized on 2026-04-20 with `supabase migration repair ... --status applied`.
- `supabase migration list` and `supabase db push --dry-run` now report the remote database as up to date.
- If a future session ever sees `supabase db push` trying to replay `0000+`, stop and inspect migration bookkeeping before pushing anything to production.
