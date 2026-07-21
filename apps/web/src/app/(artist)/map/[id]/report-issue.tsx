"use client";

import { useState, useTransition } from "react";
import {
  MAP_CORRECTION_REASONS,
  MAP_CORRECTION_REASON_LABELS,
} from "@inklee/shared/map-directory";
import { submitMapCorrection } from "../actions";

// Crowd-sourced freshness: any signed-in artist can flag a listing that has
// moved, closed, or gone stale. Collapsed by default so it never competes
// with the claim CTA; opens into a reason + optional note.
export default function ReportIssue({
  mapLocationId,
}: {
  mapLocationId: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>(MAP_CORRECTION_REASONS[0]);
  const [detail, setDetail] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (done) {
    return (
      <p className="text-xs text-muted-foreground">
        Thanks. We will take a look and update the listing.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      >
        Report an issue with this listing
      </button>
    );
  }

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await submitMapCorrection(mapLocationId, reason, detail);
      if (result.error) {
        setError(result.error);
        return;
      }
      setDone(true);
    });
  };

  return (
    <div className="space-y-2 rounded-2xl border border-border p-4">
      <p className="text-sm font-medium text-foreground">
        Report an issue with this listing
      </p>
      <select
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
      >
        {MAP_CORRECTION_REASONS.map((r) => (
          <option key={r} value={r}>
            {MAP_CORRECTION_REASON_LABELS[r]}
          </option>
        ))}
      </select>
      <textarea
        value={detail}
        onChange={(e) => setDetail(e.target.value.slice(0, 500))}
        placeholder="Anything that helps, like the correct address (optional)."
        rows={3}
        className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
      />
      {error ? <p className="text-xs text-brand-red">{error}</p> : null}
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={submit}
          className="rounded-md bg-foreground px-3 py-1.5 text-xs text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Sending…" : "Send correction"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
