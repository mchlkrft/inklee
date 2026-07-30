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

### Footgun: a migration that RE-RUNS without erroring has not necessarily CONVERGED

Sibling of the one above, and the same shape: "the migration looks like it repairs this" turns out to be false at exactly the moment someone reaches for it during an incident.

`create table if not exists` checks the **table's** existence. Anything declared **inline** in its column/constraint list — foreign keys, unique constraints, checks — is therefore skipped entirely once the table exists, and the run exits 0 having restored nothing:

```
NOTICE:  relation "product_collection_items" already exists, skipping
CREATE TABLE
```

Found empirically on 2026-07-29: re-running `0122_collection_items.sql` after two composite FKs had been dropped restored neither, and reported success. Re-running had been certified "idempotent" on the basis that it does not error — which is a different property from converging to the intended schema.

**Do not trust "re-run the migration" as a repair path. Verify the specific object:**

- Constraints: `select conname from pg_constraint where conrelid = 'X'::regclass;`
- Policies: `select policyname, cmd from pg_policies where tablename='X';`
- Functions: `select proname from pg_proc where proname = 'X';`

**Convergent patterns** (safe to rely on): per-item existence guards (`do $$ begin if not exists (select 1 from pg_constraint where conname='X') then alter table ... end if; end $$;`), and unconditional replaces (`drop policy if exists` then `create policy`, `create or replace function`, `drop trigger if exists` then `create trigger`). Drop-then-create is the strongest of these: it repairs a present-but-wrong-shaped object, which an existence guard skips over.

**Non-convergent pattern:** objects declared inline inside `create table if not exists`.

Note both properties can hold at once and are not in tension: a file can re-run cleanly under `ON_ERROR_STOP` (idempotent) **and** fail to restore a manually dropped constraint (non-convergent). Idempotent is not convergent. That is the whole point of this entry.

**Status of `0122` itself, corrected 2026-07-29 (same day, later).** This paragraph previously read: "`0122` re-runs cleanly under `ON_ERROR_STOP` (idempotent) **and** fails to restore a manually dropped constraint (non-convergent)." That was true when written and is **no longer true**: commit `201fbfc` moved both composite foreign keys out of the inline `create table if not exists` into guarded `do $$ ... if not exists ... then alter table ... add constraint ... end if; end $$;` blocks, matching the pattern the file already used for its two parent unique keys. Convergence was proven by the route that disproved it: both FKs dropped by hand, `0122` re-run against the live already-migrated table, `pg_constraint` confirms both return. The same drop-then-rerun previously exited 0 having restored nothing.

So **`0122` is now the reference implementation of the convergent pattern, not the counter-example.** Read it when you need the shape. The dated empirical finding at the top of this entry is kept verbatim and in the past tense, because the finding is what makes the general rule credible and it genuinely happened.

The general rule is unchanged and is the durable part: a migration that re-runs without erroring has not necessarily converged, and no file's convergence should be assumed from the fact that someone once called it idempotent. Verify the specific object.

## Money path: deposits, Connect, sponsorship

Full description in `docs/artist-account-and-payouts.md`. These four rules exist
because each one was a production defect found on 2026-07-21, when the first
real-money test produced a booking with no pay button.

**A card deposit must never silently become a manual one.** A Stripe failure
while creating the deposit PaymentIntent used to be captured to Sentry and then
swallowed, leaving the booking in `deposit_pending` with a null
`deposit_client_secret` — which the customer portal renders as a manual "deposit
requested" card with no pay button, while the artist had just been told the
client pays by card. Any failure on that path must return an error and leave the
booking untouched. The manual path stays correct only for artists decided
un-connected or un-entitled **before** Stripe is called, because the request UI
already tells them which one they will get.

**Cached Connect state lies.** `profiles.stripe_account_status` and
`stripe_charges_enabled` are a snapshot of the last successful sync. Accounts
onboarded before the live-key cutover stayed `active` while being invisible to
the live key. Downgrade the cached state when Stripe says an account is
unreachable, but keep that test narrow: stripe-node maps **every** 403 to
`StripePermissionError`, so a platform-scope fault (a restricted or rotated key)
is indistinguishable from a per-artist one and would knock the whole fleet onto
manual deposits at once. Require the error to name the account. Never auto-clear
`stripe_account_id`: a status downgrade is undone by the next sync, wiping ids
is not. Note that `ensureConnectAccount` reuses a stored id, so an artist whose
account is genuinely gone needs an admin to clear those columns before they can
re-onboard.

**Never release a fee waiver against intent metadata.**
`sponsored_fee_cents` records what Inklee *intended* to waive, not proof the
artist's counter was charged. The settlement increment is skipped on orphaned
payments and on swallowed errors, and `fee_sponsored_used_cents` is
artist-global, so releasing an unbooked waiver erases other bookings' real usage
and hands out sponsorship past the cap. Release only against what settlement
actually booked (`deposit_fee_sponsorship_booked_cents`, migration `0100`).

**Webhook money operations converge to a target.** `charge.refunded` fires once
per refund carrying the *cumulative* `amount_refunded`, and Stripe redelivers
events. Never add a delta; compute the total that should have been applied and
move only the difference under a row lock.

## Plus build: the legal architecture is SETTLED — build first, counsel last

Founder rule (2026-07-28). The consumer / withdrawal / VAT / subscription
architecture and the Plus feature DIRECTION are counsel-confirmed. Do NOT
pause feature work to ask for counsel approval per component, do not mark
build items "counsel-gated", and do not reopen the confirmed inputs (digital
service classification, withdrawal-vs-cancellation split, immediate-performance
consent, online withdrawal function, data preservation on withdrawal,
proportional compensation, versioned consent evidence, artist-as-seller for
goods). Re-asking counsel per feature is exactly the overhead this rule exists
to prevent.

The ONE remaining counsel gate is FINAL implementation sign-off, after the
product and draft documents exist: final Terms, checkout disclosures,
declarations and wordings, the online withdrawal flow, and the implementation
itself. Sequence: build → complete final drafts → submit the finished thing →
apply corrections → record approval against the final versioned artifacts →
only then activate consumer billing. Draft legal copy is never described as
approved merely because the posture is confirmed. Full posture:
`docs/product/plus-product-spec.md` §1.

## Native app changes: update the parity register

`docs/web-native-parity.md` is the single tracked web-vs-native parity view
(founder rule, 2026-07-26). Update it in the SAME change whenever you: add or
modify a native screen or `/api/mobile/*` route, ship a web feature the app
might need (add a row, even if the decision is web-only), change
entitlement/capability wiring that touches mobile, or make a deliberate
web-only/native-only decision. An out-of-date row is a bug; the register
replaces re-auditing parity from scratch.

## Copy rules (user-visible strings)

These apply to every string the artist or a public visitor can read: page copy, button labels, helper text, modal bodies, action error messages, email copy. They do NOT apply to code comments, log lines, or commit messages (where em-dashes etc. are fine for readability).

- **No em-dashes (—).** Founder rule: em-dashes read as AI-generated. Use a period, comma, colon, or parentheses instead. Hyphens in compound modifiers (`display-only`, `well-known`) are fine; those are hyphens, not em-dashes.
- **Sentence case.** "Books open", not "books open" or "Books Open". First letter of each sentence capitalised, rest lowercase except proper nouns and brand terms (Instagram, Stripe, Inklee, GDPR, etc.).
- **Terminal punctuation** on full sentences in error messages and longer helper text. Single labels (button text, chip text, column headers) take no period.
- **Action verbs are Accept / Pass** in the booking flow, not Approve / Reject. Marketing or industry-standard surfaces can argue for the latter; the in-app verbs were unified during Slice 60a.
- **Brand vocabulary** lives in `src/lib/status-labels.ts` (`humanStatusLabel`) and the post-Slice-60b nav labels (`nav-config.ts` + `bookings-nav.tsx`). Use them rather than re-inventing copy.

Quick check before shipping a new user-visible string: search the diff for `—`. If found, replace.

## Audit evidence register: MANDATORY for every audit, review and verification

**Founder rule, 2026-07-30. This is not optional and it is not "when you have
time".**

`docs/audit/findings.yaml` is the permanent evidence ledger. Read
`docs/audit/README.md` before your first entry. Validate with
`pnpm audit:validate`, regenerate with `pnpm audit:generate`, scaffold a new
entry with `pnpm audit:new`. CI runs `pnpm audit:check` and fails on an invalid
ledger or a stale generated report.

It exists because evidence kept dying with the session that found it, and
because the same class of defect was found independently several times before
anyone named it as recurrence.

### The rule

**Every audit, review, verification pass or security sweep MUST update the
register before it reports done.** That applies to a gate review, an adversarial
verification, a specialist review, a parity sweep, a one-off investigation, and
any task whose output is an opinion about whether something is correct.

**An audit that records nothing did not happen.**

Concretely, before you report:

1. **Every finding goes in**, with a citation. No citation, no finding.
2. **An audit that finds NOTHING still writes a `coverage` row.** This is the
   half everyone skips and it is the more important half: without it, "inspected
   and found sound" is indistinguishable from "nobody looked", and the whole
   point of the scope map is keeping those apart. Record what you inspected, at
   which commit, and what you deliberately did NOT cover
   (`known_exclusions`).
3. **Name the comparable areas you did not inspect**
   (`analogous_uninspected_areas`). A repaired object beside three unexamined
   siblings is how the same defect ships twice, which is documented here twice
   already.
4. **Do not upgrade your own confidence.** If it rests on reading, it is not
   `confirmed`.

A narrative review document in `docs/` is no longer a sufficient deliverable on
its own. Write one if it helps a human, but the register entry is what survives,
and it is what a later auditor reads. If your review produced a doc and no
register entry, you have produced something that will be forgotten.

### Why it is enforced this way

CI cannot detect that you skipped an audit. It CAN detect an invalid ledger and
a stale report, and it does. The rest is on the supervisor: a review handed back
with no register delta gets sent back, the same way a fix with no test does.

**Workers, when you find something meaningful:**

- Record it. A finding needs a citation (file:line, migration, policy, command
  output), not a feeling that something looks fragile.
- Do NOT record speculation as confirmed. `confidence: confirmed` requires
  observed facts AND a reproduction; use `hypothesis` and say what you did not
  check. The validator enforces this.
- If it looks like something already recorded, link it rather than opening a
  twin: `related_findings`, or `possible_duplicates` if you are unsure.
- Record comparable places you INSPECTED and found sound
  (`inspected_comparables_without_issue`), and comparable places you did NOT
  inspect (`analogous_uninspected_areas`). The second is the most useful field
  in the register and the easiest to skip.
- When you commit a fix, set `remediation.status: fixed-unverified` and the
  `fix_commit`. **Leave verification pending.** You do not verify your own fix.
- Never delete a finding because you fixed it. Add a `history` entry.

**Supervisors:**

- Review new findings for evidence quality before they harden into fact.
  Downgrade confidence that rests on reading alone.
- Identify duplicates; connect recurrence into a `PAT-NNN` structural pattern.
  A pattern needs repeated evidence or a real architectural relationship, never
  a shared category label.
- When recurrence suggests something systemic, WIDEN SCOPE: sample the sibling
  objects nobody has looked at, and record them either as inspected-and-sound or
  as still uninspected.
- Do not let a worker close a finding it fixed itself. Route verification to a
  different instance or process, and where that is impossible record
  `verification.independent: false` with the limitation in `residual_risk`.
- Preserve unresolved uncertainty. Contradictory evidence stays in the record.
- Keep `coverage` honest. "No findings recorded" is not "reviewed and sound",
  and the scope map exists to keep those apart.

**The repository is PUBLIC.** No secrets, no personal data, no production rows,
no runnable exploit recipes. If a finding needs restricted evidence, set
`disclosure.public_repo_safe: false` and say where the full evidence lives.
