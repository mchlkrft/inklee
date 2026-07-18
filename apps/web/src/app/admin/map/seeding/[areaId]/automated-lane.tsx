"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runAutomatedSeedAction } from "../actions";
import type {
  CountryRunRow,
  CountrySeedSummary,
} from "@/lib/server/seed-automation";

const RUN_STATUS_LABELS: Record<string, string> = {
  received: "Received",
  validating: "Validating",
  filtered: "Filtered",
  planned: "Planned",
  blocked: "Blocked",
  importing: "Importing",
  imported: "Imported",
  verifying: "Verifying",
  completed: "Completed",
  completed_with_review: "Completed, review waiting",
  failed: "Failed",
  cancelled: "Cancelled",
};

export default function AutomatedLane({
  areaId,
  countries,
  runs,
}: {
  areaId: string;
  countries: Array<{ code: string; name: string }>;
  runs: CountryRunRow[];
}) {
  const router = useRouter();
  const [country, setCountry] = useState(countries[0]?.code ?? "");
  const [mode, setMode] = useState<"dry_run" | "import">("dry_run");
  const [raw, setRaw] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<CountrySeedSummary | null>(null);
  const [pending, startTransition] = useTransition();

  const run = () => {
    setError(null);
    setSummary(null);
    startTransition(async () => {
      const result = await runAutomatedSeedAction(
        areaId,
        country,
        mode,
        raw,
        label.trim() || null,
      );
      if (result.error) {
        setError(result.error);
        return;
      }
      setSummary(result.summary ?? null);
      setRaw("");
      router.refresh();
    });
  };

  return (
    <section className="space-y-3 rounded-2xl border border-border p-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">
          Automated import
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Runs the country filter over a candidate file: accepted entries import
          automatically, everything uncertain lands in the review queue below. A
          dry run only evaluates and plans. The manual lanes above stay exactly
          as they are.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <select
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground"
        >
          {countries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name} ({c.code})
            </option>
          ))}
        </select>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as "dry_run" | "import")}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground"
        >
          <option value="dry_run">Dry run (evaluate only)</option>
          <option value="import">Import (execute the plan)</option>
        </select>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Batch label (optional)"
          className="min-w-[160px] flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground"
        />
      </div>

      <textarea
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        rows={4}
        placeholder="Paste the candidate JSON here (the overture-tattoo-extract output)."
        className="w-full rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs text-foreground placeholder:text-muted-foreground"
      />

      <button
        type="button"
        onClick={run}
        disabled={pending || !raw.trim() || !country}
        className="rounded-md bg-foreground px-3 py-1.5 text-xs text-background transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending
          ? "Running…"
          : mode === "dry_run"
            ? "Run dry run"
            : "Run import"}
      </button>

      {error ? <p className="text-xs text-brand-red">{error}</p> : null}
      {summary ? (
        <div className="rounded-md bg-muted/40 p-3 text-xs text-foreground">
          <p className="font-medium">
            Run {RUN_STATUS_LABELS[summary.status] ?? summary.status}:{" "}
            {summary.totalCount} candidates.
          </p>
          <p className="mt-1 text-muted-foreground">
            Accepted {summary.counts.accept_automated} · review{" "}
            {summary.counts.review_mixed_business +
              summary.counts.review_ambiguous +
              summary.counts.possible_duplicate}{" "}
            · rejected{" "}
            {summary.counts.reject_beauty +
              summary.counts.reject_not_tattoo +
              summary.counts.reject_insufficient_evidence +
              summary.counts.failed_validation}{" "}
            · duplicates {summary.counts.duplicate}
            {summary.mode === "import"
              ? ` · created ${summary.createdCount}, skipped ${summary.skippedCount}`
              : ""}
          </p>
          {summary.gateFailures.length > 0 ? (
            <p className="mt-1 text-brand-red">
              {summary.gateFailures.join(" ")}
            </p>
          ) : null}
        </div>
      ) : null}

      {runs.length > 0 ? (
        <details className="rounded-md border border-border p-3">
          <summary className="cursor-pointer text-xs text-muted-foreground">
            Recent runs ({runs.length})
          </summary>
          <ul className="mt-2 space-y-2">
            {runs.map((r) => (
              <li key={r.id} className="text-xs text-muted-foreground">
                <span className="text-foreground">
                  {r.countryCode} {r.mode === "dry_run" ? "dry run" : "import"}
                </span>{" "}
                · {RUN_STATUS_LABELS[r.status] ?? r.status} · {r.totalCount}{" "}
                total, {r.acceptedCount} accepted, {r.reviewCount} review,{" "}
                {r.rejectedCount} rejected
                {r.mode === "import" ? `, ${r.createdCount} created` : ""}
                {r.inputLabel ? ` · ${r.inputLabel}` : ""} ·{" "}
                {new Date(r.startedAt).toLocaleString()}
                {r.gateFailures?.length ? (
                  <span className="block text-brand-red">
                    {r.gateFailures.join(" ")}
                  </span>
                ) : null}
                {r.errorSummary ? (
                  <span className="block text-brand-red">{r.errorSummary}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
