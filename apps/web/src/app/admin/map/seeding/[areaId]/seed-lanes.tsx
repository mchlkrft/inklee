"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import SelectInput from "@/components/select-input";
import {
  SEED_CANDIDATE_TYPES,
  SEED_CANDIDATE_TYPE_LABELS,
  type BraveLead,
} from "@inklee/shared/map-seeding";
import type { AnnotatedOvertureCandidate } from "@/lib/server/map-seeding";
import {
  addManualCandidateAction,
  braveSearchAction,
  commitOvertureImportAction,
  previewOvertureImportAction,
  storeBraveSelectionAction,
} from "../actions";

const FIELD =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
const LABEL = "text-xs text-muted-foreground";
const TYPE_OPTIONS = SEED_CANDIDATE_TYPES.map((value) => ({
  value,
  label: SEED_CANDIDATE_TYPE_LABELS[value],
}));

function BraveLane({
  areaId,
  configured,
  usedToday,
  dailyCap,
  usedThisMonth,
  monthlyCap,
}: {
  areaId: string;
  configured: boolean;
  usedToday: number;
  dailyCap: number;
  usedThisMonth: number;
  monthlyCap: number;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  // The query that actually produced the current leads; editing the box
  // without re-searching must not rewrite provenance.
  const [resultQuery, setResultQuery] = useState("");
  const [leads, setLeads] = useState<BraveLead[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!configured) {
    return (
      <p className="text-sm text-muted-foreground">
        Brave search is not configured (MAP_SEED_BRAVE_SEARCH_KEY).
      </p>
    );
  }

  const search = () => {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await braveSearchAction(query);
      if (result.error) {
        setError(result.error);
        return;
      }
      setLeads(result.leads ?? []);
      setResultQuery(query);
      setSelected(new Set());
    });
  };

  const store = () => {
    if (!leads) return;
    setError(null);
    startTransition(async () => {
      const chosen = leads.filter((l) => selected.has(l.url));
      const result = await storeBraveSelectionAction(
        areaId,
        resultQuery,
        chosen,
      );
      if (result.error) {
        setError(result.error);
        return;
      }
      setMessage(
        `Stored ${result.stored}. Skipped ${result.duplicates} already collected.${
          result.failed ? ` ${result.failed} failed to save.` : ""
        }`,
      );
      setLeads(null);
      setSelected(new Set());
      router.refresh();
    });
  };

  const toggle = (url: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {usedToday}/{dailyCap} today · {usedThisMonth}/{monthlyCap} this month.
        Every search counts against the ledger; results are leads (URL and title
        only).
      </p>
      <div className="flex gap-2">
        <input
          className={FIELD}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="tattoo studio chiang mai site:instagram.com"
        />
        <button
          type="button"
          onClick={search}
          disabled={pending || !query.trim()}
          className="shrink-0 rounded-md bg-foreground px-4 py-2 text-sm text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          Search
        </button>
      </div>
      {leads ? (
        leads.length === 0 ? (
          <p className="text-sm text-muted-foreground">No results.</p>
        ) : (
          <div className="space-y-2">
            <ul className="max-h-64 space-y-1 overflow-y-auto">
              {leads.map((l) => (
                <li key={l.url}>
                  <label className="flex cursor-pointer items-start gap-2 rounded-md p-1.5 text-sm hover:bg-muted/30">
                    <input
                      type="checkbox"
                      checked={selected.has(l.url)}
                      onChange={() => toggle(l.url)}
                      className="mt-1"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-foreground">
                        {l.title}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {l.url}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={store}
              disabled={pending || selected.size === 0}
              className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted/30 disabled:opacity-50"
            >
              Store {selected.size} selected as candidates
            </button>
          </div>
        )
      ) : null}
      {message ? (
        <p className="text-xs text-muted-foreground">{message}</p>
      ) : null}
      {error ? <p className="text-xs text-brand-red">{error}</p> : null}
    </div>
  );
}

function OvertureLane({ areaId }: { areaId: string }) {
  const router = useRouter();
  const [raw, setRaw] = useState("");
  const [fileLabel, setFileLabel] = useState("");
  const [preview, setPreview] = useState<AnnotatedOvertureCandidate[] | null>(
    null,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const runPreview = () => {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await previewOvertureImportAction(areaId, raw);
      if (result.error) {
        setError(result.error);
        return;
      }
      setPreview(result.rows ?? []);
    });
  };

  const commit = () => {
    setError(null);
    startTransition(async () => {
      const result = await commitOvertureImportAction(
        areaId,
        raw,
        fileLabel || null,
      );
      if (result.error) {
        setError(result.error);
        return;
      }
      setMessage(
        `Stored ${result.stored}. Skipped ${result.duplicates} already collected.${
          result.failed ? ` ${result.failed} failed to save.` : ""
        }`,
      );
      setPreview(null);
      setRaw("");
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Paste the JSON from scripts/overture-tattoo-extract.cjs. Preview first;
        nothing is stored until you commit.
      </p>
      <textarea
        className={FIELD}
        rows={4}
        value={raw}
        onChange={(e) => {
          setRaw(e.target.value);
          setPreview(null);
        }}
        placeholder='[{"id": "…", "name": "…", "latitude": 0, "longitude": 0}]'
      />
      <input
        className={FIELD}
        value={fileLabel}
        onChange={(e) => setFileLabel(e.target.value)}
        placeholder="File label for the run log (optional)"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={runPreview}
          disabled={pending || !raw.trim()}
          className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted/30 disabled:opacity-50"
        >
          Preview
        </button>
        {preview ? (
          <button
            type="button"
            onClick={commit}
            disabled={pending}
            className="rounded-md bg-foreground px-4 py-2 text-sm text-background transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            Commit {preview.length} candidates
          </button>
        ) : null}
      </div>
      {preview ? (
        <ul className="max-h-64 space-y-1 overflow-y-auto">
          {preview.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md p-1.5 text-sm"
            >
              <span className="min-w-0 truncate text-foreground">
                {row.name}
                {row.category ? (
                  <span className="text-xs text-muted-foreground">
                    {" "}
                    · {row.category}
                  </span>
                ) : null}
              </span>
              {row.annotation ? (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    row.annotation.confidence === "possible"
                      ? "bg-muted text-muted-foreground"
                      : "bg-brand-red/15 text-brand-red"
                  }`}
                >
                  {row.annotation.confidence === "clear"
                    ? "Clear duplicate"
                    : row.annotation.confidence === "likely"
                      ? "Likely duplicate"
                      : "Possible duplicate"}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {message ? (
        <p className="text-xs text-muted-foreground">{message}</p>
      ) : null}
      {error ? <p className="text-xs text-brand-red">{error}</p> : null}
    </div>
  );
}

function ManualLane({ areaId }: { areaId: string }) {
  const router = useRouter();
  const [sourceUrl, setSourceUrl] = useState("");
  const [name, setName] = useState("");
  const [candidateType, setCandidateType] = useState("tattoo_studio");
  const [context, setContext] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await addManualCandidateAction(areaId, {
        sourceUrl,
        name,
        candidateType,
        sourceContext: context || null,
        notes: notes || null,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setMessage("Candidate saved.");
      setSourceUrl("");
      setName("");
      setContext("");
      setNotes("");
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Manual only: you find the profile in the browser, you type it in. No
        scraping, no automation.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
          <label className={LABEL} htmlFor="man-url">
            Instagram or profile link
          </label>
          <input
            id="man-url"
            className={FIELD}
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://instagram.com/studioname"
          />
        </div>
        <div className="space-y-1">
          <label className={LABEL} htmlFor="man-name">
            Name
          </label>
          <input
            id="man-name"
            className={FIELD}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <span className={LABEL}>Type</span>
          <SelectInput
            options={TYPE_OPTIONS}
            value={candidateType}
            onChange={(e) => setCandidateType(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label className={LABEL} htmlFor="man-context">
            How you found it
          </label>
          <input
            id="man-context"
            className={FIELD}
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="Hashtag, location search, artist mention"
          />
        </div>
        <div className="space-y-1">
          <label className={LABEL} htmlFor="man-notes">
            Notes
          </label>
          <input
            id="man-notes"
            className={FIELD}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="rounded-md bg-foreground px-4 py-2 text-sm text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Add candidate"}
        </button>
        {message ? (
          <p className="text-xs text-muted-foreground">{message}</p>
        ) : null}
        {error ? <p className="text-xs text-brand-red">{error}</p> : null}
      </div>
    </div>
  );
}

export default function SeedLanes({
  areaId,
  braveConfigured,
  braveUsedToday,
  braveDailyCap,
  braveUsedThisMonth,
  braveMonthlyCap,
}: {
  areaId: string;
  braveConfigured: boolean;
  braveUsedToday: number;
  braveDailyCap: number;
  braveUsedThisMonth: number;
  braveMonthlyCap: number;
}) {
  const [lane, setLane] = useState<"brave" | "overture" | "manual">("manual");

  return (
    <section className="space-y-4 rounded-2xl border border-border p-4">
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["manual", "Instagram (manual)"],
            ["overture", "Overture import"],
            ["brave", "Brave search"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setLane(key)}
            aria-pressed={lane === key}
            className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
              lane === key
                ? "border-foreground bg-foreground text-background"
                : "border-border text-foreground hover:bg-muted/30"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {lane === "manual" ? <ManualLane areaId={areaId} /> : null}
      {lane === "overture" ? <OvertureLane areaId={areaId} /> : null}
      {lane === "brave" ? (
        <BraveLane
          areaId={areaId}
          configured={braveConfigured}
          usedToday={braveUsedToday}
          dailyCap={braveDailyCap}
          usedThisMonth={braveUsedThisMonth}
          monthlyCap={braveMonthlyCap}
        />
      ) : null}
    </section>
  );
}
