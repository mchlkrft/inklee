// Validate docs/audit/findings.yaml against findings.schema.json plus the
// governance rules the schema cannot express.
//
//   node scripts/audit/validate.cjs        (pnpm audit:validate)
//
// Read-only. Exits 1 on any violation.

const { validate } = require("./lib.cjs");

const { ok, errors, data } = validate();

if (!ok) {
  console.error(`\naudit:validate FAILED with ${errors.length} problem(s):\n`);
  for (const e of errors) console.error(`  - ${e}`);
  console.error("\nThe register is the evidence record for a later independent audit.");
  console.error("An invalid ledger is worse than none, because it looks authoritative.\n");
  process.exit(1);
}

const f = data.findings.length;
const p = data.patterns.length;
const c = data.coverage.length;
const uninspected = data.coverage.filter((x) => x.coverage === "none").length;
const unverified = data.findings.filter((x) => x.verification.status !== "passed").length;

console.log(`audit:validate OK - ${f} finding(s), ${p} pattern(s), ${c} coverage area(s).`);
console.log(`  ${unverified} finding(s) not independently verified, ${uninspected} area(s) never inspected.`);
console.log("  Neither number is a defect. Both are the point: they are the map of what is not known.");
