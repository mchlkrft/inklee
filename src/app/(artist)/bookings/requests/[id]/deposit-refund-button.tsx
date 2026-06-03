"use client";

import { useState, useTransition } from "react";
import { refundDeposit } from "../../actions";

export default function DepositRefundButton({
  bookingId,
  amountEur,
}: {
  bookingId: string;
  amountEur: number | null;
}) {
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountLabel = amountEur !== null ? ` EUR ${amountEur.toFixed(2)}` : "";

  if (!confirm) {
    return (
      <div className="space-y-1">
        <button
          type="button"
          onClick={() => setConfirm(true)}
          className="w-full rounded-full border border-border px-5 py-2 text-sm text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
        >
          Refund deposit
        </button>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-destructive/50 p-3">
      <p className="text-sm text-foreground">
        Refund{amountLabel} to the client?
      </p>
      <p className="text-xs text-muted-foreground">
        The full deposit is returned to the client. Inklee returns its platform
        fee. Stripe does not return its card-processing fee; that cost stays on
        your Stripe account.
      </p>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const result = await refundDeposit(bookingId);
              if (result && "error" in result) {
                setError(result.error);
                setConfirm(false);
              }
            })
          }
          className="rounded-full bg-destructive px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {pending ? "Refunding…" : "Yes, refund"}
        </button>
        <button
          type="button"
          onClick={() => setConfirm(false)}
          className="rounded-full border border-border px-4 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
