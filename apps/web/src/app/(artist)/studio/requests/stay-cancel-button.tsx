"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { studioCancelStayAction } from "../actions";

export default function StayCancelButton({ stayId }: { stayId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const cancel = () => {
    setError(null);
    startTransition(async () => {
      const result = await studioCancelStayAction(stayId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setConfirming(false);
      router.refresh();
    });
  };

  return (
    <span className="inline-flex items-center gap-2">
      {confirming ? (
        <>
          <button
            type="button"
            onClick={cancel}
            disabled={pending}
            className="rounded-md bg-brand-red px-3 py-1.5 text-xs text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            Yes, cancel
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={pending}
            className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted/30"
          >
            Keep it
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={pending}
          className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted/30"
        >
          Cancel stay
        </button>
      )}
      {error ? <span className="text-xs text-brand-red">{error}</span> : null}
    </span>
  );
}
