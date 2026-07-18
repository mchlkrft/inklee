"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { coverageControlAction, createCoverageRunAction } from "../actions";

export default function CoverageControls({
  runId,
  status,
}: {
  runId: string;
  status: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const act = (control: "pause" | "resume" | "cancel" | "retry" | "tick") => {
    setError(null);
    startTransition(async () => {
      const result = await coverageControlAction(runId, control);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  const active = [
    "created",
    "discovering",
    "processing_candidates",
    "paused_budget",
    "paused_rate_limit",
  ].includes(status);

  const button =
    "rounded-md border border-border px-2 py-1 text-xs text-foreground transition-colors hover:bg-muted/30 disabled:opacity-50";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {active ? (
        <>
          <button
            type="button"
            onClick={() => act("tick")}
            disabled={pending}
            className={button}
          >
            Run a tick now
          </button>
          <button
            type="button"
            onClick={() => act("pause")}
            disabled={pending}
            className={button}
          >
            Pause
          </button>
        </>
      ) : null}
      {["paused", "paused_budget", "paused_rate_limit"].includes(status) ? (
        <button
          type="button"
          onClick={() => act("resume")}
          disabled={pending}
          className={button}
        >
          Resume
        </button>
      ) : null}
      {status === "completed_with_gaps" || status === "blocked" ? (
        <button
          type="button"
          onClick={() => act("retry")}
          disabled={pending}
          className={button}
        >
          Retry failed units
        </button>
      ) : null}
      {!["completed", "completed_with_gaps", "failed", "cancelled"].includes(
        status,
      ) ? (
        <button
          type="button"
          onClick={() => act("cancel")}
          disabled={pending}
          className={button}
        >
          Cancel
        </button>
      ) : null}
      {error ? <span className="text-xs text-brand-red">{error}</span> : null}
    </div>
  );
}

export function CoverageRunForm() {
  const router = useRouter();
  const [scope, setScope] = useState<
    "pilot" | "regional" | "nationwide" | "gap_fill"
  >("pilot");
  const [mode, setMode] = useState<"planning" | "discovery" | "import">(
    "planning",
  );
  const [region, setRegion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const create = () => {
    setError(null);
    startTransition(async () => {
      const result = await createCoverageRunAction(
        "DE",
        scope,
        mode,
        scope === "regional" ? region.trim() || null : null,
      );
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <section className="space-y-2 rounded-2xl border border-border p-4">
      <h2 className="text-sm font-semibold text-foreground">Start a run</h2>
      <p className="text-xs text-muted-foreground">
        Planning projects tasks and cost with no external calls. Discovery runs
        real discovery without profile writes. Import executes the full
        pipeline. Pilot units are selected deterministically; no city list to
        maintain.
      </p>
      <div className="flex flex-wrap gap-2">
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value as typeof scope)}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground"
        >
          <option value="pilot">Pilot (representative sample)</option>
          <option value="regional">Regional (one state)</option>
          <option value="nationwide">Nationwide</option>
          <option value="gap_fill">Gap fill</option>
        </select>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as typeof mode)}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground"
        >
          <option value="planning">Planning dry run</option>
          <option value="discovery">Discovery dry run</option>
          <option value="import">Full import</option>
        </select>
        {scope === "regional" ? (
          <input
            type="text"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            placeholder="State code (e.g. 09)"
            className="w-32 rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground"
          />
        ) : null}
        <button
          type="button"
          onClick={create}
          disabled={pending}
          className="rounded-md bg-foreground px-3 py-1.5 text-xs text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Starting…" : "Start Germany run"}
        </button>
      </div>
      {error ? <p className="text-xs text-brand-red">{error}</p> : null}
    </section>
  );
}
