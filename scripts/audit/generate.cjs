// Generate the human-readable audit reports from docs/audit/findings.yaml.
//
//   node scripts/audit/generate.cjs          (pnpm audit:generate)
//   node scripts/audit/generate.cjs --check  (pnpm audit:check, CI: fails if stale)
//
// DETERMINISM. Output must be byte-identical for the same ledger, or the
// staleness check becomes a daily false alarm and gets ignored, which is how a
// gate dies. So: everything is sorted explicitly, and the "as of" stamp is the
// git commit date of findings.yaml rather than the wall clock. Regenerating on
// a different day with unchanged data produces the same bytes.

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { ROOT, AUDIT_DIR, LEDGER, validate } = require("./lib.cjs");

const SEV_ORDER = ["critical", "high", "medium", "low", "informational"];
const DO_NOT_EDIT =
  "<!-- GENERATED FILE - DO NOT EDIT.\n" +
  "     Source of truth: docs/audit/findings.yaml\n" +
  "     Regenerate:      pnpm audit:generate\n" +
  "     Edits here are overwritten and will fail `pnpm audit:check` in CI. -->\n";

function git(args, fallback) {
  try {
    return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim() || fallback;
  } catch {
    return fallback;
  }
}

/** Deterministic provenance: the commit that last touched the LEDGER, not HEAD
 *  and not the clock. If the ledger is uncommitted, say so plainly rather than
 *  stamping a hash that does not contain this data. */
function provenance() {
  const commit = git(["log", "-1", "--format=%h", "--", LEDGER], "");
  const date = git(["log", "-1", "--format=%cs", "--", LEDGER], "");
  const dirty = git(["status", "--porcelain", "--", LEDGER], "");
  if (!commit) return { commit: "uncommitted", date: "uncommitted", note: "The ledger is not yet committed, so this report has no source commit." };
  if (dirty) return { commit: `${commit}+uncommitted-changes`, date, note: "The ledger has uncommitted changes, so this report may describe data not yet in git." };
  return { commit, date, note: "" };
}

const DISCLAIMER =
  "> **This report is an evidence index and prioritization aid. It does not establish that\n" +
  "> unlisted areas are safe and does not replace an independent audit.**\n";

const bySeverity = (a, b) =>
  SEV_ORDER.indexOf(a.classification.severity) - SEV_ORDER.indexOf(b.classification.severity) ||
  a.id.localeCompare(b.id);

function countBy(items, fn) {
  const m = new Map();
  for (const i of items) m.set(fn(i), (m.get(fn(i)) || 0) + 1);
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function table(headers, rows) {
  if (!rows.length) return "_None._\n";
  const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
  return (
    `| ${headers.join(" | ")} |\n| ${headers.map(() => "---").join(" | ")} |\n` +
    rows.map((r) => `| ${r.map(esc).join(" | ")} |`).join("\n") +
    "\n"
  );
}

// --------------------------------------------------------------------------

function structuralRiskReport(d, prov) {
  const findings = [...d.findings].sort(bySeverity);
  const patterns = [...d.patterns].sort((a, b) => a.id.localeCompare(b.id));
  const open = findings.filter((f) => !["verified", "not-applicable", "risk-accepted"].includes(f.remediation.status));
  const reachable = findings.filter((f) => ["directly-reachable", "conditionally-reachable"].includes(f.assessment.reachability));
  const awaiting = findings.filter((f) => f.remediation.status === "fixed-unverified" || (f.verification.status !== "passed" && f.remediation.fix_commit && f.remediation.fix_commit !== "not-applicable"));
  const selfVerified = findings.filter((f) => f.verification.status === "passed" && f.verification.independent !== true);

  const uninspected = new Set();
  for (const f of findings) for (const a of f.relationships?.analogous_uninspected_areas || []) uninspected.add(a);
  for (const p of patterns) for (const a of p.uninspected_comparables || []) uninspected.add(a);

  const domainCounts = countBy(findings, (f) => f.classification.domain);

  let s = `${DO_NOT_EDIT}\n# Structural risk report\n\n`;
  s += `**Source commit:** \`${prov.commit}\` · **Ledger last changed:** ${prov.date}\n\n`;
  if (prov.note) s += `> ${prov.note}\n\n`;
  s += `${DISCLAIMER}\n`;

  s += `## Executive summary\n\n`;
  s += `${findings.length} recorded finding(s), ${patterns.length} structural pattern(s), across ${d.coverage.length} mapped area(s).\n`;
  s += `${open.length} remain open by remediation status. ${reachable.length} are reachable (directly or conditionally) rather than latent.\n`;
  s += `${findings.length - findings.filter((f) => f.verification.status === "passed").length} have not passed independent verification.\n`;
  s += `${[...uninspected].length} analogous area(s) are flagged as plausibly affected but **not yet inspected**.\n\n`;
  s += `The register is deliberately incomplete. It records what has been examined, not what exists.\n\n`;

  s += `## Findings by severity\n\n`;
  s += table(["Severity", "Count"], SEV_ORDER.map((sv) => [sv, findings.filter((f) => f.classification.severity === sv).length]).filter((r) => r[1] > 0));

  s += `\n## Findings by remediation status\n\n`;
  s += table(["Status", "Count"], countBy(findings, (f) => f.remediation.status));

  s += `\n## Findings by verification status\n\n`;
  s += table(["Verification", "Count"], countBy(findings, (f) => f.verification.status));
  s += `\nA fix is not a verification. ${selfVerified.length} finding(s) passed verification that was **not independent**.\n`;

  s += `\n## Active structural patterns\n\n`;
  if (!patterns.length) s += "_None recorded._\n";
  for (const p of patterns) {
    s += `### ${p.id} — ${p.title}\n\n`;
    s += `**Assessment:** ${p.systemic_assessment} · **Confidence:** ${p.confidence} · **Status:** ${p.status}`;
    if (p.recurrence_count) s += ` · **Recurrences:** ${p.recurrence_count}`;
    s += `\n\n${p.description}\n\n`;
    s += `**Shared root-cause hypothesis (a hypothesis, not a conclusion):** ${p.shared_root_cause_hypothesis}\n\n`;
    s += `**Findings:** ${p.related_findings.join(", ")}\n\n`;
    if ((p.supporting_evidence || []).length) s += `**Supporting evidence:**\n${p.supporting_evidence.map((e) => `- ${e}`).join("\n")}\n\n`;
    if (p.contradicting_evidence) s += `**Evidence that limits this pattern:** ${p.contradicting_evidence}\n\n`;
    if ((p.inspected_without_pattern || []).length) s += `**Inspected, pattern NOT found:**\n${p.inspected_without_pattern.map((e) => `- ${e}`).join("\n")}\n\n`;
    if ((p.uninspected_comparables || []).length) s += `**Comparable areas NOT yet inspected:**\n${p.uninspected_comparables.map((e) => `- ${e}`).join("\n")}\n\n`;
    if ((p.auditor_sampling_targets || []).length) s += `**Suggested auditor sampling:**\n${p.auditor_sampling_targets.map((e) => `- ${e}`).join("\n")}\n\n`;
  }

  s += `\n## Most affected domains\n\n`;
  s += table(["Domain", "Findings"], [...domainCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));

  s += `\n## Findings with production reachability\n\n`;
  s += table(
    ["ID", "Severity", "Reachability", "Impact", "Title"],
    reachable.map((f) => [f.id, f.classification.severity, f.assessment.reachability, f.assessment.impact_status, f.title]),
  );

  s += `\n## Findings awaiting verification\n\n`;
  s += table(
    ["ID", "Severity", "Remediation", "Verification", "Fix commit"],
    awaiting.map((f) => [f.id, f.classification.severity, f.remediation.status, f.verification.status, f.remediation.fix_commit || "-"]),
  );

  s += `\n## Analogous areas flagged but NOT inspected\n\n`;
  s += `These are the register's highest-value entries for an auditor: places a recorded weakness could plausibly also exist, where nobody has looked.\n\n`;
  s += [...uninspected].sort().map((a) => `- ${a}`).join("\n") || "_None recorded._";
  s += `\n`;

  s += `\n## Recommended independent-auditor priorities\n\n`;
  const prio = [
    ...patterns.filter((p) => ["systemic", "likely-systemic"].includes(p.systemic_assessment)).map((p) => `**${p.id}** (${p.systemic_assessment}): ${p.title}`),
    ...findings.filter((f) => ["critical", "high"].includes(f.classification.severity) && f.verification.status !== "passed").map((f) => `**${f.id}** (${f.classification.severity}, unverified): ${f.title}`),
    ...d.coverage.filter((c) => c.coverage === "none").slice(0, 8).map((c) => `**Uninspected**: ${c.area} / ${c.subsystem}`),
  ];
  s += prio.length ? prio.map((x, i) => `${i + 1}. ${x}`).join("\n") + "\n" : "_None._\n";

  s += `\n## Limitations and confidence warnings\n\n`;
  s += `- Findings marked \`hypothesis\` or \`low\` confidence are **not established**. Root-cause hypotheses may be wrong.\n`;
  s += `- \`currently-unreachable\` reflects the system as inspected at the stated commit. Reachability changes with configuration, entitlement grants and deployment state.\n`;
  s += `- Coverage \`none\` means **not inspected**. It is never a safety claim.\n`;
  s += `- The database test suite runs against a LOCAL stack. Production schema drift is not covered by it.\n`;
  s += `- This repository is **public**. Some evidence is deliberately abbreviated; see each finding's \`disclosure\` block.\n`;
  return s;
}

function scopeMap(d, prov) {
  const rows = [...d.coverage].sort((a, b) => a.area.localeCompare(b.area) || a.subsystem.localeCompare(b.subsystem));
  let s = `${DO_NOT_EDIT}\n# Audit scope map\n\n`;
  s += `**Source commit:** \`${prov.commit}\` · **Ledger last changed:** ${prov.date}\n\n`;
  s += `> **Coverage \`none\` means the area has NOT been inspected. It does not mean the area is safe.**\n`;
  s += `> "No findings recorded" and "reviewed and found sound" are different statements, and this map exists to keep them apart.\n\n`;
  s += `**Scale:** none (not inspected) · initial (surface pass) · partial (some paths) · substantial (most paths, gaps named) · comprehensive (systematic, exclusions named)\n\n`;

  for (const lvl of ["comprehensive", "substantial", "partial", "initial", "none"]) {
    const sub = rows.filter((r) => r.coverage === lvl);
    if (!sub.length) continue;
    s += `## Coverage: ${lvl} (${sub.length})\n\n`;
    s += table(
      ["Area", "Subsystem", "Review type", "Last inspected", "Commit", "Reviewer", "Findings", "Known exclusions", "Next inspection"],
      sub.map((r) => [
        r.area, r.subsystem, r.review_type, r.last_inspected, r.commit_inspected || "unknown",
        r.reviewer || "unknown", (r.findings_produced || []).join(", ") || "-",
        r.known_exclusions || "-", r.recommended_next_inspection,
      ]),
    );
    s += `\n`;
  }
  s += `## Evidence for each coverage claim\n\n`;
  s += table(["Area / Subsystem", "Coverage", "Evidence", "Changed since inspection"],
    rows.map((r) => [`${r.area} / ${r.subsystem}`, r.coverage, r.evidence, r.changed_since_inspection || "unknown"]));
  return s;
}

function unresolved(d, prov) {
  const f = [...d.findings].sort(bySeverity);
  const sec = (title, list, note) => {
    let out = `## ${title} (${list.length})\n\n`;
    if (note) out += `${note}\n\n`;
    out += table(["ID", "Sev", "Domain", "Reachability", "Impact", "Title"],
      list.map((x) => [x.id, x.classification.severity, x.classification.domain, x.assessment.reachability, x.assessment.impact_status, x.title]));
    return out + "\n";
  };
  let s = `${DO_NOT_EDIT}\n# Unresolved findings\n\n`;
  s += `**Source commit:** \`${prov.commit}\` · **Ledger last changed:** ${prov.date}\n\n`;
  s += `Operational view. Generated from the ledger; do not edit.\n\n`;
  s += sec("Open", f.filter((x) => x.remediation.status === "open"));
  s += sec("In progress", f.filter((x) => x.remediation.status === "in-progress"));
  s += sec("Fixed but NOT verified", f.filter((x) => x.remediation.status === "fixed-unverified"),
    "A commit exists. Nothing independent has confirmed it works.");
  s += sec("Verified, but NOT independently", f.filter((x) => x.verification.status === "passed" && x.verification.independent !== true),
    "Verified by the same instance or process that produced the fix. Recorded as a limitation, not as assurance.");
  s += sec("Deferred", f.filter((x) => x.remediation.status === "deferred"));
  s += sec("Risk accepted", f.filter((x) => x.remediation.status === "risk-accepted"));
  s += sec("Mitigated but not fixed", f.filter((x) => x.remediation.status === "mitigated"));
  s += sec("Verification blocked or impossible", f.filter((x) => ["cannot-verify", "failed"].includes(x.verification.status)));
  s += sec("Production reachability UNKNOWN", f.filter((x) => x.assessment.reachability === "unknown"),
    "Reachability was not established. These need production-state confirmation before they can be prioritized honestly.");
  return s;
}

function auditorHandoff(d, prov) {
  const patterns = [...d.patterns].sort((a, b) => a.id.localeCompare(b.id));
  const none = d.coverage.filter((c) => c.coverage === "none").sort((a, b) => a.area.localeCompare(b.area));
  const hi = [...d.findings].filter((f) => ["critical", "high"].includes(f.classification.severity)).sort(bySeverity);
  let s = `${DO_NOT_EDIT}\n# Independent auditor handoff\n\n`;
  s += `**Source commit:** \`${prov.commit}\` · **Ledger last changed:** ${prov.date}\n\n`;

  s += `## What this system is\n\n`;
  s += `Inklee is a booking, payments and commerce platform for tattoo artists (Next.js + Supabase/Postgres, a React Native client, and Stripe including Connect).\n`;
  s += `This register is a running record of findings discovered during development and review. It exists so that evidence survives the session that produced it.\n\n`;

  s += `## Read this first\n\n`;
  s += `**Do not assume this register is complete.** It records what was examined. Most of the system has not been examined.\n\n`;
  s += `**Do not assume the root-cause hypotheses are correct.** They are labelled \`root_cause_hypothesis\` precisely because they are unproven. Several were wrong before and were corrected only when someone tried to disprove them by execution.\n\n`;
  s += `**Anchoring risk.** The most likely way this document harms an audit is by directing attention only where findings already exist. Treat the finding list as a sample of one team's attention, not a map of the risk surface. The \`analogous_uninspected_areas\` fields and the \`none\` rows in the scope map are deliberately the most actionable content here.\n\n`;
  s += `**Verify independently.** Every finding cites a file, symbol, migration or command. Re-run them. Where a finding says a fix was verified, check whether \`verification.independent\` is true; where it is false, the fix was confirmed by whoever wrote it.\n\n`;

  s += `## Source of truth\n\n`;
  s += `| File | Role |\n| --- | --- |\n`;
  s += `| \`docs/audit/findings.yaml\` | The ledger. The ONLY hand-edited source. |\n`;
  s += `| \`docs/audit/findings.schema.json\` | Contract and controlled vocabulary. |\n`;
  s += `| \`docs/audit/structural-risk-report.md\` | Generated. Patterns and prioritization. |\n`;
  s += `| \`docs/audit/audit-scope-map.md\` | Generated. What has and has not been inspected. |\n`;
  s += `| \`docs/audit/unresolved-findings.md\` | Generated. Operational open state. |\n`;
  s += `| \`docs/audit/evidence/\` | Supporting artifacts, redacted for a public repository. |\n\n`;
  s += `Regenerate with \`pnpm audit:generate\`; validate with \`pnpm audit:validate\`.\n\n`;

  s += `## Structural patterns\n\n`;
  if (!patterns.length) s += `_None recorded._\n\n`;
  for (const p of patterns) {
    s += `- **${p.id}** (${p.systemic_assessment}, confidence ${p.confidence}): ${p.title}. Findings: ${p.related_findings.join(", ")}.\n`;
  }
  s += `\n`;

  s += `## Highest-priority sampling areas\n\n`;
  s += `1. Any area a pattern above marks \`systemic\` or \`likely-systemic\`: sample siblings the register does NOT list.\n`;
  s += `2. Unverified critical and high findings (below).\n`;
  s += `3. Areas with coverage \`none\` (below), especially where they neighbour a recorded finding.\n\n`;
  s += table(["ID", "Sev", "Verification", "Independent", "Title"],
    hi.map((f) => [f.id, f.classification.severity, f.verification.status, String(f.verification.independent === true), f.title]));

  s += `\n## Areas NOT reviewed\n\n`;
  s += `Nothing here has been inspected. No inference about their condition is available from this register.\n\n`;
  s += table(["Area", "Subsystem", "Recommended inspection"], none.map((c) => [c.area, c.subsystem, c.recommended_next_inspection]));

  s += `\n## Known uncertainty\n\n`;
  s += `- The database test suite runs against a LOCAL Supabase stack only. **Production schema drift is caught by nothing automated.**\n`;
  s += `- Documentation in this repository has repeatedly been wrong about runtime behaviour. Prefer code and live catalog reads.\n`;
  s += `- Several findings were discovered only because an independent process tried to refute a claim that had already passed review. Absence of a finding in an area often means nobody tried that hard.\n`;
  s += `- This repository is **public**, so some evidence is abbreviated. Findings with \`disclosure.public_repo_safe: false\` point to where fuller evidence lives.\n\n`;

  s += `## Search beyond this register\n\n`;
  s += `Suggested independent starting points, chosen because they are where this register is weakest rather than strongest:\n\n`;
  s += `- Enumerate every table with RLS enabled and compare its policy set against which client actually writes it. Do not rely on the recorded findings to tell you which tables matter.\n`;
  s += `- Diff production database state against the migration history directly, rather than against the migration ledger table.\n`;
  s += `- Enumerate every entitlement gate and test it server-side by calling the core, not through the UI.\n`;
  s += `- Compare web and mobile implementations of the same business rule for divergence.\n`;
  s += `- For any test asserted as proof, delete the thing it protects and confirm it actually fails.\n`;
  return s;
}

// --------------------------------------------------------------------------

const { ok, errors, data } = validate();
if (!ok) {
  console.error("audit:generate refused: the ledger is invalid. Run `pnpm audit:validate`.");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

const prov = provenance();
const outputs = {
  "structural-risk-report.md": structuralRiskReport(data, prov),
  "audit-scope-map.md": scopeMap(data, prov),
  "unresolved-findings.md": unresolved(data, prov),
  "auditor-handoff.md": auditorHandoff(data, prov),
};

const checkOnly = process.argv.includes("--check");
let stale = 0;

for (const [name, content] of Object.entries(outputs)) {
  const target = path.join(AUDIT_DIR, name);
  const existing = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : null;
  // Normalise line endings so a CRLF checkout does not read as stale.
  const same = existing !== null && existing.replace(/\r\n/g, "\n") === content.replace(/\r\n/g, "\n");
  if (checkOnly) {
    if (!same) {
      stale++;
      console.error(`STALE: docs/audit/${name} does not match the ledger.`);
    }
  } else if (!same) {
    fs.writeFileSync(target, content, "utf8");
    console.log(`wrote docs/audit/${name}`);
  } else {
    console.log(`unchanged docs/audit/${name}`);
  }
}

if (checkOnly) {
  if (stale) {
    console.error(`\naudit:check FAILED - ${stale} generated report(s) are stale.`);
    console.error("Run `pnpm audit:generate` and commit the result.\n");
    process.exit(1);
  }
  console.log("audit:check OK - ledger valid and all generated reports current.");
}
