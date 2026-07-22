"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  markLocationPossiblyClosedAction,
  setReportStatusAction,
} from "../actions";

export type ReportRow = {
  id: string;
  targetLabel: string;
  targetType: string;
  reason: string;
  detail: string | null;
  status: string;
  createdAt: string;
};

export default function ReportsQueue({ rows }: { rows: ReportRow[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const act = (id: string, status: "reviewed" | "dismissed") => {
    setError(null);
    startTransition(async () => {
      const result = await setReportStatusAction(id, status);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  const markClosed = (id: string) => {
    setError(null);
    startTransition(async () => {
      const result = await markLocationPossiblyClosedAction(id);
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
        No reports yet. User-facing reporting ships in Phase 7; this queue is
        ready for it.
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
            <div>
              <p className="text-sm font-medium text-foreground">
                {r.targetLabel}
              </p>
              <p className="text-xs text-muted-foreground">
                {r.targetType} · {r.reason.replace(/_/g, " ")} ·{" "}
                {new Date(r.createdAt).toLocaleDateString()}
              </p>
            </div>
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${
                r.status === "new"
                  ? "bg-brand-mustard/20 text-brand-mustard"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {r.status}
            </span>
          </div>
          {r.detail ? (
            <p className="text-sm text-muted-foreground">{r.detail}</p>
          ) : null}
          {r.status === "new" ? (
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => act(r.id, "reviewed")}
                className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted/30 disabled:opacity-50"
              >
                Mark reviewed
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => act(r.id, "dismissed")}
                className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/30 disabled:opacity-50"
              >
                Dismiss
              </button>
              {r.targetType === "location" &&
              (r.reason === "closed" || r.reason === "outdated_details") ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => markClosed(r.id)}
                  className="rounded-md border border-brand-red/40 px-3 py-1.5 text-xs text-brand-red transition-colors hover:bg-brand-red/10 disabled:opacity-50"
                >
                  Mark possibly closed
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
