// Shared loader + validator for the Continuous Audit Evidence and Structural
// Risk Register (docs/audit/).
//
// Zero dependencies except `yaml`, which is a declared root devDependency with
// no transitive deps of its own. The repository's other governance tooling
// (scripts/legal, scripts/billing, scripts/entitlements) is plain .cjs and this
// follows that convention rather than introducing a framework.
//
// DESIGN NOTE: the controlled vocabularies are read FROM findings.schema.json
// rather than restated here. A validator that hard-codes its own copy of the
// enums is exactly the "two lists that agree today" failure this register
// exists to record, and it would drift the first time someone edits one file.

const fs = require("fs");
const path = require("path");
const YAML = require("yaml");

// Resolved from this file, never from cwd or an absolute machine path. Ten
// governance scripts under scripts/legal, scripts/billing and
// scripts/entitlements used to hard-code an absolute developer path, which is
// why they could not run in CI (finding OPS-TOOL-001). They now share
// scripts/lib/repo-root.cjs, which is this same derivation plus verification of
// the resolved root. This file keeps its own two-line version to stay
// dependency-free at the point the audit register loads.
const ROOT = path.resolve(__dirname, "..", "..");
const AUDIT_DIR = path.join(ROOT, "docs", "audit");
const LEDGER = path.join(AUDIT_DIR, "findings.yaml");
const SCHEMA = path.join(AUDIT_DIR, "findings.schema.json");

function loadSchema() {
  return JSON.parse(fs.readFileSync(SCHEMA, "utf8"));
}

function loadLedger() {
  const raw = fs.readFileSync(LEDGER, "utf8");
  return YAML.parse(raw);
}

/** Walk a $ref-light subset of JSON Schema. Supports exactly what
 *  findings.schema.json uses: object/array/string/integer/boolean, required,
 *  additionalProperties:false, enum, pattern, minLength, minItems, minimum,
 *  and local $ref into #/definitions. Anything the schema uses that this does
 *  not implement is a bug that shows up as a false PASS, so the schema is
 *  deliberately kept within this subset. */
function validateNode(node, schema, schemaRoot, pathStr, errors) {
  if (schema.$ref) {
    const key = schema.$ref.replace("#/definitions/", "");
    return validateNode(node, schemaRoot.definitions[key], schemaRoot, pathStr, errors);
  }
  const t = schema.type;
  const bad = (m) => errors.push(`${pathStr}: ${m}`);

  if (t === "object") {
    if (node === null || typeof node !== "object" || Array.isArray(node)) {
      return bad(`expected an object, got ${Array.isArray(node) ? "array" : typeof node}`);
    }
    for (const req of schema.required || []) {
      if (node[req] === undefined) bad(`missing required field '${req}'`);
    }
    if (schema.additionalProperties === false) {
      for (const k of Object.keys(node)) {
        if (!schema.properties || !schema.properties[k]) bad(`unknown field '${k}'`);
      }
    }
    for (const [k, sub] of Object.entries(schema.properties || {})) {
      if (node[k] !== undefined) validateNode(node[k], sub, schemaRoot, `${pathStr}.${k}`, errors);
    }
    return;
  }

  if (t === "array") {
    if (!Array.isArray(node)) return bad(`expected an array, got ${typeof node}`);
    if (schema.minItems !== undefined && node.length < schema.minItems) {
      bad(`needs at least ${schema.minItems} item(s), has ${node.length}`);
    }
    node.forEach((item, i) => validateNode(item, schema.items, schemaRoot, `${pathStr}[${i}]`, errors));
    return;
  }

  if (t === "string") {
    if (typeof node !== "string") return bad(`expected a string, got ${typeof node}`);
    if (schema.enum && !schema.enum.includes(node)) {
      bad(`'${node}' is not an allowed value. Allowed: ${schema.enum.join(", ")}`);
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(node)) {
      bad(`'${node}' does not match required format ${schema.pattern}`);
    }
    if (schema.minLength !== undefined && node.length < schema.minLength) {
      bad(`is too short (${node.length} < ${schema.minLength}); say something substantive or omit the field`);
    }
    return;
  }

  if (t === "integer") {
    if (!Number.isInteger(node)) return bad(`expected an integer, got ${typeof node}`);
    if (schema.minimum !== undefined && node < schema.minimum) bad(`must be >= ${schema.minimum}`);
    return;
  }

  if (t === "boolean" && typeof node !== "boolean") bad(`expected a boolean, got ${typeof node}`);
}

/** Governance rules that JSON Schema cannot express. These encode the register's
 *  actual principles, and each one exists because the opposite mistake is easy
 *  and consequential. */
function governanceChecks(data, errors) {
  const findings = data.findings || [];
  const patterns = data.patterns || [];
  const coverage = data.coverage || [];

  const findingIds = new Set();
  const patternIds = new Set();

  for (const f of findings) {
    if (findingIds.has(f.id)) errors.push(`findings: duplicate id '${f.id}'. IDs are unique and never reused.`);
    findingIds.add(f.id);
  }
  for (const p of patterns) {
    if (patternIds.has(p.id)) errors.push(`patterns: duplicate id '${p.id}'`);
    patternIds.add(p.id);
  }

  for (const f of findings) {
    const at = `finding ${f.id}`;
    const ev = f.evidence || {};
    const as = f.assessment || {};
    const rem = f.remediation || {};
    const ver = f.verification || {};

    // A finding is only 'confirmed' with real evidence behind it.
    if (f.classification.confidence === "confirmed") {
      const hasFacts = (ev.observed_facts || []).length > 0;
      const hasProof = Boolean(ev.reproduction) || (ev.references || []).length > 0;
      if (!hasFacts || !hasProof) {
        errors.push(`${at}: confidence 'confirmed' requires observed_facts AND a reproduction or references. Downgrade to 'high' if it rests on reading alone.`);
      }
    }

    // Evidence tied to source code must name the commit it was observed at.
    const touchesSource = (f.location?.files || []).length > 0 || (f.location?.database_objects || []).length > 0;
    if (touchesSource && (!f.discovery || !f.discovery.commit)) {
      errors.push(`${at}: cites files or database objects, so discovery.commit is required (use 'unknown' if genuinely unknown).`);
    }

    // A fix existing is NOT verification. This is the central governance rule.
    if (rem.status === "verified" && ver.status !== "passed") {
      errors.push(`${at}: remediation.status 'verified' requires verification.status 'passed'. A commit does not verify itself.`);
    }
    if (ver.status === "passed") {
      if (!ver.verified_by || !ver.verification_method) {
        errors.push(`${at}: verification.status 'passed' requires verified_by and verification_method.`);
      }
      if (ver.independent !== true && !ver.residual_risk) {
        errors.push(`${at}: verification passed but not independent, so residual_risk must state that limitation explicitly.`);
      }
    }
    if (rem.fix_commit && rem.fix_commit !== "unknown" && rem.fix_commit !== "not-applicable") {
      if (ver.status === "not-started" && rem.status === "verified") {
        errors.push(`${at}: has a fix_commit and claims verified while verification has not started.`);
      }
    }
    // There must be something to verify. "The OBSERVATION was independently
    // confirmed" is not "the FIX was independently verified", and collapsing
    // the two is the exact error this register exists to prevent. It was made
    // once during the initial backfill, which is why it is now a rule.
    const noFix = !rem.fix_commit || rem.fix_commit === "not-applicable";
    if (ver.status === "passed" && noFix && ["open", "deferred", "accepted"].includes(rem.status)) {
      errors.push(`${at}: verification 'passed' with remediation '${rem.status}' and no fix_commit. A verified WHAT? If the observation was confirmed, that belongs in evidence, not verification.`);
    }

    // Latent is still a finding; unknown reachability must be stated, not implied.
    if (as.reachability === "unknown" && !as.production_exposure) {
      errors.push(`${at}: reachability is 'unknown', so production_exposure must say what was and was not established.`);
    }

    // Cross-references must resolve.
    for (const r of f.relationships?.related_findings || []) {
      if (!findingIds.has(r)) errors.push(`${at}: related_findings references unknown finding '${r}'`);
    }
    for (const r of f.relationships?.possible_duplicates || []) {
      if (!findingIds.has(r)) errors.push(`${at}: possible_duplicates references unknown finding '${r}'`);
    }
    for (const r of f.relationships?.structural_patterns || []) {
      if (!patternIds.has(r)) errors.push(`${at}: structural_patterns references unknown pattern '${r}'`);
    }

    // Public repository: a finding needing restricted evidence must say so.
    if (f.disclosure && f.disclosure.public_repo_safe === false && !f.disclosure.restricted_evidence_location) {
      errors.push(`${at}: marked not public-repo-safe but gives no restricted_evidence_location.`);
    }

    if (!(f.history || []).length) errors.push(`${at}: history must never be empty; closure preserves history.`);
  }

  for (const p of patterns) {
    const at = `pattern ${p.id}`;
    for (const r of p.related_findings) {
      if (!findingIds.has(r)) errors.push(`${at}: related_findings references unknown finding '${r}'`);
    }
    if (new Set(p.related_findings).size < 2) {
      errors.push(`${at}: needs at least two DISTINCT findings. A shared category is not a pattern.`);
    }
    if (p.recurrence_count !== undefined && p.recurrence_count < p.related_findings.length) {
      errors.push(`${at}: recurrence_count (${p.recurrence_count}) is below its own linked finding count (${p.related_findings.length}).`);
    }
  }

  for (const c of coverage) {
    const at = `coverage '${c.area} / ${c.subsystem}'`;
    // The single most important confusion this register must prevent.
    if (c.coverage === "none" && (c.findings_produced || []).length > 0) {
      errors.push(`${at}: coverage 'none' cannot have findings_produced. If it was inspected, it is not 'none'.`);
    }
    if (c.coverage !== "none" && (!c.last_inspected || c.last_inspected === "unknown") && c.review_type !== "automated-tests") {
      errors.push(`${at}: claims coverage '${c.coverage}' with no inspection date. Set last_inspected or drop to 'none'.`);
    }
    for (const r of c.findings_produced || []) {
      if (!findingIds.has(r)) errors.push(`${at}: findings_produced references unknown finding '${r}'`);
    }
  }
}

function validate() {
  const errors = [];
  let data;
  try {
    data = loadLedger();
  } catch (e) {
    return { ok: false, errors: [`findings.yaml could not be parsed: ${e.message}`], data: null };
  }
  const schema = loadSchema();
  validateNode(data, schema, schema, "root", errors);
  if (!errors.length) governanceChecks(data, errors);
  return { ok: errors.length === 0, errors, data };
}

module.exports = { ROOT, AUDIT_DIR, LEDGER, SCHEMA, loadLedger, loadSchema, validate };
