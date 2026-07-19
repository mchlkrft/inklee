"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  STUDIO_SIGNAL_LABELS,
  STUDIO_SIGNAL_TYPES,
  type StudioSignalType,
} from "@inklee/shared/studio-signals";
import { postStudioSignalAction, withdrawStudioSignalAction } from "./actions";

export default function SignalCard({
  active,
  published,
}: {
  active: {
    id: string;
    signalType: StudioSignalType;
    expiresAt: string;
  } | null;
  published: boolean;
}) {
  const router = useRouter();
  const [type, setType] = useState<StudioSignalType>(STUDIO_SIGNAL_TYPES[0]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const post = () => {
    setError(null);
    startTransition(async () => {
      const result = await postStudioSignalAction(type);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  const withdraw = () => {
    if (!active) return;
    setError(null);
    startTransition(async () => {
      const result = await withdrawStudioSignalAction(active.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <section className="space-y-2 rounded-2xl border border-border p-5">
      <h2 className="text-sm font-semibold text-foreground">
        Temporary signal
      </h2>
      <p className="text-xs text-muted-foreground">
        A short-lived note on your map pin (visible when artists zoom in) and on
        your studio page. Artists watching your studio get notified in their
        feed. One signal per month; it disappears by itself after two weeks.
      </p>
      {active ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-brand-rosa/20 px-2.5 py-1 text-xs text-brand-rosa">
            {STUDIO_SIGNAL_LABELS[active.signalType]}
          </span>
          <span className="text-xs text-muted-foreground">
            Live until{" "}
            {new Date(active.expiresAt).toLocaleDateString(undefined, {
              day: "numeric",
              month: "short",
            })}
          </span>
          <button
            type="button"
            onClick={withdraw}
            disabled={pending}
            className="rounded-md border border-border px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-muted/30 disabled:opacity-50"
          >
            Take it down
          </button>
        </div>
      ) : published ? (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as StudioSignalType)}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground"
          >
            {STUDIO_SIGNAL_TYPES.map((t) => (
              <option key={t} value={t}>
                {STUDIO_SIGNAL_LABELS[t]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={post}
            disabled={pending}
            className="rounded-md bg-foreground px-3 py-1.5 text-xs text-background transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Posting…" : "Post signal"}
          </button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Publish your studio first, then you can post signals.
        </p>
      )}
      {error ? <p className="text-xs text-brand-red">{error}</p> : null}
    </section>
  );
}
