"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { refundPaymentRequestAction } from "../actions";

// Full-refund control on the request detail (slice 2b-iv). Two-step confirm
// because it moves money. Case is voluntary_full (a full return to the client);
// partial / by-line / artist-cancellation refunds come with a fuller form later.
// The core (with the M5/M11 fixes) computes the amount + fee handling from stored
// transaction state; this only chooses "full" + a permitted case.
export function RefundControl({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const refund = () => {
    setError(null);
    startTransition(async () => {
      const r = await refundPaymentRequestAction({
        id: requestId,
        refundType: "full",
        case: "voluntary_full",
      });
      if (!r.ok) {
        setError(r.error);
        setConfirming(false);
        return;
      }
      setConfirming(false);
      router.refresh();
    });
  };

  return (
    <div className="space-y-2">
      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/[0.04] px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">
            Return the full amount to the client?
          </span>
          <button
            type="button"
            disabled={pending}
            onClick={refund}
            className="rounded-lg border border-destructive/40 px-3 py-1.5 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/[0.06] disabled:opacity-60"
          >
            {pending ? "Refunding..." : "Confirm refund"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setConfirming(false)}
            className="text-xs text-muted-foreground underline disabled:opacity-60"
          >
            Keep it
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Refund in full
        </button>
      )}
    </div>
  );
}
