"use client";

import { useState, useTransition } from "react";
import {
  markWaitlistContacted,
  convertWaitlistEntry,
  dismissWaitlistEntry,
} from "@/app/(artist)/bookings/actions";

export default function WaitlistActions({
  entryId,
  status,
  customerEmail,
  customerHandle,
  note,
}: {
  entryId: string;
  status: string;
  customerEmail: string;
  customerHandle: string;
  note: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (status === "converted" || status === "dismissed") return null;

  const run = (action: () => Promise<{ error: string } | { success: true }>) =>
    startTransition(async () => {
      setError(null);
      const result = await action();
      if ("error" in result) setError(result.error);
    });

  return (
    <div className="flex flex-col gap-1 sm:items-end sm:shrink-0">
      <div className="flex flex-wrap items-center gap-3 sm:gap-2">
        {status === "waiting" && (
          <button
            onClick={() => run(() => markWaitlistContacted(entryId))}
            disabled={pending}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            Mark contacted
          </button>
        )}
        <button
          onClick={() =>
            run(() =>
              convertWaitlistEntry({
                entryId,
                customerEmail,
                customerHandle,
                note,
              }),
            )
          }
          disabled={pending}
          className="text-xs text-foreground hover:text-muted-foreground transition-colors disabled:opacity-50"
        >
          Move to booking
        </button>
        <button
          onClick={() => run(() => dismissWaitlistEntry(entryId))}
          disabled={pending}
          className="text-xs text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
        >
          Dismiss
        </button>
      </div>
      {error && (
        <p className="text-xs text-destructive sm:text-right" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
