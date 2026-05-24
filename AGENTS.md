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

## Copy rules (user-visible strings)

These apply to every string the artist or a public visitor can read: page copy, button labels, helper text, modal bodies, action error messages, email copy. They do NOT apply to code comments, log lines, or commit messages (where em-dashes etc. are fine for readability).

- **No em-dashes (—).** Founder rule: em-dashes read as AI-generated. Use a period, comma, colon, or parentheses instead. Hyphens in compound modifiers (`display-only`, `well-known`) are fine; those are hyphens, not em-dashes.
- **Sentence case.** "Books open", not "books open" or "Books Open". First letter of each sentence capitalised, rest lowercase except proper nouns and brand terms (Instagram, Stripe, Inklee, GDPR, etc.).
- **Terminal punctuation** on full sentences in error messages and longer helper text. Single labels (button text, chip text, column headers) take no period.
- **Action verbs are Accept / Pass** in the booking flow, not Approve / Reject. Marketing or industry-standard surfaces can argue for the latter; the in-app verbs were unified during Slice 60a.
- **Brand vocabulary** lives in `src/lib/status-labels.ts` (`humanStatusLabel`) and the post-Slice-60b nav labels (`nav-config.ts` + `bookings-nav.tsx`). Use them rather than re-inventing copy.

Quick check before shipping a new user-visible string: search the diff for `—`. If found, replace.
