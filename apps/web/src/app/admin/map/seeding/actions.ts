"use server";

import { revalidatePath } from "next/cache";
import { getAdminId } from "@/lib/admin-guard";
import { writeAudit } from "@/lib/audit";
import { serviceClient } from "@/lib/supabase/service";
import {
  addManualCandidateCore,
  braveSearchCore,
  commitOvertureImportCore,
  createSeedAreaCore,
  getSeedCandidate,
  markConvertedCore,
  previewOvertureImportCore,
  reviewCandidateCore,
  setSeedAreaStatusCore,
  storeBraveSelectionCore,
  type AnnotatedOvertureCandidate,
} from "@/lib/server/map-seeding";
import {
  canTransitionSeedCandidate,
  type BraveLead,
  type ManualCandidateInput,
  type SeedAreaInput,
} from "@inklee/shared/map-seeding";
import { createMapLocationAction } from "../actions";
import type { MapLocationFormInput } from "@/lib/server/map-locations";
import {
  runCountrySeed,
  type CountrySeedSummary,
} from "@/lib/server/seed-automation";
import {
  cancelCoverageRun,
  coverageWorkerTick,
  createCoverageRun,
  pauseCoverageRun,
  resumeCoverageRun,
  retryCoverageFailures,
} from "@/lib/server/seed-coverage";
import type { DuplicateHit } from "@inklee/shared/map-directory";

async function audit(
  adminId: string,
  action: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await Promise.all([
    serviceClient.from("admin_action_log").insert({
      admin_user_id: adminId,
      target_user_id: null,
      action,
      reason: null,
      metadata,
    }),
    writeAudit({
      action: `admin_${action}`,
      actor: adminId,
      category: "admin",
      details: metadata,
    }),
  ]);
}

export async function createSeedAreaAction(
  input: SeedAreaInput,
): Promise<{ error?: string; id?: string }> {
  const adminId = await getAdminId();
  if (!adminId) return { error: "Not authorized." };
  const result = await createSeedAreaCore(adminId, input);
  if (result.id) {
    await audit(adminId, "map_seed_area_created", {
      seed_area_id: result.id,
      label: input.label,
    });
    revalidatePath("/admin/map/seeding");
  }
  return result;
}

export async function setSeedAreaStatusAction(
  areaId: string,
  status: string,
): Promise<{ error?: string }> {
  const adminId = await getAdminId();
  if (!adminId) return { error: "Not authorized." };
  const result = await setSeedAreaStatusCore(adminId, areaId, status);
  if (!result.error) {
    revalidatePath("/admin/map/seeding");
    revalidatePath(`/admin/map/seeding/${areaId}`);
  }
  return result;
}

export async function braveSearchAction(
  query: string,
): Promise<{ error?: string; leads?: BraveLead[] }> {
  const adminId = await getAdminId();
  if (!adminId) return { error: "Not authorized." };
  return braveSearchCore(adminId, query);
}

export async function storeBraveSelectionAction(
  areaId: string,
  query: string,
  leads: BraveLead[],
): Promise<{
  error?: string;
  stored?: number;
  duplicates?: number;
  failed?: number;
}> {
  const adminId = await getAdminId();
  if (!adminId) return { error: "Not authorized." };
  const result = await storeBraveSelectionCore(adminId, areaId, query, leads);
  if (!result.error) {
    await audit(adminId, "map_seed_brave_run", {
      seed_area_id: areaId,
      query,
      stored: result.stored,
      duplicates: result.duplicates,
    });
    revalidatePath(`/admin/map/seeding/${areaId}`);
  }
  return result;
}

export async function runAutomatedSeedAction(
  areaId: string,
  countryCode: string,
  mode: "dry_run" | "import",
  raw: string,
  label: string | null,
  maxImport?: number,
): Promise<{ error?: string; summary?: CountrySeedSummary; runId?: string }> {
  const adminId = await getAdminId();
  if (!adminId) return { error: "Not authorized." };
  const result = await runCountrySeed({
    adminId,
    countryCode,
    areaId,
    raw,
    inputLabel: label,
    mode,
    maxImport,
  });
  revalidatePath(`/admin/map/seeding/${areaId}`);
  if ("error" in result) return { error: result.error, runId: result.runId };
  return { summary: result.summary };
}

export async function createCoverageRunAction(
  countryCode: string,
  scope: "pilot" | "regional" | "nationwide" | "gap_fill",
  mode: "planning" | "discovery" | "import",
  regionFilter: string | null,
): Promise<{ error?: string; runId?: string }> {
  const adminId = await getAdminId();
  if (!adminId) return { error: "Not authorized." };
  const result = await createCoverageRun({
    countryCode,
    scope,
    mode,
    regionFilter,
    createdBy: adminId,
  });
  revalidatePath("/admin/map/seeding/coverage");
  return { error: result.error, runId: result.runId };
}

export async function coverageControlAction(
  runId: string,
  control: "pause" | "resume" | "cancel" | "retry" | "tick",
): Promise<{ error?: string }> {
  const adminId = await getAdminId();
  if (!adminId) return { error: "Not authorized." };
  const result =
    control === "pause"
      ? await pauseCoverageRun(runId)
      : control === "resume"
        ? await resumeCoverageRun(runId)
        : control === "cancel"
          ? await cancelCoverageRun(runId)
          : control === "retry"
            ? await retryCoverageFailures(runId)
            : await coverageWorkerTick(`admin-${adminId.slice(0, 8)}`);
  await audit(adminId, "map_coverage_control", { run_id: runId, control });
  revalidatePath("/admin/map/seeding/coverage");
  return { error: "error" in result ? result.error : undefined };
}

export async function previewOvertureImportAction(
  areaId: string,
  raw: string,
): Promise<{ error?: string; rows?: AnnotatedOvertureCandidate[] }> {
  const adminId = await getAdminId();
  if (!adminId) return { error: "Not authorized." };
  return previewOvertureImportCore(areaId, raw);
}

export async function commitOvertureImportAction(
  areaId: string,
  raw: string,
  fileLabel: string | null,
): Promise<{
  error?: string;
  stored?: number;
  duplicates?: number;
  failed?: number;
}> {
  const adminId = await getAdminId();
  if (!adminId) return { error: "Not authorized." };
  const result = await commitOvertureImportCore(
    adminId,
    areaId,
    raw,
    fileLabel,
  );
  if (!result.error) {
    await audit(adminId, "map_seed_overture_import", {
      seed_area_id: areaId,
      file_label: fileLabel,
      stored: result.stored,
      duplicates: result.duplicates,
    });
    revalidatePath(`/admin/map/seeding/${areaId}`);
  }
  return result;
}

export async function addManualCandidateAction(
  areaId: string,
  input: ManualCandidateInput,
): Promise<{ error?: string; id?: string }> {
  const adminId = await getAdminId();
  if (!adminId) return { error: "Not authorized." };
  const result = await addManualCandidateCore(adminId, areaId, input);
  if (!result.error) revalidatePath(`/admin/map/seeding/${areaId}`);
  return result;
}

export async function reviewCandidateAction(
  candidateId: string,
  areaId: string,
  action: string,
  extras?: { adminNotes?: string | null; confidenceScore?: number | null },
): Promise<{ error?: string }> {
  const adminId = await getAdminId();
  if (!adminId) return { error: "Not authorized." };
  const result = await reviewCandidateCore(
    adminId,
    candidateId,
    action,
    extras,
  );
  if (!result.error) revalidatePath(`/admin/map/seeding/${areaId}`);
  return result;
}

/**
 * Conversion: the candidate becomes a map entry through the SAME pipeline as
 * hand-entered admin entries (validation, the locked density cap, duplicate
 * warn-and-confirm, audit). On success the candidate is marked converted.
 */
export async function convertCandidateAction(
  candidateId: string,
  input: MapLocationFormInput,
  ignoreDuplicates = false,
): Promise<{ error?: string; id?: string; duplicates?: DuplicateHit[] }> {
  const adminId = await getAdminId();
  if (!adminId) return { error: "Not authorized." };
  // Pre-check BEFORE creating the entry: a stale tab or a rejected candidate
  // must not mint a second live map location.
  const candidate = await getSeedCandidate(candidateId);
  if (!candidate) return { error: "Candidate not found." };
  if (!canTransitionSeedCandidate(candidate.status, "converted"))
    return { error: "This candidate already moved on." };
  const created = await createMapLocationAction(input, ignoreDuplicates);
  if (created.error || created.duplicates || !created.id) return created;
  const marked = await markConvertedCore(adminId, candidateId, created.id);
  if (marked.error) {
    // The map entry exists; surface the bookkeeping failure instead of
    // pretending the conversion failed.
    return {
      id: created.id,
      error: `The map entry was created, but the candidate could not be marked converted: ${marked.error}`,
    };
  }
  revalidatePath("/admin/map/seeding");
  return { id: created.id };
}
