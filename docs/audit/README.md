# Continuous Audit Evidence and Structural Risk Register

A permanent, machine-readable record of findings discovered while building and
reviewing Inklee, plus an honest map of what has and has not been inspected.

It exists because evidence kept dying with the session that produced it. A
defect would be found, fixed, and the reasoning that made it findable would
survive only in a commit message nobody would search again. Worse, the *shape*
of recurring weaknesses was invisible: the same class of mistake was found
independently several times before anyone named it as a pattern.

**What this register is for**

- preserving evidence in a form a later auditor can re-check without this
  repository's conversational history;
- exposing recurrence, so a third instance of one mistake is recognised as
  structural rather than treated as a third one-off;
- recording where nobody has looked.

**What it is not**

It is not an assurance document. It does not show the codebase is safe. The
absence of a finding is not evidence of safety, and a coverage level of `none`
means nobody inspected the area, not that the area is fine.

---

## Files

| File | Hand-edited? | Role |
| --- | --- | --- |
| `findings.yaml` | **Yes, this is the only one** | The ledger: findings, patterns, coverage |
| `findings.schema.json` | Yes | Contract and controlled vocabulary |
| `structural-risk-report.md` | **No, generated** | Patterns, prioritization, blind spots |
| `audit-scope-map.md` | **No, generated** | What has actually been inspected |
| `unresolved-findings.md` | **No, generated** | Operational open state |
| `auditor-handoff.md` | **No, generated** | Entry point for an independent auditor |
| `evidence/` | Yes | Supporting artifacts, redacted for a public repo |

```bash
pnpm audit:validate    # schema + governance rules
pnpm audit:generate    # rewrite the four generated reports
pnpm audit:check       # validate + fail if any report is stale (runs in CI)
```

`pnpm audit:check` runs in CI (`.github/workflows/ci.yml`). A stale generated
report fails the build, because a report that silently drifts from its source is
worse than no report.

---

## When to create a finding

Create one when **all** of these hold:

1. You observed something concrete, not a feeling that code looks fragile.
2. You can cite it: a file and line, a migration, a policy, a command output.
3. It would matter to someone who did not watch you find it.

Good reasons to open a finding:

- an invariant is broken, even if nothing currently exercises it (latent
  defects are findings; record them as `latent`, not as nothing);
- authorization, entitlement or money behaviour differs from what the code
  claims;
- two implementations of one rule disagree;
- a test cannot fail;
- production state differs from what a migration assumes.

## When NOT to create a finding yet

- **A hunch with no citation.** Go look first. If you must record it, use
  `confidence: hypothesis` and say plainly what you did not check.
- **A style or preference disagreement.** Not a finding.
- **"This looks unsafe" without tracing reachability.** Trace it, then record
  what you established and what you did not.
- **A restatement of documentation.** Docs in this repository have repeatedly
  been wrong about runtime behaviour. A doc claim is not an observed fact.

The validator enforces some of this: `confidence: confirmed` requires both
`observed_facts` and either a `reproduction` or `references`.

---

## Identifiers

Format `DOMAIN-SUBDOMAIN-NNN`, for example:

```text
AUTH-RLS-001      authorization, row-level security
BILL-ENT-002      billing, entitlement
DATA-MIG-003      data, migration
CLIENT-DIV-004    client divergence
TEST-NEG-005      testing, negative paths
```

Rules: unique, stable, **never reused**, and retained after closure. Allocate the
next free number in the domain-subdomain pair. Patterns use `PAT-NNN`.

A closed finding is never deleted. Closure is a `history` entry plus a
`remediation.status`, so the ID keeps resolving for anything that referenced it.

## Duplicates

Do not delete the newer one. Record `relationships.possible_duplicates` on both,
and let a supervisor decide. Two reports of one defect from different angles is
useful evidence about detectability; silently merging them destroys that.

## Linking

- `related_findings` — same subsystem, or one causes the other.
- `structural_patterns` — this finding is an instance of a named pattern.
- `analogous_uninspected_areas` — **the highest-value field in this register.**
  Comparable places that might share the weakness where nobody has looked. Write
  these even when you are fairly sure they are fine; "fairly sure" is not
  inspection.

---

## Structural patterns

A pattern needs **either repeated evidence or a strong architectural
relationship**. Two findings sharing a broad category is not a pattern, and the
validator requires at least two distinct linked findings.

Every pattern must carry `contradicting_evidence` and, where known,
`inspected_without_pattern`: comparable areas that were checked and did *not*
show it. A pattern with only confirming evidence is a story, not an analysis.

Patterns are created by a **supervisor**, not by the worker who found the latest
instance. Recognising recurrence needs a view across findings.

---

## Remediation is not verification

These are separate fields, deliberately, and it is the register's central rule.

| | Means |
| --- | --- |
| `remediation.status: fixed-unverified` | A commit exists. Nothing has confirmed it works. |
| `verification.status: passed` | Something independent confirmed the fix. |
| `verification.independent: true` | Confirmed by a **different** instance, reviewer or process than the one that wrote the fix. |

A fix does not become verified because a commit exists, and **a worker fixing
its own finding is not independent verification**. When independent
verification is not possible, set `independent: false` and state the limitation
in `residual_risk`; the validator requires that.

A passing test suite is not verification either, unless the test was shown to
**fail without the fix**. Prefer recording that red-then-green evidence in
`verification_method`.

---

## Coverage

`coverage` entries record what was actually inspected.

| Level | Means |
| --- | --- |
| `none` | Not inspected. **Not a safety claim.** |
| `initial` | Surface pass only |
| `partial` | Some paths inspected, others not |
| `substantial` | Most paths, with gaps named |
| `comprehensive` | Systematic, with exclusions named |

Every entry needs `evidence` justifying its level, and the validator rejects
`coverage: none` with `findings_produced`, because if it produced findings it
was inspected. Percentages are avoided: this repository has no defensible way to
compute them, and a made-up percentage is worse than a named level.

---

## Sensitive evidence

**This repository is public.** Therefore:

- no secrets, tokens, credentials, connection strings or keys;
- no customer or artist personal data;
- no production row data;
- no step-by-step exploit recipes. Describe the class of weakness and its
  preconditions abstractly; that is enough for an authorized reviewer to
  reproduce the analysis.

If a finding genuinely needs restricted evidence, set
`disclosure.public_repo_safe: false` and point `restricted_evidence_location` at
where it lives outside the repository. The validator requires that pairing.

---

## Worked examples

### A confirmed finding

Real evidence, reproducible, and honest about what remains unknown.

```yaml
- id: DATA-MIG-002
  classification: { domain: migration, category: schema-drift,
                    severity: high, confidence: confirmed }
  evidence:
    observed_facts:
      - "Dropped two constraints by hand, re-ran 0125 under ON_ERROR_STOP: exit 0, neither returned."
    reproduction: "Drop the constraint, re-run the migration, read pg_constraint."
  assessment:
    reachability: conditionally-reachable
    impact_status: latent
    remaining_uncertainty: "Not checked against production; only the local stack."
```

### A hypothesis

Recorded so it is not lost, clearly marked as unproven.

```yaml
  classification: { confidence: hypothesis, ... }
  assessment:
    root_cause_hypothesis: "Both wrappers likely evolved from one helper and drifted."
    remaining_uncertainty: "Not traced through git history. The shared origin is inferred from shape, not established."
```

### Fixed but not verified

```yaml
  remediation: { status: fixed-unverified, fix_commit: 4d406f9 }
  verification: { status: not-started, independent: false }
```

### An area reviewed with no issue found

```yaml
- area: database
  subsystem: discount_codes RLS
  coverage: partial
  review_type: adversarial-verification
  evidence: "tests/db/discounts-rls.test.ts exercises cross-account writes and asserts 42501."
  known_exclusions: "Service-role paths not exercised."
```

### An area not reviewed

```yaml
- area: storage
  subsystem: Supabase storage bucket policies
  coverage: none
  review_type: none
  last_inspected: unknown
  evidence: "No audit document, no test, no review commit found for storage policies."
  recommended_next_inspection: "Enumerate buckets and compare policies against which client uploads."
```

---

## For independent auditors

Start at `auditor-handoff.md`.

Three warnings, stated here as well because they matter most:

1. **This register is incomplete**, and its shape reflects where one team's
   attention happened to fall.
2. **The root-cause hypotheses may be wrong.** Several previous ones were, and
   were corrected only when someone tried to disprove them by execution.
3. **Do not let the finding list bound your search.** The `none` rows in the
   scope map and the `analogous_uninspected_areas` fields are the more useful
   starting points, precisely because nothing there has been examined.
