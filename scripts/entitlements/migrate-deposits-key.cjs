// Migrate entitlement overrides from the broad `deposits` key to the fine
// `card_deposit_collection` key. The code now checks `card_deposit_collection`
// for card deposit entitlement; any account with a manual `deposits: true`
// override needs `card_deposit_collection: true` added to preserve access.
//
//   node scripts/entitlements/migrate-deposits-key.cjs           # DRY RUN
//   node scripts/entitlements/migrate-deposits-key.cjs --apply   # write
//
// Idempotent: skips accounts that already have card_deposit_collection set.
// Never removes the `deposits` key (backward compat with admin overrides).

"use strict";

const { requireFromRepo, requireDatabaseUrl } = require("../lib/repo-root.cjs");
const postgres = requireFromRepo("postgres");

const APPLY = process.argv.includes("--apply");
const url = requireDatabaseUrl();
const sql = postgres(url, { ssl: "require", max: 1, idle_timeout: 8 });

(async () => {
  console.log(
    `\n=== migrate-deposits-key ${APPLY ? "(APPLY)" : "(DRY RUN)"} ===\n`,
  );

  const rows = await sql`
    select o.artist_id, p.slug, o.entitlement_overrides
    from account_overrides o
    join profiles p on p.id = o.artist_id
    where (o.entitlement_overrides->>'deposits')::boolean = true
    order by p.slug`;

  console.log(`Accounts with deposits=true in overrides: ${rows.length}\n`);

  let migrated = 0;
  let skipped = 0;

  for (const r of rows) {
    const eo = r.entitlement_overrides || {};
    const alreadyHas = eo.card_deposit_collection === true;

    if (alreadyHas) {
      console.log(`  ${r.slug}: already has card_deposit_collection=true, skip`);
      skipped++;
      continue;
    }

    const updated = { ...eo, card_deposit_collection: true };
    console.log(`  ${r.slug}: adding card_deposit_collection=true`);

    if (APPLY) {
      await sql`
        update account_overrides
        set entitlement_overrides = ${sql.json(updated)}, updated_at = now()
        where artist_id = ${r.artist_id}`;
      console.log(`    => APPLIED`);
    }
    migrated++;
  }

  console.log(`\n=== summary ===`);
  console.log(`total with deposits=true: ${rows.length}`);
  console.log(`migrated: ${migrated}`);
  console.log(`skipped (already has fine key): ${skipped}`);

  if (!APPLY && migrated > 0) {
    console.log(`\nDRY RUN. Re-run with --apply to write the changes.`);
  }

  await sql.end();
})().catch(async (e) => {
  console.error("error:", e.message);
  try {
    await sql.end();
  } catch {}
  process.exit(1);
});
