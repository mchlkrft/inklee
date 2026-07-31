// Emergency sales kill-switch: revokes both launch keys so no new consumer or
// business subscription can be created. Existing subscribers keep service and
// can cancel/withdraw normally (the statutory paths never assert the gate).
//
// The activation gate is fail-closed: setting approved=false on the launch keys
// causes assertSalesLaunchApproved to throw, which createSubscriptionCheckout
// calls before any Stripe object exists. The UI flag (PLUS_CONSUMER_LAUNCH_ENABLED)
// is visibility only; this gate is what keeps live money off.
//
//   node scripts/billing/close-sales.cjs            # DRY RUN (reads current state)
//   node scripts/billing/close-sales.cjs --apply    # revoke both launch keys
//
// To reopen: use record-approval.cjs with the appropriate key, evidence, and
// APPROVED=true. This script only closes; reopening requires the same deliberate
// evidence trail as the original approval.

"use strict";

const LAUNCH_KEYS = [
  "consumer_sales_launch_approved",
  "business_sales_launch_approved",
];

const { requireFromRepo, requireDatabaseUrl } = require("../lib/repo-root.cjs");
const postgres = requireFromRepo("postgres");
const APPLY = process.argv.includes("--apply");
const url = requireDatabaseUrl();
const sql = postgres(url, { ssl: "require", max: 1, idle_timeout: 8 });

(async () => {
  const rows = await sql`
    select approval_key, approved, approved_by, approved_at
    from billing_activation_approvals
    where approval_key = any(${LAUNCH_KEYS})`;

  console.log(`\n=== close-sales ${APPLY ? "(APPLY)" : "(DRY RUN)"} ===\n`);
  console.log("Current state:");
  for (const k of LAUNCH_KEYS) {
    const row = rows.find((r) => r.approval_key === k);
    if (!row) {
      console.log(`  ${k}: not recorded (already closed)`);
    } else {
      console.log(`  ${k}: approved=${row.approved} by=${row.approved_by || "-"} at=${row.approved_at || "-"}`);
    }
  }

  const open = rows.filter((r) => r.approved);
  if (open.length === 0) {
    console.log("\nBoth launch keys are already closed. Nothing to do.");
    await sql.end();
    return;
  }

  if (!APPLY) {
    console.log(`\nDRY RUN. ${open.length} key(s) would be revoked. Pass --apply to execute.`);
    await sql.end();
    return;
  }

  const now = new Date().toISOString();
  const revoked = await sql`
    update billing_activation_approvals
    set approved = false,
        notes = coalesce(notes, '') || ${`\nRevoked by close-sales.cjs at ${now}`},
        updated_at = ${now}
    where approval_key = any(${LAUNCH_KEYS})
      and approved = true
    returning approval_key`;

  console.log(`\nRevoked ${revoked.length} key(s):`);
  for (const r of revoked) console.log(`  ${r.approval_key}`);
  console.log("\nNew subscriptions are now blocked. Existing subscribers are unaffected.");
  console.log("To reopen: use record-approval.cjs with APPROVED=true, evidence, and the key.");

  await sql.end();
})().catch(async (e) => {
  console.error("error:", e.message);
  try { await sql.end(); } catch {}
  process.exit(1);
});
