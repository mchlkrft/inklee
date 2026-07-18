"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  SEED_AREA_STATUSES,
  SEED_AREA_STATUS_LABELS,
} from "@inklee/shared/map-seeding";
import { setSeedAreaStatusAction } from "../actions";

export default function AreaStatus({
  areaId,
  status,
}: {
  areaId: string;
  status: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const setStatus = (next: string) => {
    if (next === status) return;
    setError(null);
    startTransition(async () => {
      const result = await setSeedAreaStatusAction(areaId, next);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {SEED_AREA_STATUSES.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => setStatus(s)}
          disabled={pending}
          aria-pressed={status === s}
          className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
            status === s
              ? "border-foreground bg-foreground text-background"
              : "border-border text-foreground hover:bg-muted/30"
          }`}
        >
          {SEED_AREA_STATUS_LABELS[s]}
        </button>
      ))}
      {error ? <span className="text-xs text-brand-red">{error}</span> : null}
    </span>
  );
}
