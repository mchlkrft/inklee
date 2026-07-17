"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { DuplicateSignals } from "@inklee/shared/map-directory";
import { dismissDuplicateSuggestionAction } from "../actions";

export type SuggestionRow = {
  id: string;
  confidence: string;
  signals: DuplicateSignals;
  createdAt: string;
  a: { id: string; name: string; place: string; moderation: string };
  b: { id: string; name: string; place: string; moderation: string };
};

const CONFIDENCE_TINT: Record<string, string> = {
  clear: "bg-brand-red/15 text-brand-red",
  likely: "bg-brand-mustard/20 text-brand-mustard",
  possible: "bg-muted text-muted-foreground",
};

function signalSummary(s: DuplicateSignals): string {
  const parts: string[] = [];
  if (s.sameInstagram) parts.push("same Instagram");
  if (s.sameWebsite) parts.push("same website");
  if (s.sameAddress) parts.push("same address");
  if (s.distanceM < 100000) parts.push(`${s.distanceM} m apart`);
  if (s.nameSimilarity >= 0.4)
    parts.push(`name ${Math.round(s.nameSimilarity * 100)}% similar`);
  return parts.join(" · ");
}

export default function DuplicatesQueue({ rows }: { rows: SuggestionRow[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const dismiss = (id: string) => {
    setError(null);
    startTransition(async () => {
      const result = await dismissDuplicateSuggestionAction(id);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        No open duplicate suggestions. The detector runs on every create and
        edit; suggestions land here.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error ? <p className="text-sm text-brand-red">{error}</p> : null}
      {rows.map((r) => (
        <div
          key={r.id}
          className="space-y-2 rounded-md border border-border p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${CONFIDENCE_TINT[r.confidence] ?? "bg-muted text-muted-foreground"}`}
            >
              {r.confidence} duplicate
            </span>
            <span className="text-xs text-muted-foreground">
              {new Date(r.createdAt).toLocaleDateString()}
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {[r.a, r.b].map((loc) => (
              <Link
                key={loc.id}
                href={`/admin/map/${loc.id}`}
                className="rounded-md border border-border p-3 transition-colors hover:bg-muted/30"
              >
                <p className="text-sm font-medium text-foreground">
                  {loc.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {loc.place}
                  {loc.moderation !== "approved" ? ` · ${loc.moderation}` : ""}
                </p>
              </Link>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {signalSummary(r.signals)}
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() => dismiss(r.id)}
            className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            Not duplicates, dismiss
          </button>
        </div>
      ))}
    </div>
  );
}
