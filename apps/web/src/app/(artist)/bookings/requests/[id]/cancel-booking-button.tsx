"use client";

import { useState, useTransition } from "react";
import { cancelBooking } from "../../actions";
import { formatPrice } from "@/lib/goods";

/**
 * Artist-initiated cancellation (D-f, P0-2). When the artist cancels, the client
 * is made whole: a paid card deposit is fully refunded automatically (the action
 * handles the Stripe refund + fee return), and a live unpaid intent is cancelled.
 * The consequence is spelled out before the artist confirms.
 */
export default function CancelBookingButton({
  bookingId,
  refundsDeposit,
  amountEur,
  currency = "eur",
}: {
  bookingId: string;
  refundsDeposit: boolean;
  amountEur: number | null;
  currency?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountLabel =
    amountEur !== null ? ` ${formatPrice(amountEur, currency)}` : "";

  if (!confirm) {
    return (
      <div className="space-y-1">
        <button
          type="button"
          onClick={() => setConfirm(true)}
          className="w-full rounded-full border border-border px-5 py-2 text-sm text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
        >
          Cancel booking
        </button>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-destructive/50 p-3">
      <p className="text-sm text-foreground">Cancel this booking?</p>
      <p className="text-xs text-muted-foreground">
        {refundsDeposit
          ? `The client's${amountLabel} deposit is refunded in full (Inklee returns its fee; Stripe's card-processing fee stays on your account). The slot is reopened and the client is notified.`
          : "The slot is reopened and the client is notified."}
      </p>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const result = await cancelBooking(bookingId);
              if (result && "error" in result) {
                setError(result.error);
                setConfirm(false);
              }
            })
          }
          className="rounded-full bg-destructive px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {pending ? "Cancelling…" : "Yes, cancel booking"}
        </button>
        <button
          type="button"
          onClick={() => setConfirm(false)}
          className="rounded-full border border-border px-4 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Keep it
        </button>
      </div>
    </div>
  );
}
