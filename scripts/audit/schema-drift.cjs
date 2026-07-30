#!/usr/bin/env node
// Production schema drift detector.  READ-ONLY on both sides.
//
//   node scripts/audit/schema-drift.cjs
//   node scripts/audit/schema-drift.cjs --json=docs/audit/evidence/schema-drift.json
//   node scripts/audit/schema-drift.cjs --probe=policies,constraints --verbose
//   node scripts/audit/schema-drift.cjs --snapshot=prod --json=/tmp/prod.json
//
// WHY THIS EXISTS
// ---------------
// DATA-MIG-001: `supabase migration repair --status applied` marks a migration
// applied WITHOUT running its SQL.  It did, and an unrun RLS migration stayed
// invisible for three weeks.  DATA-MIG-002: a migration can re-run, exit 0, and
// restore nothing.  Both mean the same thing:
//
//     THE MIGRATION LEDGER IS NOT EVIDENCE OF SCHEMA STATE.
//
// The only evidence is the catalog.  This script reads the catalog on both
// sides and diffs it, so "is production what the migrations say it is" stops
// being answered by reading a table of version strings.
//
// THE FOUR CATEGORIES
// -------------------
// Every difference is classified, and the classification is the deliverable:
//
//   expected-branch-ahead  object exists locally, absent in prod, and every
//                          migration that mentions it is NEWER than the newest
//                          version in the PRODUCTION ledger.  Normal: the
//                          branch is ahead of prod.
//   unexplained-missing    object exists locally, absent in prod, and a
//                          migration that is RECORDED AS APPLIED in prod
//                          creates it.  This is the DATA-MIG-001 signature.
//   unexplained-extra      object exists in prod, absent locally, and no
//                          migration file mentions it.  Out-of-band change
//                          (SQL editor, dashboard, extension side effect).
//   unexplained-mismatch   same object, different definition.
//
// plus `allowlisted`, for deviations declared intentional in ALLOWLIST below
// with a reason and a reference.
//
// ATTRIBUTION IS A HEURISTIC.  "Which migration creates this object" is decided
// by substring-searching the migration files for the object's identifier.  It
// can attribute to a file that only MENTIONS the name (a comment, a drop, an
// unrelated column of the same name).  Treat attribution as a triage aid, never
// as proof.  The diff itself is not a heuristic; the classification is.
//
// SAFETY
// ------
// Production is reached ONLY through the Supabase Management API query endpoint
// with `read_only: true`.  Verified empirically 2026-07-30: that flag both sets
// `transaction_read_only = on` AND runs the statement as `supabase_read_only_user`
// instead of `postgres`.  The script asserts BOTH before it issues any probe and
// aborts if either is false, so a silently-ignored flag cannot turn into a write
// session.  There is no code path that sends `read_only: false`, and no flag to
// add one.  Every probe is a compile-time constant asserted to begin with
// SELECT/WITH; nothing is interpolated into SQL.
//
// The local side is read the same way, over the local stack's own port.  It is
// never written to either, so running this cannot disturb a `pnpm test:db` run.
//
// THE "EXPECTED" SIDE IS NOT PURELY MIGRATION-DERIVED — READ THIS
// ---------------------------------------------------------------
// `supabase db reset --local` runs apps/web/supabase/seed.sql AFTER the
// migrations ([db.seed] in config.toml), and that file opens with
// `GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated,
// service_role`.  It therefore CLOBBERS every table-level REVOKE the
// migrations performed, and re-applies only the handful listed by hand at the
// bottom of the file.  seed.sql says so itself and asks future migrations to
// mirror their revokes there; that list is manually maintained and, as of
// 2026-07-30, incomplete.
//
// Consequence for THIS script: table_grants deviations may be a local-side
// artifact rather than production drift, and the direction matters — local
// looser than prod means the local build is wrong, not production.
//
// Build the expected side with `supabase db reset --local --no-seed` when the
// grant surface is what you are auditing.  Every other probe is unaffected.
//
// Second caveat: the local stack is a SHARED, MUTABLE resource.  Another agent
// or a `pnpm test:db` run can reset it underneath this script; the first run of
// this file died mid-flight when exactly that happened.  Treat local as a
// snapshot taken at the moment of the run, and record its ledger max, which the
// output does.
//
// CREDENTIALS
//   prod   SUPABASE_ACCESS_TOKEN (Windows USER env)  -> Management API
//   local  LOCAL_DATABASE_URL, else the Supabase CLI default on 54322
//
// WHAT IT CANNOT SEE — see the UNINSPECTABLE map just above main(); it is also
// written into the JSON artifact, so a reader of the artifact alone still sees
// the limits of the run that produced it.

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const MIGRATIONS_DIR = path.join(ROOT, "apps/web/supabase/migrations");
const PROJECT_REF = "llmzzsmppaqwecbrowlp";
const MGMT_URL = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;
const LOCAL_URL =
  process.env.LOCAL_DATABASE_URL ||
  "postgres://postgres:postgres@127.0.0.1:54322/postgres";

// --------------------------------------------------------------------- args
function arg(name, fallback = null) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}
const VERBOSE = process.argv.includes("--verbose");
const NO_FAIL = process.argv.includes("--no-fail");
const JSON_OUT = arg("json");
const SNAPSHOT = arg("snapshot"); // 'prod' | 'local' -> dump one side, no diff
const ONLY = (arg("probe") || "").split(",").filter(Boolean);

// ------------------------------------------------------------------- probes
// key      columns forming object identity
// compare  columns whose difference is a MISMATCH (identity present both sides)
// attr     builds the token used to attribute the object to a migration file
// note     recorded in the artifact so a reader knows the probe's limits
const PROBES = [
  {
    name: "ledger",
    key: ["version"],
    compare: [],
    attr: () => [],
    byFilename: true,
    note: "Bookkeeping only. Present so ledger-vs-catalog disagreement is visible in one artifact; it is NOT evidence of state (DATA-MIG-001).",
    sql: `select version from supabase_migrations.schema_migrations order by 1`,
  },
  {
    name: "tables",
    key: ["name"],
    compare: ["kind", "rls_enabled", "rls_forced"],
    attr: (r) => r.name,
    note: "public base and partitioned tables, with RLS enablement.",
    sql: `select c.relname as name,
       case c.relkind when 'r' then 'table' else 'partitioned' end as kind,
       c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind in ('r','p')
 order by 1`,
  },
  {
    name: "columns",
    key: ["tbl", "col"],
    compare: ["typ", "notnull", "dflt", "identity", "generated"],
    attr: (r) => [r.tbl, r.col],
    parent: (r) => r.tbl,
    note: "Ordinal position is deliberately NOT compared: it differs legitimately when a column is added by a later migration on one side.",
    sql: `select c.relname as tbl, a.attname as col,
       format_type(a.atttypid, a.atttypmod) as typ,
       a.attnotnull as notnull,
       coalesce(pg_get_expr(d.adbin, d.adrelid), '') as dflt,
       a.attidentity::text as identity,
       a.attgenerated::text as generated
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
 where n.nspname = 'public' and c.relkind in ('r','p')
   and a.attnum > 0 and not a.attisdropped
 order by 1, 2`,
  },
  {
    name: "constraints",
    key: ["tbl", "name"],
    compare: ["typ", "def"],
    attr: (r) => [r.name],
    parent: (r) => r.tbl,
    note: "Includes FK, unique, check, pkey, exclusion. This is the probe DATA-MIG-002 (inline constraints skipped by `create table if not exists`) needs.",
    sql: `select rel.relname as tbl, con.conname as name, con.contype::text as typ,
       pg_get_constraintdef(con.oid) as def
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace n on n.oid = rel.relnamespace
 where n.nspname = 'public'
 order by 1, 2`,
  },
  {
    name: "indexes",
    key: ["tbl", "name"],
    compare: ["def", "valid"],
    attr: (r) => [r.name],
    parent: (r) => r.tbl,
    note: "Constraint-backing indexes appear here too; a unique-constraint drift shows in both probes. `valid` matters because a failed CREATE INDEX CONCURRENTLY leaves an index that EXISTS, matches by name, and is silently never used. 0097 states its indexes were built CONCURRENTLY in production, so name-only comparison would not have been enough.",
    sql: `select t.relname as tbl, c.relname as name,
       pg_get_indexdef(i.indexrelid) as def,
       (i.indisvalid and i.indisready and i.indislive) as valid
  from pg_index i
  join pg_class c on c.oid = i.indexrelid
  join pg_class t on t.oid = i.indrelid
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
 order by 1, 2`,
  },
  {
    name: "triggers",
    key: ["tbl", "name"],
    compare: ["def", "enabled"],
    attr: (r) => [r.name],
    parent: (r) => r.tbl.replace(/^public\./, ""),
    note: "public schema plus auth.users, which migrations attach to. Internal (constraint) triggers excluded.",
    sql: `select n.nspname || '.' || c.relname as tbl, t.tgname as name,
       pg_get_triggerdef(t.oid) as def,
       t.tgenabled::text as enabled
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
 where not t.tgisinternal
   and (n.nspname = 'public' or (n.nspname = 'auth' and c.relname = 'users'))
 order by 1, 2`,
  },
  {
    name: "functions",
    key: ["name", "args"],
    compare: [
      "result",
      "kind",
      "volatility",
      "security_definer",
      "config",
      "body_squished_md5",
    ],
    attr: (r) => r.name,
    note: "Body compared by md5 of the WHITESPACE-COLLAPSED source, not the raw source. Raw md5 differed for 21 of 42 functions on the first run purely because this Windows checkout has core.autocrlf=true, so the local stack got CRLF bodies and production has LF. That is a checkout artifact, not drift, and comparing raw md5 would have reported 21 false positives every run. body_md5 is still emitted, unc"+"ompared, so a reader can see the raw hashes.",
    sql: `select p.proname as name,
       pg_get_function_identity_arguments(p.oid) as args,
       pg_get_function_result(p.oid) as result,
       p.prokind::text as kind,
       p.provolatile::text as volatility,
       p.prosecdef as security_definer,
       coalesce(array_to_string(p.proconfig, '|'), '') as config,
       md5(coalesce(p.prosrc, '')) as body_md5,
       md5(btrim(regexp_replace(coalesce(p.prosrc, ''), '[[:space:]]+', ' ', 'g'))) as body_squished_md5
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
 order by 1, 2`,
  },
  {
    name: "rpc_grants",
    key: ["name", "args", "grantee"],
    compare: ["can_execute"],
    attr: (r) => [r.name],
    parent: (r) => r.name,
    parentProbe: "functions",
    parentKeyOf: (r) => `${r.name} | ${r.args}`,
    note: "The RPC surface: which public function each PostgREST role may execute. Uses has_function_privilege, NOT `set role` (that segfaults the local Postgres image).",
    sql: `select p.proname as name,
       pg_get_function_identity_arguments(p.oid) as args,
       r.rolname as grantee,
       has_function_privilege(r.rolname, p.oid, 'EXECUTE') as can_execute
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 cross join (select unnest(array['anon','authenticated','service_role']) as rolname) r
 where n.nspname = 'public' and p.prokind in ('f','p')
 order by 1, 2, 3`,
  },
  {
    name: "policies",
    key: ["tbl", "name"],
    compare: ["cmd", "permissive", "roles", "qual", "with_check"],
    attr: (r) => [r.name],
    parent: (r) => r.tbl,
    note: "AUTH-RLS-001/002 live here: `cmd` and `with_check` are the columns that distinguish a SELECT-only policy from a working write path.",
    sql: `select tablename as tbl, policyname as name, cmd, permissive,
       coalesce(array_to_string(roles, ','), '') as roles,
       coalesce(qual, '') as qual,
       coalesce(with_check, '') as with_check
  from pg_policies where schemaname = 'public' order by 1, 2`,
  },
  {
    name: "storage_policies",
    key: ["tbl", "name"],
    compare: ["cmd", "permissive", "roles", "qual", "with_check"],
    attr: (r) => r.name,
    sql: `select tablename as tbl, policyname as name, cmd, permissive,
       coalesce(array_to_string(roles, ','), '') as roles,
       coalesce(qual, '') as qual,
       coalesce(with_check, '') as with_check
  from pg_policies where schemaname = 'storage' order by 1, 2`,
  },
  {
    name: "storage_buckets",
    key: ["id"],
    compare: ["is_public", "file_size_limit", "mimes"],
    attr: (r) => r.id,
    note: "Bucket CONFIG only. No object rows, no owners: this is a public repository.",
    sql: `select id, public as is_public,
       coalesce(file_size_limit, -1) as file_size_limit,
       coalesce(array_to_string(allowed_mime_types, ','), '') as mimes
  from storage.buckets order by 1`,
  },
  {
    name: "table_grants",
    key: ["tbl", "grantee"],
    compare: ["privs"],
    attr: (r) => [r.tbl],
    parent: (r) => r.tbl,
    note: "Uses has_table_privilege, NOT information_schema.role_table_grants. The latter only shows grants the CURRENT role participates in, so under the Management API's supabase_read_only_user it returns zero rows on production and a naive diff reads that as 'every grant is missing'. A grant is the layer UNDER RLS: correct policies plus a missing grant is still a broken feature.",
    sql: `select c.relname as tbl, r.rolname as grantee,
       concat_ws(',',
         case when has_table_privilege(r.rolname, c.oid, 'SELECT')     then 'SELECT' end,
         case when has_table_privilege(r.rolname, c.oid, 'INSERT')     then 'INSERT' end,
         case when has_table_privilege(r.rolname, c.oid, 'UPDATE')     then 'UPDATE' end,
         case when has_table_privilege(r.rolname, c.oid, 'DELETE')     then 'DELETE' end,
         case when has_table_privilege(r.rolname, c.oid, 'TRUNCATE')   then 'TRUNCATE' end,
         case when has_table_privilege(r.rolname, c.oid, 'REFERENCES') then 'REFERENCES' end,
         case when has_table_privilege(r.rolname, c.oid, 'TRIGGER')    then 'TRIGGER' end
       ) as privs
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 cross join (select unnest(array['anon','authenticated','service_role']) as rolname) r
 where n.nspname = 'public' and c.relkind in ('r','p','v','m')
 order by 1, 2`,
  },
  {
    name: "schema_grants",
    key: ["schema", "grantee"],
    compare: ["usage_priv", "create_priv"],
    attr: (r) => r.schema,
    sql: `select n.nspname as schema, r.rolname as grantee,
       has_schema_privilege(r.rolname, n.nspname, 'USAGE') as usage_priv,
       has_schema_privilege(r.rolname, n.nspname, 'CREATE') as create_priv
  from pg_namespace n
 cross join (select unnest(array['anon','authenticated','service_role']) as rolname) r
 where n.nspname in ('public','storage','extensions','auth')
 order by 1, 2`,
  },
  {
    name: "enums",
    key: ["name"],
    compare: ["labels"],
    attr: (r) => r.name,
    sql: `select t.typname as name,
       string_agg(e.enumlabel, ',' order by e.enumsortorder) as labels
  from pg_type t
  join pg_enum e on e.enumtypid = t.oid
  join pg_namespace n on n.oid = t.typnamespace
 where n.nspname = 'public' group by 1 order by 1`,
  },
  {
    name: "views",
    key: ["name"],
    compare: ["kind", "def_md5", "reloptions"],
    attr: (r) => r.name,
    sql: `select c.relname as name,
       case c.relkind when 'v' then 'view' else 'matview' end as kind,
       md5(pg_get_viewdef(c.oid, true)) as def_md5,
       coalesce(array_to_string(c.reloptions, ','), '') as reloptions
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind in ('v','m') order by 1`,
  },
  {
    name: "sequences",
    key: ["name"],
    compare: [],
    attr: (r) => r.name,
    note: "Existence only. Current values are data, not schema, and differ by design.",
    sql: `select c.relname as name
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'S' order by 1`,
  },
  {
    name: "extensions",
    key: ["name"],
    compare: ["schema"],
    attr: (r) => r.name,
    note: "Version is REPORTED but not compared: it is platform-managed and drifts by design between the local image and the hosted project.",
    sql: `select e.extname as name, n.nspname as schema, e.extversion as version
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace order by 1`,
  },
  {
    name: "publications",
    key: ["pub", "tbl"],
    compare: [],
    attr: (r) => r.tbl,
    note: "Realtime membership. A table added to supabase_realtime from the dashboard shows up here as unexplained-extra.",
    sql: `select pubname as pub, tablename as tbl
  from pg_publication_tables where schemaname = 'public' order by 1, 2`,
  },
  {
    name: "cron_jobs",
    key: ["name"],
    compare: ["schedule", "active", "command_md5"],
    attr: (r) => r.name,
    optional: true, // pg_cron is not installed locally by default
    note: "Scheduled work is schema the migrations do not always own. Probe is optional: a missing cron schema is reported as UNINSPECTABLE on that side, never as 'no jobs'.",
    sql: `select jobname as name, schedule, active, md5(command) as command_md5
  from cron.job order by 1`,
  },
];

// ---------------------------------------------------------------- allowlist
// A deviation is INTENTIONAL only with a reason and a citable reference.
// `probe` and `match` (regex against the joined key) must both hit.
const ALLOWLIST = [
  // Deliberately EMPTY.  The first version of this file allowlisted ledger rows
  // 0125-0127 as "branch ahead of prod".  That hard-coded list went stale within
  // the hour (0128 landed mid-run) and, worse, an allowlist keyed on a version
  // RANGE would have swallowed a genuinely missing OLDER migration too.  The
  // branch-ahead case is now DERIVED from the prod ledger max, so it stays
  // correct as migrations land.  Add an entry here only for a deviation that
  // cannot be derived, and only with a reason and a citable reference.
];

// ------------------------------------------------------------------ helpers
function assertReadOnlySql(name, sql) {
  if (!/^\s*(select|with)\b/i.test(sql)) {
    console.error(`FATAL: probe '${name}' is not a SELECT. Refusing to run.`);
    process.exit(2);
  }
}
for (const p of PROBES) assertReadOnlySql(p.name, p.sql);

// Deparsed expressions are schema-qualified according to the SESSION's
// search_path, which differs between the two sides (local role postgres has
// `"$user", public, extensions`; the Management API's supabase_read_only_user
// has `"$user", public`).  That renders the SAME policy as `st_makepoint(...)`
// on one side and `extensions.st_makepoint(...)` on the other.  Normalising the
// qualifier away is the narrowest fix; it is lossy and is declared in the
// artifact so a reader can discount it.
function normalize(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v)
    .replace(/\s+/g, " ")
    .replace(/\b(public|extensions)\./g, "")
    .trim();
}

// ------------------------------------------------------------------ sources
async function mgmtQuery(sql) {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) throw new Error("SUPABASE_ACCESS_TOKEN is not set");
  const res = await fetch(MGMT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    // read_only: true is the whole safety story. Never make this configurable.
    body: JSON.stringify({ query: sql, read_only: true }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 400)}`);
  return JSON.parse(text);
}

function makeLocal() {
  const postgres = require(
    path.join(ROOT, "node_modules/postgres/cjs/src/index.js"),
  );
  const sql = postgres(LOCAL_URL, { max: 1, idle_timeout: 5, onnotice: () => {} });
  return {
    query: (q) => sql.unsafe(q),
    close: () => sql.end({ timeout: 5 }),
  };
}

async function readSide(label, runner) {
  const out = { label, probes: {}, uninspectable: {} };
  for (const p of PROBES) {
    if (ONLY.length && !ONLY.includes(p.name)) continue;
    try {
      out.probes[p.name] = await runner(p.sql);
    } catch (e) {
      const msg = String(e.message || e).slice(0, 200);
      if (!p.optional) throw new Error(`[${label}/${p.name}] ${msg}`);
      out.uninspectable[p.name] = msg;
      if (VERBOSE) console.log(`  · ${label}/${p.name} uninspectable: ${msg}`);
    }
  }
  return out;
}

// -------------------------------------------------------------- attribution
let MIGRATIONS = null;
function loadMigrations() {
  if (MIGRATIONS) return MIGRATIONS;
  MIGRATIONS = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => ({
      version: f.slice(0, 4),
      file: f,
      text: fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8").toLowerCase(),
    }));
  return MIGRATIONS;
}
// A migration is attributed to an object only if it mentions EVERY token of the
// object's identity.  Attributing a column by its own name alone matched 53
// migrations for `created_at`, which is worthless; requiring table AND column
// makes it usable.  Still a heuristic: a file that merely references the name
// counts.
function attribute(tokens) {
  const list = (Array.isArray(tokens) ? tokens : [tokens])
    .filter(Boolean)
    .map((t) => String(t).toLowerCase())
    .filter((t) => t.length >= 3);
  if (!list.length) return [];
  return loadMigrations()
    .filter((m) => list.every((t) => m.text.includes(t)))
    .map((m) => m.version);
}
const tokensOf = (probe, row, key) =>
  probe.attr ? probe.attr(row) : [key];

// --------------------------------------------------------------------- diff
function keyOf(probe, row) {
  return probe.key.map((k) => String(row[k] ?? "")).join(" | ");
}

function diffProbe(probe, expectedRows, observedRows, prodLedgerMax, tableState) {
  const E = new Map(expectedRows.map((r) => [keyOf(probe, r), r]));
  const O = new Map(observedRows.map((r) => [keyOf(probe, r), r]));
  const deviations = [];

  // Cascade.  If the whole table is absent from production, every one of its
  // columns, constraints, indexes, policies and triggers is absent too.  Those
  // are consequences of ONE fact, not hundreds of independent findings, and
  // listing them separately buries whatever else the run found.
  const parentVerdict = (row) => {
    if (!probe.parent || !tableState) return null;
    const t = probe.parent(row);
    return tableState.get(t) || null;
  };

  const classifyMissing = (key, row) => {
    if (probe.byFilename) {
      // A ledger version is attributed by the migration FILENAME. Searching a
      // file's CONTENT for its own version string does not reliably hit.
      const known = loadMigrations().some((m) => m.version === row.version);
      if (known && row.version > prodLedgerMax)
        return {
          classification: "expected-branch-ahead",
          attributed_migrations: [row.version],
          why: `migration file ${row.version} exists and is newer than the prod ledger max ${prodLedgerMax}`,
        };
      return {
        classification: "unexplained-missing",
        attributed_migrations: known ? [row.version] : [],
        why: known
          ? `migration file ${row.version} exists and is NOT newer than the prod ledger max, yet prod has no ledger row for it`
          : `local ledger records ${row.version} but no migration file of that version exists`,
      };
    }
    const pv = parentVerdict(row);
    if (pv)
      return {
        classification:
          pv === "expected-branch-ahead"
            ? "child-of-branch-ahead-table"
            : "child-of-unexplained-missing-table",
        attributed_migrations: [],
        why: `its table is itself absent from production (${pv}); rolled up, not counted separately`,
      };
    const versions = attribute(tokensOf(probe, row, key));
    const inProd = versions.filter((v) => v <= prodLedgerMax);
    if (versions.length && inProd.length === 0)
      return {
        classification: "expected-branch-ahead",
        attributed_migrations: versions,
        why: `only migration(s) ${versions.join(",")} mention it, all newer than the prod ledger max ${prodLedgerMax}`,
      };
    if (inProd.length)
      return {
        classification: "unexplained-missing",
        attributed_migrations: versions,
        why: `migration(s) ${inProd.join(",")} mention it and ARE recorded applied in production, yet the object is absent`,
      };
    return {
      classification: "unexplained-missing",
      attributed_migrations: [],
      why: "no migration file mentions it; present locally, absent in production, unattributable",
    };
  };

  for (const [key, row] of E) {
    if (O.has(key)) continue;
    deviations.push({
      probe: probe.name,
      kind: "missing",
      key,
      expected: row,
      observed: null,
      ...classifyMissing(key, row),
    });
  }
  for (const [key, row] of O) {
    if (E.has(key)) continue;
    const versions = attribute(tokensOf(probe, row, key));
    deviations.push({
      probe: probe.name,
      kind: "extra",
      key,
      expected: null,
      observed: row,
      classification: "unexplained-extra",
      attributed_migrations: versions,
      why: versions.length
        ? `migration(s) ${versions.join(",")} mention it, yet it is absent from the local build`
        : "no migration file mentions it: created out of band (SQL editor, dashboard, or platform)",
    });
  }
  for (const [key, e] of E) {
    const o = O.get(key);
    if (!o) continue;
    const fields = probe.compare.filter(
      (c) => normalize(e[c]) !== normalize(o[c]),
    );
    if (!fields.length) continue;
    const versions = attribute(tokensOf(probe, e, key));
    const unapplied = versions.filter((v) => v > prodLedgerMax);
    deviations.push({
      probe: probe.name,
      kind: "mismatch",
      key,
      fields,
      expected: Object.fromEntries(fields.map((f) => [f, e[f]])),
      observed: Object.fromEntries(fields.map((f) => [f, o[f]])),
      // A mismatch on an object that an UNAPPLIED migration also touches is
      // the expected shape of "branch ahead of prod".  It is NOT proof: the
      // same object could be both modified by 0125 and drifted in production.
      // So it is reported separately and REQUIRES manual adjudication, rather
      // than being folded into either the clean or the alarming bucket.
      classification: unapplied.length
        ? "mismatch-touched-by-unapplied-migration"
        : "unexplained-mismatch",
      attributed_migrations: versions,
      touched_by_unapplied: unapplied,
      why: `same object, differing ${fields.join(", ")}` +
        (unapplied.length
          ? `; unapplied migration(s) ${unapplied.join(",")} also touch it (adjudicate manually)`
          : ""),
    });
  }

  for (const d of deviations) {
    const hit = ALLOWLIST.find(
      (a) =>
        a.probe === probe.name &&
        (!a.kinds || a.kinds.includes(d.kind)) &&
        a.match.test(d.key),
    );
    if (hit) {
      d.classification = "allowlisted";
      d.why = hit.reason;
      d.reference = hit.reference;
    }
  }
  return deviations;
}

// -------------------------------------------------------------- derived checks
// Not a diff: an invariant that must hold on the OBSERVED side regardless of
// what the local build looks like.  RLS enabled with zero policies denies all
// access through the user-scoped client; RLS disabled on a table that has
// policies means the policies are inert.
function rlsInvariants(side) {
  const tables = side.probes.tables;
  const pol = side.probes.policies;
  // Never report "0 problems" from probes that were not run: that is exactly
  // the "inspected and found nothing" / "not inspected" conflation.
  if (!tables || !pol) return { not_computed: "tables and/or policies probe not run" };
  const withPolicies = new Set(pol.map((p) => p.tbl));
  return {
    rls_enabled_zero_policies: tables
      .filter((t) => t.rls_enabled && !withPolicies.has(t.name))
      .map((t) => t.name),
    rls_disabled_but_policies_exist: tables
      .filter((t) => !t.rls_enabled && withPolicies.has(t.name))
      .map((t) => t.name),
    rls_disabled: tables.filter((t) => !t.rls_enabled).map((t) => t.name),
    invalid_indexes: (side.probes.indexes || [])
      .filter((i) => i.valid === false)
      .map((i) => `${i.tbl}.${i.name}`),
    disabled_triggers: (side.probes.triggers || [])
      .filter((t) => t.enabled && t.enabled !== "O")
      .map((t) => `${t.tbl}.${t.name}`),
    not_valid_constraints: (side.probes.constraints || [])
      .filter((c) => / NOT VALID$/.test(c.def || ""))
      .map((c) => `${c.tbl}.${c.name}`),
  };
}

// ------------------------------------------------------- what this cannot see
// Recorded in the artifact so "not inspected" is never mistaken for "clean".
const UNINSPECTABLE = {
  "auth service config":
    "GoTrue settings (providers, JWT expiry, MFA enforcement, email templates) live in the platform, not the catalog. Reachable via GET /v1/projects/{ref}/config/auth, which this script does not call.",
  "postgrest config":
    "db-schemas, max-rows, pre-request hook. Platform config, not catalog. GET /v1/projects/{ref}/postgrest.",
  "api / network config":
    "Network restrictions, SSL enforcement, custom domains, read replicas: platform, not catalog.",
  "edge functions":
    "Deployed function bodies and their secrets are not in the catalog.",
  "vault secrets":
    "vault.secrets is deliberately NOT probed. Reading it would put decrypted secrets in an artifact in a public repository.",
  "row data":
    "No probe reads application rows. Drift in DATA (a missing backfill, an orphaned row) is invisible to this script by design.",
  "grants to roles outside the PostgREST three":
    "Only anon, authenticated and service_role are compared. supabase_auth_admin, dashboard_user, authenticator and custom roles are not.",
  "column-level grants":
    "information_schema.role_table_grants is aggregated per table. A column-level GRANT would not show.",
  "default privileges":
    "pg_default_acl is not probed, so a future-object grant difference is invisible until an object is created.",
  "event triggers / rules / FDWs / partitions":
    "Not probed. No migration currently creates one; that is an assumption, not a check.",
  "auth and storage schema tables":
    "Only storage POLICIES and BUCKET config are compared. The platform-owned table definitions in auth/storage/realtime are excluded, because they drift by platform version rather than by our migrations.",
  "whether a table_grants deviation is production drift":
    "Not decidable by this script alone. seed.sql re-grants everything locally after the migrations run, so a grant difference may originate on the local side. Re-run against a --no-seed build to separate them.",
  "pg_cron locally":
    "pg_cron is not installed in the local image by default, so cron_jobs usually reports UNINSPECTABLE on the local side and cannot be diffed, only listed from prod.",
};

// --------------------------------------------------------------------- main
(async () => {
  const started = new Date().toISOString();

  if (SNAPSHOT) {
    const side =
      SNAPSHOT === "prod"
        ? await readSide("prod", mgmtQuery)
        : await (async () => {
            const l = makeLocal();
            try {
              return await readSide("local", l.query);
            } finally {
              await l.close();
            }
          })();
    const blob = JSON.stringify({ started, side }, null, 1);
    if (JSON_OUT) fs.writeFileSync(path.resolve(ROOT, JSON_OUT), blob);
    else process.stdout.write(blob);
    return;
  }

  // Prove the production connection cannot write BEFORE issuing any probe.
  console.log("preflight: proving the production connection is read-only");
  const [ro] = await mgmtQuery(
    "select current_user as usr, current_setting('transaction_read_only') as ro",
  );
  if (ro.ro !== "on" || ro.usr === "postgres") {
    console.error(
      `FATAL: production connection is not read-only (user=${ro.usr}, transaction_read_only=${ro.ro}). Aborting before any probe.`,
    );
    process.exit(2);
  }
  console.log(`  ok: user=${ro.usr} transaction_read_only=${ro.ro}`);

  const local = makeLocal();
  let expected, observed;
  try {
    expected = await readSide("local", local.query);
    observed = await readSide("prod", mgmtQuery);
  } finally {
    await local.close();
  }

  const prodLedgerMax = (observed.probes.ledger || [])
    .map((r) => r.version)
    .sort()
    .pop();
  const localLedgerMax = (expected.probes.ledger || [])
    .map((r) => r.version)
    .sort()
    .pop();

  // The tables probe must run first: every other probe's cascade depends on
  // knowing which tables are absent from production and why.
  const tableState = new Map();
  if (expected.probes.tables && observed.probes.tables) {
    const prodTables = new Set(observed.probes.tables.map((t) => t.name));
    for (const t of expected.probes.tables) {
      if (prodTables.has(t.name)) continue;
      const versions = attribute([t.name]);
      const inProd = versions.filter((v) => v <= prodLedgerMax);
      tableState.set(
        t.name,
        versions.length && inProd.length === 0
          ? "expected-branch-ahead"
          : "unexplained-missing",
      );
    }
  }

  const deviations = [];
  const perProbe = {};
  for (const p of PROBES) {
    if (ONLY.length && !ONLY.includes(p.name)) continue;
    const e = expected.probes[p.name];
    const o = observed.probes[p.name];
    if (!e || !o) {
      perProbe[p.name] = {
        status: "uninspectable",
        local: e ? e.length : "uninspectable",
        prod: o ? o.length : "uninspectable",
        reason:
          expected.uninspectable[p.name] || observed.uninspectable[p.name],
      };
      continue;
    }
    const d = diffProbe(p, e, o, prodLedgerMax, tableState);
    deviations.push(...d);
    perProbe[p.name] = {
      status: "compared",
      local: e.length,
      prod: o.length,
      deviations: d.length,
    };
  }

  const byClass = {};
  for (const d of deviations)
    (byClass[d.classification] ||= []).push(d);

  // ------------------------------------------------------------- console out
  console.log(
    `\nexpected = local stack (${LOCAL_URL.replace(/\/\/[^@]*@/, "//***@")}), ledger max ${localLedgerMax}`,
  );
  console.log(
    `observed = production ${PROJECT_REF} via Management API (read_only), ledger max ${prodLedgerMax}\n`,
  );
  const pad = (s, n) => String(s).padEnd(n);
  console.log(pad("probe", 20) + pad("local", 8) + pad("prod", 8) + "deviations");
  for (const [name, s] of Object.entries(perProbe)) {
    console.log(
      pad(name, 20) +
        pad(s.local, 8) +
        pad(s.prod, 8) +
        (s.status === "uninspectable"
          ? `UNINSPECTABLE (${(s.reason || "").slice(0, 60)})`
          : s.deviations),
    );
  }

  console.log("\nclassification");
  for (const k of [
    "unexplained-missing",
    "unexplained-extra",
    "unexplained-mismatch",
    "child-of-unexplained-missing-table",
    "mismatch-touched-by-unapplied-migration",
    "expected-branch-ahead",
    "child-of-branch-ahead-table",
    "allowlisted",
  ])
    console.log(`  ${pad(k, 24)} ${(byClass[k] || []).length}`);

  const unexplained = deviations.filter(
    (d) =>
      d.classification.startsWith("unexplained") ||
      d.classification === "child-of-unexplained-missing-table",
  );
  // Cascade children are consequences of one missing table. Print the table,
  // not its 40 columns.
  const unexplainedTop = unexplained.filter(
    (d) => d.classification !== "child-of-unexplained-missing-table",
  );
  if (unexplained.length) {
    console.log("\nUNEXPLAINED DRIFT");
    for (const d of (VERBOSE ? unexplained : unexplainedTop).slice(0, 80))
      console.log(
        `  [${d.probe}/${d.kind}] ${d.key}\n      ${d.why}` +
          (d.fields ? `\n      local=${JSON.stringify(d.expected)}\n      prod =${JSON.stringify(d.observed)}` : ""),
      );
    if (!VERBOSE)
      console.log(
        `  (+${unexplained.length - unexplainedTop.length} cascaded child objects of the tables above; --verbose to list)`,
      );
  }

  const inv = rlsInvariants(observed);
  console.log("\nproduction RLS invariants (independent of the diff)");
  if (inv.not_computed) console.log(`  NOT COMPUTED: ${inv.not_computed}`);
  else {
  console.log(`  RLS enabled, zero policies : ${inv.rls_enabled_zero_policies.length}`);
  console.log(`  RLS disabled, policies set : ${inv.rls_disabled_but_policies_exist.length}`);
  console.log(`  RLS disabled               : ${inv.rls_disabled.length}`);
  console.log(`  invalid indexes            : ${inv.invalid_indexes.length}`);
  console.log(`  disabled triggers          : ${inv.disabled_triggers.length}`);
  console.log(`  NOT VALID constraints      : ${inv.not_valid_constraints.length}`);
  if (VERBOSE) {
    if (inv.rls_enabled_zero_policies.length)
      console.log(`    ${inv.rls_enabled_zero_policies.join(", ")}`);
    if (inv.rls_disabled.length) console.log(`    off: ${inv.rls_disabled.join(", ")}`);
  }
  }

  if (JSON_OUT) {
    const out = path.resolve(ROOT, JSON_OUT);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(
      out,
      JSON.stringify(
        {
          generated_at: started,
          expected_source: `local ${LOCAL_URL.replace(/\/\/[^@]*@/, "//***@")}`,
          observed_source: `production ${PROJECT_REF} (Management API, read_only)`,
          local_ledger_max: localLedgerMax,
          prod_ledger_max: prodLedgerMax,
          normalization:
            "whitespace collapsed; leading `public.`/`extensions.` qualifiers stripped from every compared value (the two sides deparse with different search_path)",
          attribution_is_heuristic: true,
          probe_notes: Object.fromEntries(
            PROBES.filter((p) => p.note).map((p) => [p.name, p.note]),
          ),
          summary: perProbe,
          counts: Object.fromEntries(
            Object.entries(byClass).map(([k, v]) => [k, v.length]),
          ),
          prod_rls_invariants: inv,
          uninspectable: {
            local: expected.uninspectable,
            prod: observed.uninspectable,
            structural: UNINSPECTABLE,
          },
          // Cascaded children are recorded so the count is auditable, but
          // stripped to their key: 173 columns of 4 branch-ahead tables is
          // noise in a file that is meant to diff.
          deviations: deviations.map((d) =>
            d.classification.startsWith("child-of")
              ? {
                  probe: d.probe,
                  kind: d.kind,
                  key: d.key,
                  classification: d.classification,
                }
              : d,
          ),
        },
        null,
        1,
      ),
    );
    console.log(`\nartifact: ${out}`);
  }

  const fail = unexplained.length > 0;
  console.log(
    `\n${fail ? "DRIFT" : "no unexplained drift"}: ${unexplained.length} unexplained, ${deviations.length} total deviations`,
  );
  process.exit(fail && !NO_FAIL ? 1 : 0);
})().catch((e) => {
  console.error(`FATAL: ${e.message}`);
  process.exit(2);
});
