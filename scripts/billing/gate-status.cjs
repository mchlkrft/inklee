// Read-only activation-gate scoreboard: prints which billing_activation_approvals
// keys are recorded per group (technical < b2b < b2c). Does NOT evaluate live
// mode or version-binding (a recorded key can still be re-closed by a superseded
// artifact); it is a quick "what is recorded" view.
//
//   node scripts/billing/gate-status.cjs
const REQUIRED = {
  technical: ["schema_deployed", "webhook_tested", "reconciliation_tested", "isolation_tested"],
  b2b: [
    "tax_policy_approved",
    "business_declaration_approved",
    "terms_approved",
    "invoice_config_approved",
    "pricing_display_approved",
    "stripe_prod_verified",
    "refund_handling_tested",
  ],
  b2c: [
    "consumer_classification_approved",
    "consumer_withdrawal_copy_approved",
    "withdrawal_function_operational",
    "durable_confirmation_operational",
    "proration_policy_approved",
    "consumer_refund_creditnote_tested",
    "consumer_pricing_display_approved",
  ],
};

const fs = require("fs");
const postgres = require("A:/WORK/inklee/node_modules/postgres/cjs/src/index.js");
const url = fs
  .readFileSync("A:/WORK/inklee/apps/web/.env.local", "utf8")
  .match(/^DATABASE_URL=\"?([^\"\r\n]+)/m)[1];
const sql = postgres(url, { ssl: "require", max: 1, idle_timeout: 8 });

(async () => {
  const rows = await sql`select approval_key, approved from billing_activation_approvals`;
  const have = new Set(rows.filter((r) => r.approved).map((r) => r.approval_key));
  for (const g of ["technical", "b2b", "b2c"]) {
    const done = REQUIRED[g].filter((k) => have.has(k));
    console.log(`\n[${g}] ${done.length}/${REQUIRED[g].length}`);
    for (const k of REQUIRED[g]) console.log(`  ${have.has(k) ? "OK " : "-- "} ${k}`);
  }
  await sql.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
