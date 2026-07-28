import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import matter from "gray-matter";

import { getLegalDoc, type LegalDocId } from "@/lib/legal/documents";

// The CI-safe half of the legal artifact integrity invariant (founder
// direction 2026-07-28, section 7):
//
//   active source == frozen snapshot == computed versionHash
//
// The billing activation gate re-closes approvals against the snapshot hash,
// and consumer checkout records the buyer's accepted terms version from the
// SAME getLegalDoc read. Both therefore inherit whatever this test pins: if a
// versioned legal source is edited without a version bump plus a new frozen
// snapshot, the edit ships text the approved artifact no longer describes,
// silently, while the gate stays open. That is the exact footgun this suite
// exists to make impossible: any such edit fails CI here instead.
//
// The needs-database half (recorded bound_artifact vs computed hash) lives in
// scripts/legal/verify-legal-artifacts.cjs, which pre-launch runs execute
// against production.

const DOC_IDS: LegalDocId[] = [
  "imprint",
  "terms",
  "dpa",
  "acceptable-use",
  "privacy",
  "cookies",
  "subprocessors",
];

const CONTENT_DIR = path.join(process.cwd(), "content", "legal");

describe.each(DOC_IDS)("legal artifact integrity: %s", (id) => {
  const livePath = path.join(CONTENT_DIR, `${id}.md`);

  it("declares a version with a frozen snapshot", () => {
    const raw = fs.readFileSync(livePath, "utf8");
    const { data } = matter(raw);
    expect(data.version, `${id}.md has no frontmatter version`).toBeTruthy();

    const snapshotPath = path.join(
      CONTENT_DIR,
      "_versions",
      String(data.version),
      `${id}.md`,
    );
    expect(
      fs.existsSync(snapshotPath),
      `missing frozen snapshot ${snapshotPath}: a version bump must add one`,
    ).toBe(true);
  });

  it("is byte-identical to its frozen snapshot (no edit without a version bump)", () => {
    const raw = fs.readFileSync(livePath, "utf8");
    const { data } = matter(raw);
    const snapshotPath = path.join(
      CONTENT_DIR,
      "_versions",
      String(data.version),
      `${id}.md`,
    );
    const snapshot = fs.readFileSync(snapshotPath, "utf8");
    expect(
      raw === snapshot,
      `${id}.md differs from its ${data.version} snapshot. Editing a versioned ` +
        `legal source requires: bump the frontmatter version, freeze a new ` +
        `snapshot under _versions/, re-record the bound approval, and obtain ` +
        `re-approval. Editing the live file alone is never valid.`,
    ).toBe(true);
  });

  it("hashes through getLegalDoc exactly as the gate and checkout consume it", () => {
    const doc = getLegalDoc(id);
    const snapshotPath = path.join(
      CONTENT_DIR,
      "_versions",
      doc.version,
      `${id}.md`,
    );
    const expected = crypto
      .createHash("sha256")
      .update(fs.readFileSync(snapshotPath, "utf8"))
      .digest("hex");
    expect(doc.versionHash).toBe(expected);
  });
});
