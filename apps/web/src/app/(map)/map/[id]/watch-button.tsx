"use client";

import { useState, useTransition } from "react";
import { toggleWatchAction } from "../actions";

export default function WatchButton({
  mapLocationId,
  initialWatched,
}: {
  mapLocationId: string;
  initialWatched: boolean;
}) {
  const [watched, setWatched] = useState(initialWatched);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    setError(null);
    startTransition(async () => {
      const result = await toggleWatchAction(mapLocationId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setWatched(Boolean(result.watched));
    });
  };

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={watched}
        className="rounded-md bg-foreground px-3 py-1.5 text-xs text-background transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {watched ? "Watching ✓" : "Watch this place"}
      </button>
      {error ? <span className="text-xs text-brand-red">{error}</span> : null}
    </span>
  );
}
