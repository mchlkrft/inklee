// Scaffold a correctly-shaped register entry with the next free ID.
//
//   node scripts/audit/new.cjs AUTH-RLS          -> a finding skeleton
//   node scripts/audit/new.cjs --coverage        -> a coverage-row skeleton
//   node scripts/audit/new.cjs --pattern         -> a pattern skeleton
//
// Prints to stdout for you to paste into docs/audit/findings.yaml. It does NOT
// append: a script that edits the ledger unattended is a script that will
// corrupt it, and this file is the evidence record.
//
// This exists because the register is MANDATORY (AGENTS.md) and friction is the
// only thing that reliably defeats a mandatory process. The coverage skeleton
// matters most: an audit that found nothing still has to record that it looked.

const { validate } = require("./lib.cjs");

const args = process.argv.slice(2);
const { ok, errors, data } = validate();
if (!ok) {
  console.error("The ledger is currently invalid, so the next free ID cannot be trusted.");
  for (const e of errors.slice(0, 5)) console.error(`  - ${e}`);
  process.exit(1);
}

if (args.includes("--coverage")) {
  console.log(`
  # Paste under 'coverage:'. Required after ANY audit, INCLUDING one that found
  # nothing. 'none' means not inspected and is never a safety claim.
  - area: "<e.g. database>"
    subsystem: "<e.g. storage bucket policies>"
    coverage: "initial"            # none | initial | partial | substantial | comprehensive
    review_type: "adversarial-verification"
    last_inspected: "${new Date().toISOString().slice(0, 10)}"
    commit_inspected: "<short sha>"
    reviewer: "<role, not a person>"
    evidence: "<what justifies this level: the command you ran, the files you read>"
    changed_since_inspection: "unknown"
    findings_produced: []          # IDs, or [] if the area was clean
    known_exclusions: "<what you deliberately did NOT cover>"
    recommended_next_inspection: "<what the next pass should do>"
`);
  process.exit(0);
}

if (args.includes("--pattern")) {
  const n = data.patterns.length + 1;
  const id = `PAT-${String(n).padStart(3, "0")}`;
  console.log(`
  # Paste under 'patterns:'. A pattern needs REPEATED EVIDENCE or a strong
  # architectural relationship. Two findings sharing a category is not a pattern.
  - id: "${id}"
    title: "<what recurs>"
    description: "<the shape of it>"
    related_findings: ["<ID>", "<ID>"]   # at least two, and they must exist
    affected_domains: []
    first_observed: "unknown"
    last_observed: "unknown"
    recurrence_count: 2
    shared_root_cause_hypothesis: "<a HYPOTHESIS; it may be wrong>"
    supporting_evidence: ["<citation>"]
    contradicting_evidence: "<what limits this pattern; required thinking>"
    inspected_without_pattern: []        # comparables checked where it did NOT appear
    uninspected_comparables: []          # comparables nobody has looked at
    systemic_assessment: "cluster"       # systemic | likely-systemic | cluster | isolated | undetermined
    confidence: "medium"
    auditor_sampling_targets: []
    engineering_followup: []
    status: "active"
`);
  process.exit(0);
}

const hint = (args[0] || "AREA-SUB").toUpperCase();
const m = hint.match(/^([A-Z]{2,6})-([A-Z]{2,6})$/);
if (!m) {
  console.error("Usage: node scripts/audit/new.cjs DOMAIN-SUBDOMAIN   (e.g. AUTH-RLS)");
  console.error("       node scripts/audit/new.cjs --coverage | --pattern");
  process.exit(1);
}
const prefix = `${m[1]}-${m[2]}`;
const used = data.findings.map((f) => f.id).filter((id) => id.startsWith(`${prefix}-`))
  .map((id) => parseInt(id.slice(-3), 10)).filter(Number.isInteger);
const next = String((used.length ? Math.max(...used) : 0) + 1).padStart(3, "0");

console.log(`
  # Paste under 'findings:'. IDs are never reused, so ${prefix}-${next} is yours
  # even if you later close it. Delete the fields that do not apply, but do NOT
  # delete remaining_uncertainty: a finding with no stated uncertainty is
  # usually one that has not been examined hard enough.
  - id: "${prefix}-${next}"
    title: "<one line, specific>"
    summary: "<what is wrong, in a few sentences>"
    classification:
      domain: "<see findings.schema.json for allowed values>"
      category: "<see findings.schema.json>"
      severity: "medium"        # critical | high | medium | low | informational
      confidence: "high"        # 'confirmed' REQUIRES observed_facts AND a reproduction
    discovery:
      detected_at: "${new Date().toISOString().slice(0, 10)}"
      detected_by: "<role or process, not a person>"
      repository: "mchlkrft/inklee"
      branch: "master"
      commit: "<short sha you observed this at>"
      environment: "local"      # local | ci | preview | production | repository-only | unknown
      discovery_context: "<what you were doing when you found it>"
    location:
      files: []
      symbols: []
      database_objects: []
    evidence:
      observed_facts:
        - "<FACT ONLY: file:line, command output, catalog read. No interpretation.>"
      references: []
      reproduction: "<how to reproduce; reference a test, do not write an exploit>"
      contradictory_evidence: "<evidence AGAINST this. Retained, never deleted.>"
      inspected_comparables_without_issue: []
    assessment:
      interpretation: "<what the facts MEAN. Not a fact.>"
      root_cause_hypothesis: "<a HYPOTHESIS. May be wrong.>"
      reachability: "unknown"   # directly-reachable | conditionally-reachable | currently-unreachable | unknown
      impact_status: "unknown"  # actively-impacting | historically-impacting | reachable-no-known-impact | latent | theoretical | unknown
      production_exposure: "<what you established about production, and what you did not>"
      remaining_uncertainty: "<what you still do not know>"
    relationships:
      related_findings: []
      structural_patterns: []
      analogous_uninspected_areas:
        - "<comparable places that might share this, where nobody has looked>"
    remediation:
      status: "open"            # open when found. 'fixed-unverified' once a commit exists.
      proposed_action: "<what would close it>"
    verification:
      status: "not-started"     # you do NOT verify your own fix
      independent: false
      residual_risk: "Not fixed and not verified."
    disclosure:
      public_repo_safe: true    # THIS REPOSITORY IS PUBLIC
    history:
      - date: "${new Date().toISOString().slice(0, 10)}"
        actor: "<role>"
        action: "opened"
        note: "<why this was opened>"
`);
