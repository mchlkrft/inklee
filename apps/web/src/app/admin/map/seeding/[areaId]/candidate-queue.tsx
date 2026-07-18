"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  SEED_CANDIDATE_SOURCE_LABELS,
  SEED_CANDIDATE_STATUS_LABELS,
  SEED_CANDIDATE_TYPE_LABELS,
  type SeedCandidateSource,
  type SeedCandidateStatus,
  type SeedCandidateType,
} from "@inklee/shared/map-seeding";
import type { SeedCandidateRow } from "@/lib/server/map-seeding";
import { reviewCandidateAction } from "../actions";

const OPEN_STATUSES = new Set([
  "new",
  "likely_duplicate",
  "approved_for_enrichment",
]);

function CandidateCard({
  areaId,
  candidate,
}: {
  areaId: string;
  candidate: SeedCandidateRow;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const review = (action: string) => {
    setError(null);
    startTransition(async () => {
      const result = await reviewCandidateAction(candidate.id, areaId, action);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  const open = OPEN_STATUSES.has(candidate.status);
  const chipTone =
    candidate.status === "converted"
      ? "bg-brand-mustard/20 text-brand-mustard"
      : candidate.status === "rejected"
        ? "bg-muted text-muted-foreground"
        : candidate.status === "likely_duplicate"
          ? "bg-brand-red/15 text-brand-red"
          : "bg-muted text-foreground";

  return (
    <li className="space-y-2 rounded-2xl border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0">
          <span className="block truncate text-sm text-foreground">
            {candidate.name}
          </span>
          <span className="block text-xs text-muted-foreground">
            {SEED_CANDIDATE_SOURCE_LABELS[
              candidate.sourceType as SeedCandidateSource
            ] ?? candidate.sourceType}
            {" · "}
            {SEED_CANDIDATE_TYPE_LABELS[
              candidate.candidateType as SeedCandidateType
            ] ?? candidate.candidateType}
            {candidate.city ? ` · ${candidate.city}` : ""}
            {candidate.latitude !== null && candidate.longitude !== null
              ? ` · ${candidate.latitude.toFixed(4)}, ${candidate.longitude.toFixed(4)}`
              : ""}
          </span>
        </span>
        <span className={`rounded-full px-2 py-0.5 text-xs ${chipTone}`}>
          {SEED_CANDIDATE_STATUS_LABELS[
            candidate.status as SeedCandidateStatus
          ] ?? candidate.status}
        </span>
      </div>

      {candidate.duplicateConfidence ? (
        <p className="text-xs text-brand-red">
          {candidate.duplicateConfidence === "clear"
            ? "Clear duplicate"
            : candidate.duplicateConfidence === "likely"
              ? "Likely duplicate"
              : "Possible duplicate"}
          {candidate.duplicateLocationId
            ? " of an existing map entry"
            : candidate.duplicateOfCandidateId
              ? " of another candidate"
              : ""}
          .
        </p>
      ) : null}
      {candidate.provenanceNotes ? (
        <p className="text-xs text-muted-foreground">
          {candidate.provenanceNotes}
        </p>
      ) : null}
      {candidate.attribution ? (
        <p className="text-xs text-muted-foreground">{candidate.attribution}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {candidate.sourceUrl ? (
          <a
            href={candidate.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted/30"
          >
            Open source link
          </a>
        ) : null}
        {open ? (
          <>
            <Link
              href={`/admin/map/seeding/candidates/${candidate.id}/convert`}
              className="rounded-md bg-foreground px-3 py-1.5 text-xs text-background transition-opacity hover:opacity-90"
            >
              Convert
            </Link>
            {candidate.status !== "approved_for_enrichment" ? (
              <button
                type="button"
                onClick={() => review("approve")}
                disabled={pending}
                className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted/30 disabled:opacity-50"
              >
                Approve
              </button>
            ) : null}
            {candidate.status !== "likely_duplicate" ? (
              <button
                type="button"
                onClick={() => review("mark_duplicate")}
                disabled={pending}
                className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted/30 disabled:opacity-50"
              >
                Mark duplicate
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => review("reject")}
              disabled={pending}
              className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted/30 disabled:opacity-50"
            >
              Reject
            </button>
          </>
        ) : candidate.status === "rejected" ||
          (candidate.status === "converted" &&
            !candidate.convertedLocationId) ? (
          <button
            type="button"
            onClick={() => review("reopen")}
            disabled={pending}
            className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted/30 disabled:opacity-50"
          >
            Reopen
          </button>
        ) : null}
      </div>
      {error ? <p className="text-xs text-brand-red">{error}</p> : null}
    </li>
  );
}

export default function CandidateQueue({
  areaId,
  candidates,
}: {
  areaId: string;
  candidates: SeedCandidateRow[];
}) {
  const open = candidates.filter((c) => OPEN_STATUSES.has(c.status));
  const closed = candidates.filter((c) => !OPEN_STATUSES.has(c.status));

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-foreground">
        Candidates ({open.length} open)
      </h2>
      {open.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No open candidates. Collect leads through the lanes above.
        </p>
      ) : (
        <ul className="space-y-2">
          {open.map((c) => (
            <CandidateCard key={c.id} areaId={areaId} candidate={c} />
          ))}
        </ul>
      )}
      {closed.length > 0 ? (
        <details className="rounded-2xl border border-border p-4">
          <summary className="cursor-pointer text-sm text-muted-foreground">
            Decided ({closed.length})
          </summary>
          <ul className="mt-3 space-y-2">
            {closed.map((c) => (
              <CandidateCard key={c.id} areaId={areaId} candidate={c} />
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
