import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import matter from "gray-matter";

export type LegalDocId =
  | "imprint"
  | "terms"
  | "dpa"
  | "acceptable-use"
  | "privacy"
  | "cookies"
  | "subprocessors";

const CONTENT_DIR = path.join(process.cwd(), "content", "legal");

export type LegalDoc = {
  id: LegalDocId;
  title: string;
  /** Document version, e.g. "2026-05-19". Matches a snapshot dir under _versions/. */
  version: string;
  /** ISO date shown in the "Last updated" line. */
  lastUpdated: string;
  /** Whether this document must be click-accepted (used by the deferred signup flow). */
  requiresAccept: boolean;
  /**
   * Per-document override forcing the "draft pending legal review" footnote
   * ON for this page, regardless of NEXT_PUBLIC_LEGAL_PENDING_REVIEW. Set on
   * documents that haven't been counsel-cleared yet while others have.
   */
  pendingReview?: boolean;
  /** Markdown body (frontmatter stripped). */
  body: string;
  /**
   * SHA-256 of the FROZEN snapshot under content/legal/_versions/{version}/.
   * Hashing the snapshot (not the live file) keeps the hash stable across deploys
   * even if the working copy is reformatted.
   */
  versionHash: string;
};

/**
 * Reads a legal document at build time. Pages that call this must be statically
 * generated (`export const dynamic = "force-static"`) so the filesystem read
 * happens during the build, not at runtime.
 */
export function getLegalDoc(id: LegalDocId): LegalDoc {
  const raw = fs.readFileSync(path.join(CONTENT_DIR, `${id}.md`), "utf8");
  const { data, content } = matter(raw);
  const version = String(data.version);

  const snapshotPath = path.join(CONTENT_DIR, "_versions", version, `${id}.md`);
  const snapshot = fs.readFileSync(snapshotPath, "utf8");
  const versionHash = crypto
    .createHash("sha256")
    .update(snapshot)
    .digest("hex");

  return {
    id,
    title: String(data.title),
    version,
    lastUpdated: String(data.lastUpdated),
    requiresAccept: Boolean(data.requiresAccept),
    pendingReview: data.pendingReview === true ? true : undefined,
    body: content,
    versionHash,
  };
}
