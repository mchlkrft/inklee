# scripts/

Operator and governance tooling. Plain CommonJS (`.cjs`), Node builtins plus
whatever the repository already installs. No build step, no framework.

| Directory | What it does |
| --- | --- |
| `scripts/audit/` | Continuous Audit Evidence and Structural Risk Register (`docs/audit/`): validate the ledger, regenerate reports, scaffold a finding |
| `scripts/billing/` | Billing activation gate: the scoreboard and the per-key approval recorders |
| `scripts/entitlements/` | `legacy_free_v1` grandfathering backfill and recompute |
| `scripts/legal/` | Legal artifact integrity validator (filesystem half plus the database half) |
| `scripts/lib/` | Shared repository-root discovery used by all of the above |
| `scripts/*.cjs` (root) | Geo/seed import tooling |

## Path resolution contract

Every script resolves files **relative to the repository**, never to an
absolute machine path and never to the working directory. You can run them from
anywhere:

```bash
node scripts/billing/gate-status.cjs                 # from the repo root
node /any/path/to/inklee/scripts/billing/gate-status.cjs   # from anywhere else
```

`scripts/lib/repo-root.cjs` is the single implementation:

- The root is derived from the module's own location
  (`path.resolve(__dirname, "..", "..")`).
- The derived root is then **verified**: `package.json` must exist, must parse,
  and must be named `inklee-monorepo`, and `apps/web/` must exist.
- If verification fails, every caller gets a loud error naming the candidate
  directory and the missing marker. **There is no fallback.** A
  wrong-but-plausible root would let a governance script produce evidence about
  the wrong tree, which is worse than not running at all.
- **No environment variable can move the root.** `INKLEE_REPO_ROOT` and friends
  are deliberately not read; a check whose target can be redirected by an
  exported variable is not usable as evidence.
- Paths are composed with `path.join` / `path.resolve` only, so Windows and
  ubuntu CI behave identically.

Dependencies are loaded with `requireFromRepo("postgres")`, which resolves out
of the repository's own install regardless of which workspace declares the
package or which pnpm linker mode is in effect. A missing install produces
`Cannot resolve the 'postgres' package ... Run pnpm install at <root>` rather
than a raw `MODULE_NOT_FOUND`.

History: ten of these scripts used to hard-code `A:/WORK/inklee` twice each, so
the checks that record legal approvals and score the billing gate could be
executed by exactly one machine. See finding `OPS-TOOL-001` in
`docs/audit/findings.yaml`.

## Credentials

The database-backed scripts need `DATABASE_URL`. Resolution order:

1. `process.env.DATABASE_URL`
2. `apps/web/.env.local` (the Control Tower vault mirrors it)

Each run prints one disclosure line before it does anything:

```
db target: <host> (from process.env)
db target: <host> (from apps/web/.env.local)
```

That line exists because an exported `DATABASE_URL` would otherwise silently
retarget a recorder the operator believes is pointed at production. Read it.

Failure modes, all of which exit non-zero with a full explanation:

| Situation | Behaviour |
| --- | --- |
| `DATABASE_URL` unset **and** `apps/web/.env.local` missing | Hard error. A missing credential file is a setup error, never "the value is absent" |
| `apps/web/.env.local` present but has no `DATABASE_URL` | `verify-legal-artifacts.cjs` prints `[db] SKIPPED` and keeps its filesystem verdict (unchanged behaviour). Every other script exits 1 |
| Repository root cannot be confirmed | Hard error naming the candidate directory and the missing marker |

CI (ubuntu) can run any of these by exporting `DATABASE_URL`; nothing else about
them is machine-specific. Note that most of them are pointed at **production**
by the local `.env.local`, so read the read-only / dry-run notes below first.

## Read-only and dry-run safety

| Script | Default |
| --- | --- |
| `legal/verify-legal-artifacts.cjs` | Read-only always |
| `billing/gate-status.cjs` | Read-only always |
| `billing/record-*.cjs` | Dry run. Writes only with `--apply`, and only when the in-file `CONFIG` names an approver and evidence |
| `entitlements/legacy-free-recompute.cjs` | Read-only. Writes only with `--apply` |
| `entitlements/backfill-legacy-free.cjs` | Dry run. Writes only with `--apply` |
| `billing/e2e-subscription.cjs` | Test mode only. Needs a running dev server plus `stripe listen`; `stripe-test-lib.cjs` refuses a live key |

Recording an approval key opens nothing on its own: a live charge still needs
the full key group, a live Price and live mode.

## Tests

```bash
node scripts/lib/repo-root.test.cjs           # direct
node --test "scripts/**/*.test.cjs"           # all script tests, quote the glob
```

Pass a file or a quoted glob, not a bare directory: on Node 24 for Windows
`node --test scripts/lib/` tries to load the directory as a module and fails
before any test runs.

Node's built-in test runner, no install and no credentials required. It covers
root discovery, working-directory independence (asserted across child processes
run from four different directories), rejection of an unmarked or
wrongly-named root with a positive control proving those rejections can pass,
separator correctness, dependency resolution, every credential-resolution
branch in a throwaway tree, and a repository guard that fails if any file under
`scripts/` reintroduces a machine-absolute path outside a comment.

The test that matters most is the last one: it is the regression guard for
`OPS-TOOL-001` itself, and it has been observed failing (a temporary file
containing the old absolute `require` turned it red and named the file and
line).

**Not yet automated.** No workflow runs this file. Wiring it in is two lines,
deliberately left to whoever owns `package.json` and `.github/workflows/ci.yml`:

```jsonc
// package.json "scripts"
"test:scripts": "node --test \"scripts/**/*.test.cjs\""
```

```yaml
# .github/workflows/ci.yml, in the `verify` job
- name: Script path-resolution tests
  run: pnpm test:scripts
```

Until that lands, "the path behaviour is tested" means a test exists and passes
locally, not that anything enforces it.
