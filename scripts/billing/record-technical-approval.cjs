// Record the ENGINEERING technical activation keys (BM-2.0). The technical group
// (technical < b2b < b2c) is eng-owned: unlike the accountant/counsel keys, eng
// attests these from committed, passing evidence. They carry NO bound_artifact
// (not version-checked). Recording the technical group opens NOTHING on its own:
// a live charge still needs the full b2b/b2c keys + a live Price + live mode.
//
//   node scripts/billing/record-technical-approval.cjs            # DRY RUN
//   node scripts/billing/record-technical-approval.cjs --apply    # write
//
// Refuses to --apply unless TECHNICAL_VERIFIED is true and every key has
// non-empty evidence. Idempotent (upsert per key).
//
// Evidence is committed on master:
//   - schema_deployed        migrations 0105-0108 applied + verified in prod
//   - webhook_tested         billing-webhook.test.ts (route signature + routing + 500-on-fail)
//   - reconciliation_tested  reconcile.test.ts (converge/guard, orphan, grandfather restore, stale, duplicate)
//   - isolation_tested       billing.test.ts section 6 (deposit/subscription isolation)
const TECHNICAL_VERIFIED = true;
const approvedBy = "Engineering (Claude Code)";
const KEYS = [
  {
    key: "schema_deployed",
    evidence:
      "Migrations 0105-0108 applied + verified in prod (billing tables, grandfather cols, event-ordering guard, tax-posture model + tax_thresholds).",
  },
  {
    key: "webhook_tested",
    evidence:
      "apps/web/src/lib/server/billing/__tests__/billing-webhook.test.ts (7 tests): signature gating, subscription+invoice routing to converge-to-target reconcile with event.created, unknown-event ack, 500-on-failure.",
  },
  {
    key: "reconciliation_tested",
    evidence:
      "apps/web/src/lib/server/billing/__tests__/reconcile.test.ts (5 tests): guardedUpsert convergence, orphan stop, active->paid, canceled->grandfather restore (anchor preserved, admin merge), stale-skip, duplicate flag.",
  },
  {
    key: "isolation_tested",
    evidence:
      "apps/web/src/lib/__tests__/billing.test.ts section 6: deposit vs subscription isolation (disjoint metadata namespace, never booking_id).",
  },
];

const fs = require("fs");
const postgres = require("A:/WORK/inklee/node_modules/postgres/cjs/src/index.js");
const APPLY = process.argv.includes("--apply");
const url = fs
  .readFileSync("A:/WORK/inklee/apps/web/.env.local", "utf8")
  .match(/^DATABASE_URL=\"?([^\"\r\n]+)/m)[1];
const sql = postgres(url, { ssl: "require", max: 1, idle_timeout: 8 });

(async () => {
  const now = new Date().toISOString();
  console.log(`=== record technical keys ${APPLY ? "(APPLY)" : "(DRY RUN)"} ===`);
  for (const k of KEYS) console.log("  " + k.key + " <- " + k.evidence.slice(0, 70) + "...");
  console.log("group: technical (opens nothing on its own).");

  if (!APPLY) {
    console.log("\nDRY RUN. Re-run with --apply to record.");
    await sql.end();
    return;
  }
  const bad = KEYS.filter((k) => !String(k.evidence || "").trim());
  if (TECHNICAL_VERIFIED !== true || !approvedBy.trim() || bad.length) {
    console.error("\nREFUSING: TECHNICAL_VERIFIED + approvedBy + non-empty evidence per key required.");
    process.exit(2);
  }

  await sql.begin(async (tx) => {
    for (const k of KEYS) {
      await tx`
        insert into billing_activation_approvals
          (approval_key, approval_group, approved, approved_by, approved_at, evidence_ref, notes, updated_at)
        values
          (${k.key}, 'technical', true, ${approvedBy}, ${now}, ${k.evidence},
           'Eng-attested technical key.', ${now})
        on conflict (approval_key) do update set
          approved = true, approved_by = ${approvedBy}, approved_at = ${now},
          evidence_ref = ${k.evidence}, updated_at = ${now}`;
    }
  });

  console.log("\nAPPLIED: technical keys recorded. Live billing stays off (b2b/b2c keys + a live Price still required).");
  await sql.end();
})().catch(async (e) => {
  console.error("error:", e.message);
  try { await sql.end(); } catch {}
  process.exit(1);
});
