// Record refund_handling_tested (b2b, eng-owned) under the COVERED-BY-RECONCILE
// posture (founder decision 2026-07-23). There is no bespoke in-app subscription
// refund/credit-note handler: B2B subscription refunds flow through Stripe and
// surface as subscription-status changes that reconcile converges to a target;
// deposit-side refunds are isolated from the billing webhook. Both are tested.
//
//   node scripts/billing/record-refund-handling.cjs            # DRY RUN
//   node scripts/billing/record-refund-handling.cjs --apply    # write
//
// Opens nothing on its own (b2b needs all its keys + a live Price + live mode).
const VERIFIED = true;
const approvedBy = "Engineering (Claude Code)";
const evidence =
  "Covered-by-reconcile (founder decision 2026-07-23): access follows subscription status via reconcile " +
  "(reconcile.test.ts unpaid->free), and deposit charge.refunded is isolated from the billing webhook " +
  "(billing-webhook.test.ts). No bespoke in-app subscription refund handler by design.";

const fs = require("fs");
const postgres = require("A:/WORK/inklee/node_modules/postgres/cjs/src/index.js");
const APPLY = process.argv.includes("--apply");
const url = fs
  .readFileSync("A:/WORK/inklee/apps/web/.env.local", "utf8")
  .match(/^DATABASE_URL=\"?([^\"\r\n]+)/m)[1];
const sql = postgres(url, { ssl: "require", max: 1, idle_timeout: 8 });

(async () => {
  const now = new Date().toISOString();
  console.log(`=== record refund_handling_tested ${APPLY ? "(APPLY)" : "(DRY RUN)"} ===`);
  console.log("posture: covered-by-reconcile |", evidence.slice(0, 80) + "...");
  if (!APPLY) {
    console.log("\nDRY RUN. Re-run with --apply to record.");
    await sql.end();
    return;
  }
  if (VERIFIED !== true || !approvedBy.trim() || !evidence.trim()) {
    console.error("\nREFUSING: VERIFIED + approvedBy + evidence required.");
    process.exit(2);
  }
  await sql`
    insert into billing_activation_approvals
      (approval_key, approval_group, approved, approved_by, approved_at, evidence_ref, notes, updated_at)
    values
      ('refund_handling_tested', 'b2b', true, ${approvedBy}, ${now}, ${evidence},
       'Covered-by-reconcile posture.', ${now})
    on conflict (approval_key) do update set
      approved = true, approved_by = ${approvedBy}, approved_at = ${now},
      evidence_ref = ${evidence}, updated_at = ${now}`;
  console.log("\nAPPLIED: refund_handling_tested recorded. Live billing stays off (other b2b/b2c keys + a live Price still required).");
  await sql.end();
})().catch(async (e) => {
  console.error("error:", e.message);
  try { await sql.end(); } catch {}
  process.exit(1);
});
