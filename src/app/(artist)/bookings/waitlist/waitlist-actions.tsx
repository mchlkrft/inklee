"use client";

import { useTransition } from "react";
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

  if (status === "converted" || status === "dismissed") return null;

  return (
    <div className="flex items-center gap-2 shrink-0">
      {status === "waiting" && (
        <button
          onClick={() => startTransition(() => markWaitlistContacted(entryId))}
          disabled={pending}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          contacted
        </button>
      )}
      <button
        onClick={() =>
          startTransition(() => {
            void convertWaitlistEntry({
              entryId,
              customerEmail,
              customerHandle,
              note,
            });
          })
        }
        disabled={pending}
        className="text-xs text-foreground hover:text-muted-foreground transition-colors disabled:opacity-50"
      >
        convert
      </button>
      <button
        onClick={() => startTransition(() => dismissWaitlistEntry(entryId))}
        disabled={pending}
        className="text-xs text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
      >
        dismiss
      </button>
    </div>
  );
}
