<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes - APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

## Supabase Migration Gotcha

- Migration history for `0000-0009` was normalized on 2026-04-20 with `supabase migration repair ... --status applied`.
- `supabase migration list` and `supabase db push --dry-run` now report the remote database as up to date.
- If a future session ever sees `supabase db push` trying to replay `0000+`, stop and inspect migration bookkeeping before pushing anything to production.

### Footgun: `migration repair --status applied`

`migration repair --status applied` marks a migration as applied **without executing its SQL** — it only updates the bookkeeping table. This is the right tool when SQL was already applied via another path (e.g. SQL editor) and the bookkeeping diverged. It is the **wrong** tool when the SQL has not actually run, and silently leaves the database in an unintended state.

The 2026-04-20 repair masked an unrun `0001_rls_policies.sql` for ~3 weeks until the Security Advisor flagged 6 tables with RLS disabled (incident on 2026-05-10, fixed in migrations 0026–0029).

**Before running `migration repair --status applied` on any migration, verify the migration's effects actually exist:**

- For RLS: `select tablename, policyname from pg_policies where schemaname='public';`
- For columns: `select column_name from information_schema.columns where table_name='X';`
- For tables: `select tablename from pg_tables where schemaname='public';`

If the expected effects are missing, the migration has not actually run. Apply it manually (SQL editor or `supabase db push`) before repairing the bookkeeping.
