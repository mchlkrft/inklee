import "server-only";
import { createHash } from "node:crypto";
import { serviceClient } from "@/lib/supabase/service";
import { writeAudit } from "@/lib/audit";
import { isAutomatedSeedImportEnabled } from "@/lib/features";
import {
  SEED_QUERY_MAX,
  instagramHandleFromSeedUrl,
  parseOvertureImport,
  type OvertureImportCandidate,
} from "@inklee/shared/map-seeding";
import {
  MIN_AUTOMATED_CONFIDENCE,
  SEED_PIPELINE_VERSION,
  SEED_RULESET_VERSION,
  SEED_SCHEMA_VERSION,
  applySeedDuplicateDecision,
  evaluateSeedCandidate,
  statusForSeedDecision,
  type SeedDecision,
  type SeedEvaluation,
} from "@inklee/shared/seed-filtering";
import {
  getSeedCountry,
  type SeedCountryConfig,
} from "@inklee/shared/seed-countries";
import { normalizeInstagramHandle } from "@inklee/shared/map-directory";
import {
  annotateOne,
  getSeedArea,
  loadAnnotationContext,
  type DuplicateAnnotation,
  type SeedAnnotationContext,
  type SeedAreaRow,
} from "@/lib/server/map-seeding";
import {
  createMapLocationCore,
  type MapLocationFormInput,
} from "@/lib/server/map-locations";

// Automated seed import lane (SoT: docs/product/inklee-2-seed-automation.md).
// The SECOND lane of the seeding tool: same intake format, same candidate
// table, same conversion pipeline as the manual workflow — orchestrated
// programmatically. The manual lanes stay untouched; anything this lane is
// not sure about lands in the existing admin review queue. Conversion runs
// through createMapLocationCore, so the density cap and duplicate rules can
// never diverge between lanes.
//
// Safety posture: fail closed. Flag off -> refuse. Unknown country -> refuse.
// Gate failure -> the run is BLOCKED with its plan preserved, nothing
// imported. Claimed-profile protection is by construction: this lane only
// ever INSERTS new unclaimed seed rows and never updates map entries; any
// duplicate hit on a claimed entry is a hard skip.

const MAX_IMPORT_DEFAULT = 150;
const CONVERSION_PLAN_CAP = 1000;

// ---------------------------------------------------------------------------
// Types.

export type CountrySeedMode = "dry_run" | "import";

export type CountrySeedOptions = {
  /** Admin who triggered the run; null for the CRON_SECRET-authenticated CLI. */
  adminId: string | null;
  countryCode: string;
  areaId: string;
  /** Raw candidate JSON (the overture-extract format the manual lane uses). */
  raw: string;
  inputLabel?: string | null;
  mode: CountrySeedMode;
  /** Hard ceiling on automated imports per run (gate, not truncation). */
  maxImport?: number;
};

export type DecisionCounts = Record<SeedDecision, number>;

export type CountrySeedSummary = {
  runId: string;
  mode: CountrySeedMode;
  countryCode: string;
  status: string;
  totalCount: number;
  counts: DecisionCounts;
  createdCount: number;
  skippedCount: number;
  gateFailures: string[];
  verification: {
    expected?: number;
    found?: number;
    missing?: string[];
    error?: string;
  } | null;
};

export type CountrySeedResult =
  | { error: string; runId?: string }
  | { summary: CountrySeedSummary };

type EvaluatedCandidate = {
  input: OvertureImportCandidate;
  evaluation: SeedEvaluation;
  decision: SeedDecision;
  confidence: number;
  pipelineRules: string[];
  annotation: DuplicateAnnotation;
  claimedHit: boolean;
  candidateId?: string;
  adopted?: boolean;
  skippedExisting?: boolean;
  persistError?: string;
};

// ---------------------------------------------------------------------------
// Brief-named building blocks. Each is small and independently testable; the
// orchestrator below composes them.

export function seedInputChecksum(raw: string): string {
  return createHash("sha256").update(raw.trim()).digest("hex");
}

/** Validate the raw batch. Same parser as the manual Overture lane. */
export function validateSeedInput(
  raw: string,
): { error: string } | { candidates: OvertureImportCandidate[] } {
  const parsed = parseOvertureImport(raw);
  if ("error" in parsed) return { error: parsed.error };
  return { candidates: parsed.candidates };
}

/**
 * Layer 1 + layer 2 relevance (shared deterministic ruleset) plus the
 * pipeline-level checks that need context the shared filter does not have:
 * coordinate validity and country plausibility.
 */
export function evaluateForCountry(
  c: OvertureImportCandidate,
  country: SeedCountryConfig,
): {
  evaluation: SeedEvaluation;
  decision: SeedDecision;
  confidence: number;
  pipelineRules: string[];
} {
  const evaluation = evaluateSeedCandidate(
    {
      name: c.name,
      category: c.category ?? null,
      extraText: [
        { field: "website_url", text: c.websiteUrl },
        { field: "social_url", text: c.socialUrl },
      ],
    },
    {
      extraPositive: country.extraPositive,
      extraNegative: country.extraNegative,
    },
  );
  let decision = evaluation.decision;
  let confidence = evaluation.confidence;
  const pipelineRules: string[] = [];

  const hasCoords =
    Number.isFinite(c.latitude ?? NaN) && Number.isFinite(c.longitude ?? NaN);
  if (!hasCoords) {
    // Without coordinates nothing can be placed on the map automatically.
    pipelineRules.push("P-NO-COORDS");
    if (decision === "accept_automated") decision = "failed_validation";
  }

  const candidateCountry = (c.country ?? "").trim().toLowerCase();
  if (
    candidateCountry &&
    candidateCountry !== country.code.toLowerCase() &&
    candidateCountry !== country.name.toLowerCase()
  ) {
    pipelineRules.push("P-COUNTRY-MISMATCH");
    if (decision === "accept_automated") {
      decision = "review_ambiguous";
      confidence = Math.min(confidence, MIN_AUTOMATED_CONFIDENCE - 1);
    }
  }
  return { evaluation, decision, confidence, pipelineRules };
}

export function emptyDecisionCounts(): DecisionCounts {
  return {
    accept_automated: 0,
    reject_beauty: 0,
    reject_not_tattoo: 0,
    reject_insufficient_evidence: 0,
    review_mixed_business: 0,
    review_ambiguous: 0,
    possible_duplicate: 0,
    duplicate: 0,
    failed_validation: 0,
  };
}

/** The form input an accepted candidate converts with (same shape as manual). */
export function conversionInputFor(
  c: OvertureImportCandidate,
  area: SeedAreaRow,
  countryName: string,
): MapLocationFormInput {
  const handle = instagramHandleFromSeedUrl(c.socialUrl);
  return {
    name: c.name,
    category: "tattoo_studio",
    latitude: c.latitude as number,
    longitude: c.longitude as number,
    address: null,
    city: c.city ?? area.city,
    country: c.country ?? countryName,
    postalCode: null,
    googlePlaceId: null,
    websiteUrl: c.websiteUrl ?? null,
    instagramHandle: handle ? normalizeInstagramHandle(handle) : null,
    source: "inklee_seed",
    moderationStatus: "approved",
    isSeed: true,
  };
}

export async function verifyImportedRecords(ids: string[]): Promise<{
  expected: number;
  found: number;
  missing: string[];
  error?: string;
}> {
  if (!ids.length) return { expected: 0, found: 0, missing: [] };
  const { data, error } = await serviceClient
    .from("map_locations")
    .select("id")
    .in("id", ids);
  if (error) {
    // Unverifiable is NOT verified: report everything as missing so the
    // run closes with the review status, never a silent pass.
    return {
      expected: ids.length,
      found: 0,
      missing: ids,
      error: error.message,
    };
  }
  const found = new Set((data ?? []).map((r) => r.id as string));
  return {
    expected: ids.length,
    found: found.size,
    missing: ids.filter((id) => !found.has(id)),
  };
}

// ---------------------------------------------------------------------------
// Run bookkeeping.

async function updateRun(
  runId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await serviceClient
    .from("map_seed_country_runs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", runId);
}

function countsPatch(counts: DecisionCounts, total: number) {
  return {
    total_count: total,
    accepted_count: counts.accept_automated,
    beauty_rejected_count: counts.reject_beauty,
    not_tattoo_count: counts.reject_not_tattoo,
    insufficient_count: counts.reject_insufficient_evidence,
    mixed_business_count: counts.review_mixed_business,
    ambiguous_count: counts.review_ambiguous,
    possible_dup_count: counts.possible_duplicate,
    duplicate_count: counts.duplicate,
    failed_count: counts.failed_validation,
  };
}

// ---------------------------------------------------------------------------
// Candidate persistence. Same table, same unique-lead identity as the manual
// lanes (unique source URL / provider id): re-running the same input adopts
// the existing rows instead of duplicating them, which is what makes runs
// resumable. Human-touched rows are never overwritten.

async function persistEvaluated(
  e: EvaluatedCandidate,
  runId: string,
  intakeRunId: string,
  area: SeedAreaRow,
  adminId: string | null,
): Promise<void> {
  const c = e.input;
  const evidence = {
    positive: e.evaluation.positiveSignals,
    negative: e.evaluation.negativeSignals,
    firedRules: [...e.evaluation.firedRules, ...e.pipelineRules],
    explanation: e.evaluation.explanation,
    duplicate: e.annotation
      ? {
          confidence: e.annotation.confidence,
          locationId: e.annotation.locationId ?? null,
          candidateId: e.annotation.candidateId ?? null,
          reason: e.annotation.reason,
          claimed: e.claimedHit,
        }
      : null,
  };
  const decisionColumns = {
    country_run_id: runId,
    decision: e.decision,
    decision_confidence: Math.min(100, Math.max(0, Math.round(e.confidence))),
    decision_evidence: evidence,
    ruleset_version: e.evaluation.rulesetVersion,
  };

  const { data, error } = await serviceClient
    .from("map_seed_candidates")
    .insert({
      seed_run_id: intakeRunId,
      seed_area_id: area.id,
      source_type: "overture_maps",
      source_provider_id: c.id,
      source_url: c.websiteUrl,
      source_payload_minimal: c.category ? { category: c.category } : null,
      candidate_type: "tattoo_studio",
      name: c.name,
      city: c.city ?? area.city,
      country: c.country ?? area.country,
      latitude: c.latitude,
      longitude: c.longitude,
      social_url: c.socialUrl,
      website_url: c.websiteUrl,
      attribution: "Overture Maps (CDLA-Permissive-2.0)",
      status: statusForSeedDecision(e.decision),
      duplicate_confidence: e.annotation?.confidence ?? null,
      duplicate_of_candidate_id: e.annotation?.candidateId ?? null,
      duplicate_location_id: e.annotation?.locationId ?? null,
      provenance_notes: `Automated country run ${runId}`,
      created_by: adminId,
      ...decisionColumns,
    })
    .select("id")
    .single();

  if (!error && data) {
    e.candidateId = data.id as string;
    return;
  }
  if (error?.code !== "23505") {
    // Never silently discarded: the failure is counted and surfaced on the
    // run row (persistFailures in the verification journal).
    e.decision = "failed_validation";
    e.persistError = error?.message ?? "Insert failed.";
    return;
  }

  // The lead already exists (a dry run preceded this import, the run
  // resumed, or a manual lane found it first). Adopt it: automation may
  // refresh any row NO HUMAN has touched (reviewed_at wins; converted is
  // terminal). The conflict can come from the provider-id index OR the
  // lower(source_url) index, so the lookup tries both identities.
  type ExistingRow = {
    id: string;
    status: string;
    reviewed_at: string | null;
  };
  let existing: ExistingRow | null = null;
  if (c.id) {
    const { data: byProvider } = await serviceClient
      .from("map_seed_candidates")
      .select("id, status, reviewed_at")
      .eq("source_type", "overture_maps")
      .eq("source_provider_id", c.id)
      .maybeSingle();
    existing = (byProvider as ExistingRow | null) ?? null;
  }
  if (!existing && c.websiteUrl) {
    const escaped = c.websiteUrl.replace(/([\\%_])/g, "\\$1");
    const { data: byUrl } = await serviceClient
      .from("map_seed_candidates")
      .select("id, status, reviewed_at")
      .ilike("source_url", escaped)
      .limit(1)
      .maybeSingle();
    existing = (byUrl as ExistingRow | null) ?? null;
  }
  if (!existing) {
    // The conflicting row exists but is unlocatable by either identity
    // (URL shared with a differently-keyed lead): this lead duplicates an
    // existing candidate. Count it truthfully instead of dropping it.
    e.decision = "duplicate";
    e.skippedExisting = true;
    return;
  }
  e.candidateId = existing.id;
  if (existing.reviewed_at || existing.status === "converted") {
    e.skippedExisting = true;
    return;
  }
  await serviceClient
    .from("map_seed_candidates")
    .update({
      ...decisionColumns,
      status: statusForSeedDecision(e.decision),
      updated_at: new Date().toISOString(),
    })
    .eq("id", existing.id)
    .is("reviewed_at", null);
  e.adopted = true;
}

// ---------------------------------------------------------------------------
// The orchestrator.

export async function runCountrySeed(
  options: CountrySeedOptions,
): Promise<CountrySeedResult> {
  if (!isAutomatedSeedImportEnabled())
    return {
      error:
        "Automated seed import is disabled. Set AUTOMATED_SEED_IMPORT_ENABLED to run this lane.",
    };
  const country = getSeedCountry(options.countryCode);
  if (!country)
    return { error: `No country configuration for "${options.countryCode}".` };
  const area = await getSeedArea(options.areaId);
  if (!area) return { error: "Area not found." };
  if (options.mode !== "dry_run" && options.mode !== "import")
    return { error: "Pick a valid mode (dry_run or import)." };
  const maxImport = options.maxImport ?? MAX_IMPORT_DEFAULT;
  if (!Number.isFinite(maxImport) || maxImport < 1 || maxImport > 1000)
    return { error: "maxImport must be between 1 and 1000." };

  const checksum = seedInputChecksum(options.raw);

  // Idempotency pre-check: the same input imports once. Dry runs repeat
  // freely; a blocked/failed import may retry. The partial unique index on
  // the runs table is the race-proof backstop at the importing flip.
  if (options.mode === "import") {
    const { data: prior } = await serviceClient
      .from("map_seed_country_runs")
      .select("id, status, updated_at")
      .eq("input_checksum", checksum)
      .eq("mode", "import")
      .in("status", [
        "importing",
        "imported",
        "verifying",
        "completed",
        "completed_with_review",
      ])
      .limit(1)
      .maybeSingle();
    if (prior) {
      // A hard kill (timeout, deploy) mid-import strands a run at
      // "importing" and would lock this checksum forever. Auto-heal stale
      // ones: the candidate-level guards make a retry safe (converted
      // candidates are never re-imported). Fresh in-flight runs refuse.
      const staleImporting =
        prior.status === "importing" &&
        Date.now() - new Date(prior.updated_at as string).getTime() >
          15 * 60 * 1000;
      if (!staleImporting)
        return {
          error: `This exact input was already imported (run ${prior.id}, status ${prior.status}). Idempotency refuses a second import.`,
          runId: prior.id as string,
        };
      await updateRun(prior.id as string, {
        status: "failed",
        error_summary: "Interrupted mid-import; auto-healed by a later run.",
        completed_at: new Date().toISOString(),
      });
    }
  }

  const { data: runRow, error: runErr } = await serviceClient
    .from("map_seed_country_runs")
    .insert({
      mode: options.mode,
      country_code: country.code,
      country_name: country.name,
      seed_area_id: area.id,
      input_label: options.inputLabel?.slice(0, 200) ?? null,
      input_checksum: checksum,
      schema_version: SEED_SCHEMA_VERSION,
      ruleset_version: SEED_RULESET_VERSION,
      pipeline_version: SEED_PIPELINE_VERSION,
      created_by: options.adminId,
    })
    .select("id")
    .single();
  if (runErr || !runRow) return { error: "Could not record the run." };
  const runId = runRow.id as string;

  try {
    return await execute(runId, options, country, area, checksum, maxImport);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    await updateRun(runId, {
      status: "failed",
      error_summary: message.slice(0, 500),
      completed_at: new Date().toISOString(),
    });
    return { error: `The run failed: ${message}`, runId };
  }
}

async function execute(
  runId: string,
  options: CountrySeedOptions,
  country: SeedCountryConfig,
  area: SeedAreaRow,
  checksum: string,
  maxImport: number,
): Promise<CountrySeedResult> {
  // 1. Validate.
  await updateRun(runId, { status: "validating" });
  const validated = validateSeedInput(options.raw);
  if ("error" in validated) {
    await updateRun(runId, {
      status: "failed",
      error_summary: validated.error,
      completed_at: new Date().toISOString(),
    });
    return { error: validated.error, runId };
  }
  const candidates = validated.candidates;

  // 2. Intake run (the same journal the manual lanes write, marked automated).
  const { data: intake, error: intakeErr } = await serviceClient
    .from("map_seed_runs")
    .insert({
      seed_area_id: area.id,
      provider: "overture_maps",
      query: options.inputLabel?.slice(0, SEED_QUERY_MAX) ?? null,
      result_count: candidates.length,
      run_mode: "automated",
      created_by: options.adminId,
    })
    .select("id")
    .single();
  if (intakeErr || !intake) {
    await updateRun(runId, {
      status: "failed",
      error_summary: "Could not record the intake run.",
      completed_at: new Date().toISOString(),
    });
    return { error: "Could not record the intake run.", runId };
  }

  // 3. Filter + dedup + persist decisions.
  const ctx: SeedAnnotationContext = await loadAnnotationContext(area);
  const claimedIds = new Set(
    ctx.locations.filter((l) => l.studioProfileId).map((l) => l.id),
  );
  const evaluated: EvaluatedCandidate[] = [];
  for (const c of candidates) {
    const { evaluation, decision, confidence, pipelineRules } =
      evaluateForCountry(c, country);
    const annotation = annotateOne(
      {
        name: c.name,
        latitude: c.latitude,
        longitude: c.longitude,
        websiteUrl: c.websiteUrl,
        socialUrl: c.socialUrl,
      },
      ctx,
    );
    const claimedHit = Boolean(
      annotation?.locationId && claimedIds.has(annotation.locationId),
    );
    const finalDecision = applySeedDuplicateDecision(
      decision,
      annotation,
      claimedHit,
    );
    evaluated.push({
      input: c,
      evaluation,
      decision: finalDecision,
      confidence,
      pipelineRules,
      annotation,
      claimedHit,
    });
  }
  for (const e of evaluated) {
    await persistEvaluated(
      e,
      runId,
      intake.id as string,
      area,
      options.adminId,
    );
  }

  const counts = emptyDecisionCounts();
  for (const e of evaluated) counts[e.decision] += 1;
  const reviewCount =
    counts.review_mixed_business +
    counts.review_ambiguous +
    counts.possible_duplicate;
  // Insert failures are never silently discarded: they surface on the run.
  const persistFailures = evaluated
    .filter((e) => e.persistError)
    .map((e) => ({ name: e.input.name, reason: e.persistError as string }));

  // 4. Conversion plan (accepted only; skippedExisting rows are converted
  // already or belong to a human and are not re-planned).
  const accepted = evaluated.filter(
    (e) =>
      e.decision === "accept_automated" && e.candidateId && !e.skippedExisting,
  );
  const plan = accepted.slice(0, CONVERSION_PLAN_CAP).map((e) => ({
    candidateId: e.candidateId,
    name: e.input.name,
    city: e.input.city ?? area.city,
    latitude: e.input.latitude,
    longitude: e.input.longitude,
    confidence: Math.round(e.confidence),
  }));
  await updateRun(runId, {
    ...countsPatch(counts, candidates.length),
    status: "planned",
    conversion_plan: {
      entries: plan,
      truncated: accepted.length > plan.length,
    },
  });

  const finish = async (
    status: string,
    extras: Record<string, unknown> = {},
  ): Promise<CountrySeedSummary> => {
    await updateRun(runId, {
      status,
      completed_at: new Date().toISOString(),
      ...extras,
    });
    await writeAudit({
      action: "automated_seed_run_finished",
      actor: options.adminId ?? "seed-automation",
      category: options.adminId ? "admin" : "system",
      details: {
        run_id: runId,
        mode: options.mode,
        country: country.code,
        status,
        total: candidates.length,
        accepted: counts.accept_automated,
        review: reviewCount,
        checksum,
      },
    });
    return {
      runId,
      mode: options.mode,
      countryCode: country.code,
      status,
      totalCount: candidates.length,
      counts,
      createdCount: Number(extras.created_count ?? 0),
      skippedCount: Number(extras.skipped_count ?? 0),
      gateFailures: Array.isArray(extras.gate_failures)
        ? (extras.gate_failures as string[])
        : [],
      verification:
        (extras.verification as CountrySeedSummary["verification"]) ?? null,
    };
  };

  // 5. Dry run stops here, plan preserved.
  if (options.mode === "dry_run") {
    return {
      summary: await finish(
        reviewCount > 0 ? "completed_with_review" : "completed",
        persistFailures.length ? { verification: { persistFailures } } : {},
      ),
    };
  }

  // 6. Safety gates before any import. A failed gate BLOCKS the run: plan
  // and decisions stay recorded, nothing imports.
  const gateFailures: string[] = [];
  if (!isAutomatedSeedImportEnabled())
    gateFailures.push("The feature flag went off mid-run.");
  if (accepted.length > maxImport)
    gateFailures.push(
      `${accepted.length} accepted candidates exceed the run ceiling of ${maxImport}. Raise maxImport deliberately or split the input.`,
    );
  if (accepted.length > 0 && accepted.length === candidates.length)
    gateFailures.push(
      "Every single candidate was accepted; a 100% acceptance rate on a raw discovery batch is implausible and needs a human look.",
    );
  if (gateFailures.length) {
    await finish("blocked", { gate_failures: gateFailures });
    return {
      error: `The run was blocked before import: ${gateFailures.join(" ")}`,
      runId,
    };
  }

  // 7. Flip to importing. The partial unique index on (input_checksum) is
  // the concurrency backstop: two racing imports of the same input cannot
  // both pass this update. Zero affected rows also blocks (a silent no-op
  // here would run the import outside the index's protection).
  const { data: flipped, error: flipErr } = await serviceClient
    .from("map_seed_country_runs")
    .update({ status: "importing", updated_at: new Date().toISOString() })
    .eq("id", runId)
    .eq("status", "planned")
    .select("id");
  if (flipErr || !flipped?.length) {
    const reason = flipErr
      ? flipErr.code === "23505"
        ? "Another import of this exact input is already recorded."
        : `Could not start the import: ${flipErr.message}`
      : "The run left the planned state before the import could start.";
    await finish("blocked", { gate_failures: [reason] });
    return { error: reason, runId };
  }

  // 8. Execute the plan through the ONE conversion pipeline. Never
  // ignoreDuplicates: a fresh hit at insert time demotes the candidate to
  // the review queue instead of forcing the import.
  const createdIds: string[] = [];
  const importErrors: Array<{ candidateId: string; reason: string }> = [];
  let created = 0;
  let skipped = 0;
  try {
    for (const e of accepted) {
      // Re-check right before converting: a human may have reviewed this
      // candidate between planning and now, and their decision always wins.
      const { data: current } = await serviceClient
        .from("map_seed_candidates")
        .select("status, reviewed_at")
        .eq("id", e.candidateId as string)
        .maybeSingle();
      if (
        !current ||
        current.reviewed_at ||
        current.status !== "approved_for_enrichment"
      ) {
        skipped += 1;
        importErrors.push({
          candidateId: e.candidateId as string,
          reason: "Changed during the run (human review wins); skipped.",
        });
        continue;
      }
      const input = conversionInputFor(e.input, area, country.name);
      const result = await createMapLocationCore(
        { kind: "automation", runId },
        input,
        false,
      );
      if (result.id) {
        createdIds.push(result.id);
        created += 1;
        const { data: marked } = await serviceClient
          .from("map_seed_candidates")
          .update({
            status: "converted",
            converted_location_id: result.id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", e.candidateId as string)
          .eq("status", "approved_for_enrichment")
          .is("reviewed_at", null)
          .select("id");
        if (!marked?.length)
          importErrors.push({
            candidateId: e.candidateId as string,
            reason:
              "Map entry created but the candidate moved on mid-run; reconcile by hand.",
          });
        continue;
      }
      skipped += 1;
      if (result.duplicates?.length) {
        // A duplicate surfaced between planning and insert -> review lane.
        await serviceClient
          .from("map_seed_candidates")
          .update({
            decision: "possible_duplicate",
            status: "new",
            updated_at: new Date().toISOString(),
          })
          .eq("id", e.candidateId as string)
          .eq("status", "approved_for_enrichment")
          .is("reviewed_at", null);
        importErrors.push({
          candidateId: e.candidateId as string,
          reason: "Duplicate detected at insert time; sent to review.",
        });
      } else {
        importErrors.push({
          candidateId: e.candidateId as string,
          reason: result.error ?? "Unknown import error.",
        });
      }
    }
  } catch (err) {
    // Bookkeeping must reflect reality even when the loop dies mid-way:
    // the map entries created so far exist and are recorded here.
    const message = err instanceof Error ? err.message : "Unknown error.";
    await updateRun(runId, {
      status: "failed",
      created_count: created,
      skipped_count: skipped,
      error_summary: message.slice(0, 500),
      verification: { createdIds, importErrors, persistFailures },
      completed_at: new Date().toISOString(),
    });
    return {
      error: `The import failed after ${created} of ${accepted.length} entries: ${message}`,
      runId,
    };
  }

  // 9. Verify what was written, then close the run. A verification gap is
  // never a silent pass: missing entries force the review status.
  await updateRun(runId, { status: "verifying", created_count: created });
  const verification = await verifyImportedRecords(createdIds);
  const needsReview =
    reviewCount > 0 ||
    skipped > 0 ||
    verification.missing.length > 0 ||
    persistFailures.length > 0;
  const summary = await finish(
    needsReview ? "completed_with_review" : "completed",
    {
      created_count: created,
      skipped_count: skipped,
      verification: { ...verification, importErrors, persistFailures },
    },
  );
  return { summary };
}

// ---------------------------------------------------------------------------
// Listing for the admin panel.

export type CountryRunRow = {
  id: string;
  mode: string;
  countryCode: string;
  countryName: string;
  status: string;
  inputLabel: string | null;
  totalCount: number;
  acceptedCount: number;
  createdCount: number;
  skippedCount: number;
  reviewCount: number;
  rejectedCount: number;
  duplicateCount: number;
  gateFailures: string[] | null;
  errorSummary: string | null;
  startedAt: string;
  completedAt: string | null;
};

export async function listCountryRuns(
  areaId?: string,
): Promise<CountryRunRow[]> {
  let q = serviceClient
    .from("map_seed_country_runs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  if (areaId) q = q.eq("seed_area_id", areaId);
  const { data } = await q;
  return (data ?? []).map((r) => ({
    id: r.id as string,
    mode: r.mode as string,
    countryCode: r.country_code as string,
    countryName: r.country_name as string,
    status: r.status as string,
    inputLabel: (r.input_label as string | null) ?? null,
    totalCount: Number(r.total_count ?? 0),
    acceptedCount: Number(r.accepted_count ?? 0),
    createdCount: Number(r.created_count ?? 0),
    skippedCount: Number(r.skipped_count ?? 0),
    reviewCount:
      Number(r.mixed_business_count ?? 0) +
      Number(r.ambiguous_count ?? 0) +
      Number(r.possible_dup_count ?? 0),
    rejectedCount:
      Number(r.beauty_rejected_count ?? 0) +
      Number(r.not_tattoo_count ?? 0) +
      Number(r.insufficient_count ?? 0) +
      Number(r.failed_count ?? 0),
    duplicateCount: Number(r.duplicate_count ?? 0),
    gateFailures: (r.gate_failures as string[] | null) ?? null,
    errorSummary: (r.error_summary as string | null) ?? null,
    startedAt: r.started_at as string,
    completedAt: (r.completed_at as string | null) ?? null,
  }));
}
