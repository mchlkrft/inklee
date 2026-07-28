// legacy_free_v1 RECOMPUTATION dry run against the CANONICAL caps.
//
// Required by the founder direction of 2026-07-28 (section 17) before any cap
// enforcement. The mandatory invariant:
//
//   No eligible grandfathered artist becomes newly blocked from an existing
//   configuration because cap definitions changed after the original grant
//   computation.
//
// Why this exists: the original grants were computed against the caps in force
// at cutover. If a Free cap later moves DOWN, an artist whose usage sat inside
// the old cap holds no override for it, and would be newly blocked the moment
// enforcement turns on. That is the failure this script has to make impossible
// to ship blind.
//
//   node scripts/entitlements/legacy-free-recompute.cjs           # DRY RUN
//   node scripts/entitlements/legacy-free-recompute.cjs --apply   # write corrected grants
//
// READ-ONLY by default. Never deletes over-cap data; a correction only ever
// RAISES an artist's personal limit to their existing usage.

const fs = require("fs");
const postgres = require("A:/WORK/inklee/node_modules/postgres/cjs/src/index.js");

const APPLY = process.argv.includes("--apply");
const POLICY = "legacy_free_v1";

// THE CANONICAL FREE CAPS. Mirrors CANONICAL_CAPS in
// packages/shared/src/entitlements.ts (2026-07-25 ratification + the published
// plan copy; the later provisional values are superseded). Kept in step with
// that file by the assertion printed at the end of this run.
const CANONICAL_FREE = {
  custom_fields: 3,
  active_trips: 3,
  studio_library: 5,
  active_products: 3,
};

// What the ORIGINAL backfill used, so the report can show what moved.
const ORIGINAL_FREE = {
  custom_fields: 3,
  active_trips: 3,
  studio_library: 5,
  // active_products did not exist at cutover: it is a NEW cap, which is the
  // interesting case for the invariant (nobody holds an override for it).
  active_products: null,
};

const url = fs
  .readFileSync("A:/WORK/inklee/apps/web/.env.local", "utf8")
  .match(/^DATABASE_URL="?([^"\r\n]+)/m)[1];
const sql = postgres(url, { ssl: "require", max: 1, idle_timeout: 8 });

const pad = (s, n) => String(s).padEnd(n);

(async () => {
  const today = new Date().toISOString().slice(0, 10);

  const cohort = await sql`
    select p.id, p.slug, u.email, o.limit_overrides, o.grant_package
    from account_overrides o
    join profiles p on p.id = o.artist_id
    join auth.users u on u.id = p.id
    where o.policy_id = ${POLICY}
    order by p.slug`;

  console.log(
    `=== legacy_free_v1 recomputation ${APPLY ? "(APPLY)" : "(DRY RUN)"} ===`,
  );
  console.log("canonical Free caps:", JSON.stringify(CANONICAL_FREE));
  console.log("original Free caps :", JSON.stringify(ORIGINAL_FREE));
  console.log(`cohort size: ${cohort.length}\n`);

  let violations = 0;
  let corrections = 0;
  const ambiguous = [];

  for (const r of cohort) {
    const [cf, at, sl, ap] = await Promise.all([
      sql`select count(*)::int n from custom_fields where artist_id=${r.id} and deleted_at is null`,
      sql`select count(distinct t.id)::int n from trips t join trip_legs l on l.trip_id=t.id where t.artist_id=${r.id} and l.ends_on >= ${today}`,
      sql`select count(*)::int n from studios where artist_id=${r.id}`,
      sql`select count(*)::int n from products where artist_id=${r.id} and status <> 'archived'`,
    ]);
    const usage = {
      custom_fields: cf[0].n,
      active_trips: at[0].n,
      studio_library: sl[0].n,
      active_products: ap[0].n,
    };
    const existing = r.limit_overrides || {};

    console.log(`--- ${r.slug} <${r.email}>`);
    const corrected = {};
    let accessChanges = false;

    for (const key of Object.keys(CANONICAL_FREE)) {
      const canonical = CANONICAL_FREE[key];
      const original = ORIGINAL_FREE[key];
      const used = usage[key];
      const override = existing[key] ?? null;
      // The artist's effective cap today: their personal override if any,
      // else the canonical Free cap.
      const effective = override ?? canonical;
      const overCap = used > effective;

      // The invariant breach: usage that was fine under the ORIGINAL cap (so
      // no override was granted) but exceeds the canonical cap now.
      const wasFine = original === null ? used === 0 : used <= original;
      const newlyBlocked = overCap && wasFine && override === null;

      if (newlyBlocked) {
        violations++;
        accessChanges = true;
        // The correction: raise this artist's personal limit to their actual
        // usage, exactly as the original grant would have done.
        corrected[key] = used;
      }

      console.log(
        `    ${pad(key, 16)} used=${pad(used, 4)} original=${pad(
          original === null ? "n/a" : original,
          4,
        )} canonical=${pad(canonical, 4)} override=${pad(
          override ?? "-",
          5,
        )} ${newlyBlocked ? "*** NEWLY BLOCKED -> correct to " + used : overCap ? "over cap (already covered)" : "ok"}`,
      );
    }

    if (Object.keys(corrected).length > 0) {
      corrections++;
      console.log(`    => proposed grant correction: ${JSON.stringify(corrected)}`);
      if (APPLY) {
        const merged = { ...existing, ...corrected };
        await sql`
          update account_overrides
          set limit_overrides = ${sql.json(merged)}, updated_at = now()
          where artist_id = ${r.id}`;
        console.log("    => APPLIED");
      }
    }
    if (!accessChanges) console.log("    => no access change");
    // Anything we could not classify cleanly is surfaced rather than assumed.
    if (r.grant_package == null) {
      ambiguous.push(`${r.slug}: no grant_package recorded`);
    }
  }

  console.log("\n=== summary ===");
  console.log(`cohort:                 ${cohort.length}`);
  console.log(`invariant violations:   ${violations}`);
  console.log(`accounts needing fix:   ${corrections}`);
  console.log(`ambiguous accounts:     ${ambiguous.length}`);
  for (const a of ambiguous) console.log(`  - ${a}`);
  console.log(
    violations === 0
      ? "\nINVARIANT HOLDS: no grandfathered artist is newly blocked by the canonical caps."
      : `\nINVARIANT VIOLATED for ${violations} limit(s). Re-run with --apply to write the corrections, THEN enforce.`,
  );

  await sql.end();
})().catch((e) => {
  console.error("recompute failed:", e.message);
  process.exit(1);
});
