// Record counsel's confirmed legal determinations (BM-2.0), per
// docs/legal/counsel-decision-pack.md (counsel review 2026-07-23). Writes, in one
// transaction:
//   1. billing_legal_policies service_classification (C1) = digital service /
//      immediate performance with surviving withdrawal right.
//   2. billing_legal_policies withdrawal_policy (C4) = the decided withdrawal
//      policy (survives; time-based proration; Article 11a online function
//      required). This is the POLICY value; the gate key
//      consumer_withdrawal_copy_approved is NOT recorded here because it has an
//      unmet build precondition (the Article 11a-conformant withdrawal function).
//   3. billing_activation_approvals consumer_classification_approved (b2c), bound
//      to the service_classification version. This gate key IS settled (a legal
//      determination the machinery already reflects) and safe to record; it opens
//      nothing on its own (the b2c gate needs all its keys + a live Price).
//
//   node scripts/billing/record-legal-approval.cjs            # DRY RUN
//   node scripts/billing/record-legal-approval.cjs --apply    # write
//
// Refuses to --apply unless COUNSEL_CONFIRMED and approvedBy + at least one
// evidenceReference are set. Idempotent; prior policy rows stay as audit
// (is_current=false).
//
// NOT recorded here (open build preconditions, see the counsel pack):
//   - terms_approved            : Terms must include the C5 disclosures + the
//                                 "Order with obligation to pay" button.
//   - business_declaration_approved : the declaration control (C3 wording) must
//                                 exist at B2B checkout.
//   - consumer_withdrawal_copy_approved : the Article 11a withdrawal function
//                                 must be built + the strings aligned.
const CLASSIFICATION_VERSION = "service-classification-2026-07-23";
const WITHDRAWAL_VERSION = "withdrawal-policy-2026-07-23";
const COUNSEL_CONFIRMED = true; // counsel confirmed in counsel-decision-pack.md 2026-07-23
const approvedBy = "Legal counsel (per counsel-decision-pack.md, 2026-07-23)";
const evidenceReferences = [
  "docs/legal/counsel-decision-pack.md (Answers, 2026-07-23)",
  "CJEU C-234/25 (9 July 2026)",
  "Directive (EU) 2023/2673, Art. 11a CRD (applicable 19 June 2026)",
];

const CLASSIFICATION_VALUE = {
  classification: "digital_service",
  digital_content_exception_available: false, // Art. 16(m) CRD not available
  withdrawal_extinguished_on_immediate_performance: false,
  withdrawal_lost_reachable: false, // Art. 16(a) full performance not reached in a monthly window
  proportionate_amount_on_withdrawal: true, // Art. 14(3) CRD
  basis: "Consumer Rights Directive (EE implementation); CJEU C-234/25; Recital 30 Dir (EU) 2019/2161",
};
const WITHDRAWAL_VALUE = {
  withdrawal_survives_immediate_performance: true,
  proration_method: "time_based_preserve_original_tax",
  online_withdrawal_function_required: true, // Art. 11a CRD
  withdrawal_function_label: "withdraw from contract here",
  as_easy_as_signup: true,
  cancellation_parity: true, // C10
  withdrawal_lost_reachable: false,
};

const fs = require("fs");
const postgres = require("A:/WORK/inklee/node_modules/postgres/cjs/src/index.js");
const APPLY = process.argv.includes("--apply");
const url = fs
  .readFileSync("A:/WORK/inklee/apps/web/.env.local", "utf8")
  .match(/^DATABASE_URL=\"?([^\"\r\n]+)/m)[1];
const sql = postgres(url, { ssl: "require", max: 1, idle_timeout: 8 });

(async () => {
  const now = new Date().toISOString();
  const evidence = evidenceReferences.map((s) => String(s).trim()).filter(Boolean);
  console.log(`=== record legal determinations ${APPLY ? "(APPLY)" : "(DRY RUN)"} ===`);
  console.log("service_classification:", CLASSIFICATION_VERSION, JSON.stringify(CLASSIFICATION_VALUE));
  console.log("withdrawal_policy:", WITHDRAWAL_VERSION, JSON.stringify(WITHDRAWAL_VALUE));
  console.log("activation: consumer_classification_approved (b2c) bound_artifact=" + CLASSIFICATION_VERSION);
  console.log("NOT recorded (preconditions): terms_approved, business_declaration_approved, consumer_withdrawal_copy_approved");

  if (!APPLY) {
    console.log("\nDRY RUN. Re-run with --apply to record.");
    await sql.end();
    return;
  }
  if (COUNSEL_CONFIRMED !== true || !approvedBy.trim() || evidence.length === 0) {
    console.error("\nREFUSING: COUNSEL_CONFIRMED + approvedBy + >=1 evidence required.");
    process.exit(2);
  }

  await sql.begin(async (tx) => {
    // service_classification (C1)
    await tx`update billing_legal_policies set is_current = false where policy_kind = 'service_classification' and is_current = true`;
    await tx`
      insert into billing_legal_policies
        (policy_kind, version_label, value, effective_from, is_current, approved_by, approved_at, counsel_ref, notes)
      values
        ('service_classification', ${CLASSIFICATION_VERSION}, ${sql.json(CLASSIFICATION_VALUE)}, ${now}, true,
         ${approvedBy}, ${now}, ${evidence.join("; ")}, 'Digital service; withdrawal survives (C1).')`;

    // withdrawal_policy (C4) - policy value; gate key waits on the Art. 11a function.
    await tx`update billing_legal_policies set is_current = false where policy_kind = 'withdrawal_policy' and is_current = true`;
    await tx`
      insert into billing_legal_policies
        (policy_kind, version_label, value, effective_from, is_current, approved_by, approved_at, counsel_ref, notes)
      values
        ('withdrawal_policy', ${WITHDRAWAL_VERSION}, ${sql.json(WITHDRAWAL_VALUE)}, ${now}, true,
         ${approvedBy}, ${now}, ${evidence.join("; ")}, 'Art. 11a function required before consumer_withdrawal_copy_approved (C4).')`;

    // consumer_classification_approved (settled; opens nothing on its own).
    await tx`
      insert into billing_activation_approvals
        (approval_key, approval_group, approved, approved_by, approved_at, evidence_ref, bound_artifact, notes, updated_at)
      values
        ('consumer_classification_approved', 'b2c', true, ${approvedBy}, ${now}, ${evidence.join("; ")},
         ${CLASSIFICATION_VERSION}, 'Inklee Plus is a digital service (C1).', ${now})
      on conflict (approval_key) do update set
        approved = true, approved_by = ${approvedBy}, approved_at = ${now},
        evidence_ref = ${evidence.join("; ")}, bound_artifact = ${CLASSIFICATION_VERSION}, updated_at = ${now}`;
  });

  console.log("\nAPPLIED: classification + withdrawal policy recorded; consumer_classification_approved set.");
  console.log("The consumer gate still needs the other b2c keys + a live Price; live billing is not enabled.");
  await sql.end();
})().catch(async (e) => {
  console.error("error:", e.message);
  try { await sql.end(); } catch {}
  process.exit(1);
});
