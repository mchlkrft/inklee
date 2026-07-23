// legacy_free_v1 grandfather backfill (BM-2.0 Stage 2). Tags the launch-cutover
// Free cohort so entitlement enforcement never breaks an existing free artist.
//
//   node scripts/entitlements/backfill-legacy-free.cjs            # DRY RUN
//   node scripts/entitlements/backfill-legacy-free.cjs --apply    # write
//
// Eligibility (per docs/product/account-tier-stage-2-plan.md section 4/6):
// active, non-tester, non-admin artist accounts created before the cutover with
// no active Plus grant. The cohort keeps custom-template EDITING and any
// per-limit count that EXCEEDS the Free cap (grant_package). branding/analytics
// are NOT grandfathered. Idempotent: skips accounts already tagged legacy_free_v1
// and MERGES the grant under any existing (admin) overrides.
const fs = require("fs");
const postgres = require("A:/WORK/inklee/node_modules/postgres/cjs/src/index.js");

const APPLY = process.argv.includes("--apply");
const FREE = { custom_fields: 3, active_trips: 3, studio_library: 5 };
const POLICY = "legacy_free_v1";
// Admins are excluded in the app layer (ADMIN_EMAILS). We also exclude their
// +aliases (same local-part before '+', same domain) so a founder test account
// is never grandfathered.
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "michel.kraeft@gmail.com")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
const adminKey = (email) => {
  const [local, domain] = email.toLowerCase().split("@");
  return `${(local || "").split("+")[0]}@${domain || ""}`;
};
const ADMIN_KEYS = new Set(ADMIN_EMAILS.map(adminKey));

const url = fs
  .readFileSync("A:/WORK/inklee/apps/web/.env.local", "utf8")
  .match(/^DATABASE_URL=\"?([^\"\r\n]+)/m)[1];
const sql = postgres(url, { ssl: "require", max: 1, idle_timeout: 8 });

function computeGrant(counts) {
  const limits = {};
  for (const key of Object.keys(FREE)) {
    if ((counts[key] ?? 0) > FREE[key]) limits[key] = counts[key];
  }
  return { features: { custom_templates: true }, limits };
}

(async () => {
  const cutover = new Date().toISOString();
  const today = cutover.slice(0, 10);

  // Effective-free, active, non-tester, created before cutover, not already tagged.
  const candidates = await sql`
    select p.id, p.slug, u.email, o.entitlement_overrides, o.limit_overrides,
           o.plan_source, o.policy_id
    from profiles p
    join auth.users u on u.id = p.id
    left join account_overrides o on o.artist_id = p.id
    where p.account_status = 'active'
      and p.is_tester = false
      and p.created_at < ${cutover}
      and (o.artist_id is null or o.plan_tier <> 'plus'
           or (o.plan_expires_at is not null and o.plan_expires_at <= now()))`;

  const eligible = candidates.filter(
    (r) =>
      !ADMIN_KEYS.has(adminKey(r.email)) && r.policy_id !== POLICY,
  );
  const skippedAdmin = candidates.filter((r) => ADMIN_KEYS.has(adminKey(r.email)));
  const alreadyTagged = candidates.filter((r) => r.policy_id === POLICY);

  console.log(`=== legacy_free_v1 backfill ${APPLY ? "(APPLY)" : "(DRY RUN)"} ===`);
  console.log("cutover:", cutover);
  console.log(
    `candidates: ${candidates.length} | eligible: ${eligible.length} | excluded-admin/alias: ${skippedAdmin.length} | already-tagged: ${alreadyTagged.length}`,
  );
  if (skippedAdmin.length)
    console.log("  excluded (admin/alias):", skippedAdmin.map((r) => r.email).join(", "));

  let wrote = 0;
  for (const r of eligible) {
    const [cf, at, sl] = await Promise.all([
      sql`select count(*)::int n from custom_fields where artist_id=${r.id} and deleted_at is null`,
      sql`select count(distinct t.id)::int n from trips t join trip_legs l on l.trip_id=t.id where t.artist_id=${r.id} and l.ends_on >= ${today}`,
      sql`select count(*)::int n from studios where artist_id=${r.id}`,
    ]);
    const counts = {
      custom_fields: cf[0].n,
      active_trips: at[0].n,
      studio_library: sl[0].n,
    };
    const grant = computeGrant(counts);
    // Merge grant under any existing (admin) overrides — admin decisions win.
    const ent = { ...grant.features, ...(r.entitlement_overrides || {}) };
    const lim = { ...grant.limits, ...(r.limit_overrides || {}) };

    console.log(
      `  ${r.email} (${r.slug}): counts=${JSON.stringify(counts)} grant.limits=${JSON.stringify(grant.limits)} -> ent=${JSON.stringify(ent)}`,
    );

    if (APPLY) {
      await sql`
        insert into account_overrides
          (artist_id, plan_tier, plan_source, policy_id, granted_at, cutover_ts,
           grant_reason, grant_package, entitlement_overrides, limit_overrides, updated_at)
        values
          (${r.id}, 'free', 'grandfathered', ${POLICY}, ${cutover}, ${cutover},
           'launch cutover backfill', ${sql.json(grant)}, ${sql.json(ent)}, ${sql.json(lim)}, ${cutover})
        on conflict (artist_id) do update set
          plan_source = 'grandfathered',
          policy_id = ${POLICY},
          granted_at = ${cutover},
          cutover_ts = ${cutover},
          grant_reason = 'launch cutover backfill',
          grant_package = ${sql.json(grant)},
          entitlement_overrides = ${sql.json(ent)},
          limit_overrides = ${sql.json(lim)},
          updated_at = ${cutover}`;
      wrote++;
    }
  }
  console.log(APPLY ? `\nAPPLIED: tagged ${wrote} account(s).` : `\nDRY RUN: would tag ${eligible.length} account(s). Re-run with --apply.`);
  await sql.end();
})().catch(async (e) => {
  console.error("backfill error:", e.message);
  try { await sql.end(); } catch {}
  process.exit(1);
});
