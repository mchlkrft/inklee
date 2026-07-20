import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import { writeAudit } from "@/lib/audit";

// Seed working-data retention (migration 0093). The scaffolding around the
// map outgrew the map itself; this reclaims it without losing a single
// decision, coverage task or map entry. Dry run is the default everywhere:
// nothing is removed until a caller explicitly asks to apply.

export type RetentionPlan = {
  terminalRuns: number;
  openRuns: number;
  discoveriesPrunable: number;
  discoveriesProtected: number;
  evidenceCompactable: number;
  evidenceProtected: number;
  mapLocations: number;
  coverageTasks: number;
  discoveriesBytes: number;
  candidatesBytes: number;
  databaseBytes: number;
};

export type RetentionResult = {
  error?: string;
  mode: "dry_run" | "apply";
  before?: RetentionPlan;
  after?: RetentionPlan;
  discoveriesDeleted?: number;
  evidenceCompacted?: number;
};

function mb(bytes: number): number {
  return Math.round((bytes / 1048576) * 10) / 10;
}

export async function getRetentionPlan(): Promise<RetentionPlan | null> {
  const { data, error } = await serviceClient.rpc("seed_retention_plan");
  if (error || !data) return null;
  return data as RetentionPlan;
}

/**
 * Prune in bounded loops so one call cannot run away: each SQL round trip
 * removes at most a chunk, and the loop stops when a pass changes nothing
 * or the safety ceiling is reached.
 */
export async function runRetention(options: {
  apply: boolean;
  actor: string | null;
  maxDiscoveries?: number;
  maxEvidence?: number;
}): Promise<RetentionResult> {
  const mode = options.apply ? "apply" : "dry_run";
  const before = await getRetentionPlan();
  if (!before) return { mode, error: "Could not read the retention plan." };
  if (!options.apply) return { mode, before };

  const discoveryCeiling = options.maxDiscoveries ?? 200000;
  const evidenceCeiling = options.maxEvidence ?? 200000;
  let discoveriesDeleted = 0;
  let evidenceCompacted = 0;

  while (discoveriesDeleted < discoveryCeiling) {
    const { data, error } = await serviceClient.rpc(
      "prune_coverage_discoveries",
      { p_limit: 5000 },
    );
    if (error) break;
    const removed = Number(data ?? 0);
    if (removed <= 0) break;
    discoveriesDeleted += removed;
  }

  while (evidenceCompacted < evidenceCeiling) {
    const { data, error } = await serviceClient.rpc("compact_seed_evidence", {
      p_limit: 5000,
    });
    if (error) break;
    const updated = Number(data ?? 0);
    if (updated <= 0) break;
    evidenceCompacted += updated;
  }

  const after = await getRetentionPlan();
  await writeAudit({
    action: "seed_retention_applied",
    actor: options.actor ?? "seed-retention",
    category: options.actor ? "admin" : "system",
    details: {
      discoveries_deleted: discoveriesDeleted,
      evidence_compacted: evidenceCompacted,
      db_mb_before: mb(before.databaseBytes),
      db_mb_after: after ? mb(after.databaseBytes) : null,
    },
  });

  return {
    mode,
    before,
    after: after ?? undefined,
    discoveriesDeleted,
    evidenceCompacted,
  };
}
